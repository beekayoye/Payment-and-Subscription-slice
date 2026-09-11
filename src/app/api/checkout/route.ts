import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasProAccess } from "@/lib/entitlement";
import { checkCheckoutRateLimit } from "@/lib/rateLimit";
import { initiateFlutterwavePayment } from "@/lib/flutterwave/client";
import { PLANS, type PlanId } from "@/config/plans";

// Checkout initiation (FR-8, FR-9). Rate-limited via RateLimitBucket (FR-10, FR-32, Rule 14).

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Authenticate user
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "You must be signed in to checkout." } },
        { status: 401 },
      );
    }

    // 2. Client IP extraction
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    // 3. Rate limiting (FR-10, FR-32, Rule 14)
    const rateLimit = await checkCheckoutRateLimit(user.id, clientIp);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Too many attempts, please try again in ${rateLimit.retryAfterSeconds} seconds.`,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    // 4. Parse request payload
    const body = await req.json();
    const planId = body?.planId as PlanId;

    if (planId !== "PRO_MONTHLY" && planId !== "PRO_YEARLY") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PLAN",
            message: "Invalid plan selected. Must be PRO_MONTHLY or PRO_YEARLY.",
          },
        },
        { status: 400 },
      );
    }

    const planConfig = PLANS[planId];
    if (!planConfig) {
      return NextResponse.json(
        {
          error: {
            code: "PLAN_NOT_FOUND",
            message: "Selected plan does not exist in configuration.",
          },
        },
        { status: 404 },
      );
    }

    // 5. Existing subscription check (FR-8)
    const existingSubscription = await db.subscription.findUnique({
      where: { userId: user.id },
    });

    if (hasProAccess(existingSubscription)) {
      return NextResponse.json(
        {
          error: {
            code: "ALREADY_ACTIVE",
            message: "You already have an active subscription.",
          },
          redirectUrl: "/billing",
        },
        { status: 400 },
      );
    }

    // 6. Check for an INCOMPLETE-status checkout from within the last 10 minutes (FR-8)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentInitiation = await db.paymentEvent.findFirst({
      where: {
        userId: user.id,
        eventType: "INITIATION",
        createdAt: { gte: tenMinutesAgo },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentInitiation && recentInitiation.rawPayload && typeof recentInitiation.rawPayload === "object") {
      const payload = recentInitiation.rawPayload as Record<string, unknown>;

      // Only reuse a session that is genuinely still in flight. A Flutterwave
      // hosted link is single-use: once its transaction has been verified or
      // failed, the link is spent and sending the user back to it dead-ends
      // the payment path (G7). Reuse exists to absorb repeated clicks
      // (FR-8), not to resurrect a completed attempt.
      // Matched on timing rather than providerReference: an INITIATION row
      // stores the tx_ref, while webhook-sourced rows store the provider's
      // transaction id, so the two never compare equal.
      const alreadyConcluded = await db.paymentEvent.findFirst({
        where: {
          userId: user.id,
          eventType: { in: ["VERIFICATION", "FULFILLMENT", "FAILURE"] },
          createdAt: { gte: recentInitiation.createdAt },
        },
        select: { id: true },
      });

      if (!alreadyConcluded && payload.planId === planId && typeof payload.link === "string") {
        // Reuse existing in-flight session link (FR-8)
        return NextResponse.json({
          checkoutUrl: payload.link,
          reused: true,
        });
      }
    }

    // 7. Initiate Flutterwave payment (FR-9)
    const txRef = `tx_${user.id}_${Date.now()}`;
    const redirectUrl = new URL("/checkout/return", req.url).toString();

    let paymentResult;
    try {
      paymentResult = await initiateFlutterwavePayment({
        txRef,
        amountMinorUnits: planConfig.priceMinorUnits,
        currency: planConfig.currency,
        customerEmail: user.email,
        customerName: user.name,
        paymentPlanId: planConfig.flutterwavePlanId,
        redirectUrl,
        title: planConfig.id === "PRO_MONTHLY" ? "Pro Monthly Subscription" : "Pro Yearly Subscription",
        description: `Access to Pro tier billed ${planConfig.interval?.toLowerCase()}`,
      });
    } catch (paymentErr: unknown) {
      // Specific retry-capable error (FR-11)
      console.error("Flutterwave session creation failed:", paymentErr);
      return NextResponse.json(
        {
          error: {
            code: "PROVIDER_INITIATION_FAILED",
            message: "Unable to initiate payment with Flutterwave. Please try again.",
          },
        },
        { status: 502 },
      );
    }

    // 8. Record PaymentEvent with eventType: INITIATION (FR-9, FR-31, Rule 8, Rule 9)
    await db.paymentEvent.create({
      data: {
        userId: user.id,
        subscriptionId: existingSubscription?.id ?? null,
        eventType: "INITIATION",
        provider: "FLUTTERWAVE",
        providerReference: txRef,
        providerEventId: null, // Null for INITIATION rows (FR-31)
        amount: planConfig.priceMinorUnits, // Whole integer minor units (Rule 8)
        currency: planConfig.currency.toLowerCase(),
        status: "initiated",
        rawPayload: {
          planId,
          txRef,
          link: paymentResult.link,
          createdAt: new Date().toISOString(),
        },
      },
    });

    // Ensure a pending/incomplete subscription record exists if none exists yet
    if (!existingSubscription) {
      await db.subscription.create({
        data: {
          userId: user.id,
          plan: "FREE",
          interval: planConfig.interval,
          status: "INCOMPLETE",
          flutterwaveCustomerEmail: user.email,
        },
      });
    }

    return NextResponse.json({
      checkoutUrl: paymentResult.link,
      txRef,
    });
  } catch (error: unknown) {
    console.error("Unhandled error in checkout route:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while initiating checkout.",
        },
      },
      { status: 500 },
    );
  }
}
