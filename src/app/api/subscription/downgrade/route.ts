import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasProAccess } from "@/lib/entitlement";

// Downgrade Yearly → Monthly (FR-27–FR-28), deferred to next renewal.
// Sets pendingInterval and pendingEffectiveAt locally (display-only).
// Does NOT change Subscription.interval immediately (Rule 11).

export async function POST(): Promise<NextResponse> {
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

    if (!subscription || !hasProAccess(subscription) || subscription.interval !== "YEARLY") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_DOWNGRADE_STATE",
            message: "Only active Pro Yearly subscribers can schedule a downgrade to Monthly.",
          },
        },
        { status: 400 },
      );
    }

    if (subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        {
          error: {
            code: "CANCEL_ALREADY_SCHEDULED",
            message: "Cannot schedule a downgrade on a subscription that is scheduled to cancel.",
          },
        },
        { status: 400 },
      );
    }

    // Set pendingInterval and pendingEffectiveAt. Subscription.interval remains YEARLY (Rule 11)
    const effectiveDate = subscription.currentPeriodEnd ?? new Date();

    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        pendingInterval: "MONTHLY",
        pendingEffectiveAt: effectiveDate,
      },
    });

    return NextResponse.json({
      success: true,
      pendingInterval: updated.pendingInterval,
      pendingEffectiveAt: updated.pendingEffectiveAt?.toISOString(),
      currentInterval: updated.interval, // Still YEARLY
    });
  } catch (error) {
    console.error("Unhandled error in downgrade route:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to schedule downgrade." } },
      { status: 500 },
    );
  }
}
