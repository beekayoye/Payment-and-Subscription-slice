import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasProAccess } from "@/lib/entitlement";

// GET /api/subscription/status (PRD Section 7, FR-14, FR-17).
// Reads Subscription state only — never calls Flutterwave directly (Rule 3, Rule 4).
// Reads entitlement exclusively via hasProAccess() (FR-2a, Rule 2).

export async function GET(): Promise<NextResponse> {
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

    const isPro = hasProAccess(subscription);

    // Fetch latest payment event to check for FAILURE state during Return View polling (FR-16)
    const latestEvent = await db.paymentEvent.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        eventType: true,
        status: true,
        amount: true,
        currency: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      hasPro: isPro,
      subscription: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            interval: subscription.interval,
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
            pendingInterval: subscription.pendingInterval,
            pendingEffectiveAt: subscription.pendingEffectiveAt?.toISOString() ?? null,
            cancellationReason: subscription.cancellationReason,
          }
        : null,
      latestEvent,
    });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch subscription status." } },
      { status: 500 },
    );
  }
}
