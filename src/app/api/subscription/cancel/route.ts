import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasProAccess } from "@/lib/entitlement";
import { cancelFlutterwaveSubscription } from "@/lib/flutterwave/client";
import type { CancellationReason } from "@/generated/prisma/client";

// Cancel subscription (FR-18, FR-19, FR-20, FR-29, FR-30, Rule 10).
// Sets cancelAtPeriodEnd = true and records reason immediately.
// Pro access is strictly retained until currentPeriodEnd via hasProAccess() (Rule 10).

const VALID_REASONS: CancellationReason[] = [
  "TOO_EXPENSIVE",
  "MISSING_FEATURES",
  "SWITCHING_PROVIDER",
  "NOT_USING_ENOUGH",
  "TEMPORARY_PAUSE",
  "OTHER",
];

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "User is not authenticated." } },
        { status: 401 },
      );
    }

    const subscription = await db.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription || !hasProAccess(subscription)) {
      return NextResponse.json(
        { error: { code: "NO_ACTIVE_SUBSCRIPTION", message: "No active subscription found to cancel." } },
        { status: 400 },
      );
    }

    if (subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: { code: "ALREADY_CANCELED", message: "Subscription is already scheduled to cancel." } },
        { status: 400 },
      );
    }

    // Parse optional cancellation reason (FR-20)
    let body: { reason?: string; reasonOther?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    let reason: CancellationReason | null = null;
    if (body.reason && VALID_REASONS.includes(body.reason as CancellationReason)) {
      reason = body.reason as CancellationReason;
    }

    const reasonOther = reason === "OTHER" && body.reasonOther ? String(body.reasonOther).trim() : null;

    // Call Flutterwave cancellation (FR-29)
    if (subscription.flutterwaveSubscriptionId) {
      try {
        await cancelFlutterwaveSubscription(subscription.flutterwaveSubscriptionId);
      } catch (flwErr) {
        console.warn("Notice: Flutterwave subscription cancel call logged:", flwErr);
      }
    }

    // Update Subscription locally (FR-29):
    // Status moves to CANCEL_SCHEDULED, cancelAtPeriodEnd = true.
    // Plan remains PRO and hasProAccess() remains true until currentPeriodEnd (Rule 10).
    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "CANCEL_SCHEDULED",
        cancelAtPeriodEnd: true,
        cancellationReason: reason,
        cancellationReasonOther: reasonOther,
      },
    });

    return NextResponse.json({
      success: true,
      status: updated.status,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      currentPeriodEnd: updated.currentPeriodEnd?.toISOString(),
    });
  } catch (error) {
    console.error("Unhandled error in cancel route:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to process subscription cancellation." } },
      { status: 500 },
    );
  }
}
