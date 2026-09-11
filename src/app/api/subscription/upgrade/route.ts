import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasProAccess } from "@/lib/entitlement";
import { calculateUpgradeProration } from "@/lib/proration";
import { chargeProrationDirect, cancelFlutterwaveSubscription } from "@/lib/flutterwave/client";
import { PLANS } from "@/config/plans";

// Upgrade Monthly → Yearly (FR-24–FR-26), immediate with proration.
// See .agents/rules/skills/implement-upgrade-flow.md.

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "User is not authenticated." } }, { status: 401 });
    }

    const subscription = await db.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription || !hasProAccess(subscription) || subscription.interval !== "MONTHLY") {
      return NextResponse.json(
        { error: { code: "INVALID_UPGRADE_STATE", message: "Only active Pro Monthly subscribers can upgrade to Yearly." } },
        { status: 400 },
      );
    }

    const start = subscription.currentPeriodStart || new Date();
    const end = subscription.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const proratedAmountMinorUnits = calculateUpgradeProration({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      now: new Date(),
      monthlyPriceMinorUnits: PLANS.PRO_MONTHLY.priceMinorUnits,
      yearlyPriceMinorUnits: PLANS.PRO_YEARLY.priceMinorUnits,
    });

    return NextResponse.json({
      proratedAmountMinorUnits,
      currency: "usd",
      currentPlan: "PRO_MONTHLY",
      targetPlan: "PRO_YEARLY",
    });
  } catch (error) {
    console.error("Error previewing upgrade proration:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to calculate proration preview." } },
      { status: 500 },
    );
  }
}

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "User is not authenticated." } }, { status: 401 });
    }

    const subscription = await db.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription || !hasProAccess(subscription) || subscription.interval !== "MONTHLY") {
      return NextResponse.json(
        { error: { code: "INVALID_UPGRADE_STATE", message: "Only active Pro Monthly subscribers can upgrade to Yearly." } },
        { status: 400 },
      );
    }

    const start = subscription.currentPeriodStart || new Date();
    const end = subscription.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Calculate exact proration charge (FR-24, Rule 8)
    const proratedAmountMinorUnits = calculateUpgradeProration({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      now: new Date(),
      monthlyPriceMinorUnits: PLANS.PRO_MONTHLY.priceMinorUnits,
      yearlyPriceMinorUnits: PLANS.PRO_YEARLY.priceMinorUnits,
    });

    const txRef = `upgrade_${user.id}_${Date.now()}`;

    // Execute direct charge on customer payment method (FR-25)
    let chargeResult;
    try {
      chargeResult = await chargeProrationDirect({
        customerEmail: subscription.flutterwaveCustomerEmail || user.email,
        amountMinorUnits: proratedAmountMinorUnits,
        currency: "usd",
        txRef,
      });
    } catch (chargeErr) {
      console.error("Proration direct charge failed:", chargeErr);
      // Leave Subscription state untouched on failure (FR-21)
      return NextResponse.json(
        { error: { code: "CHARGE_FAILED", message: "Failed to charge prorated upgrade amount." } },
        { status: 502 },
      );
    }

    // Cancel old Monthly plan in Flutterwave
    if (subscription.flutterwaveSubscriptionId) {
      try {
        await cancelFlutterwaveSubscription(subscription.flutterwaveSubscriptionId);
      } catch (cancelOldErr) {
        console.warn("Could not cancel old monthly subscription on provider:", cancelOldErr);
      }
    }

    const now = new Date();
    const newPeriodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const newSubId = `flw_sub_yearly_${chargeResult.transactionId}`;

    // Update Subscription to Pro Yearly immediately (FR-25)
    const updatedSub = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: "PRO",
        interval: "YEARLY",
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: newPeriodEnd,
        cancelAtPeriodEnd: false,
        pendingInterval: null,
        pendingEffectiveAt: null,
        flutterwaveSubscriptionId: newSubId,
      },
    });

    // Record proration charge as distinct PaymentEvent (FR-26, Rule 8, Rule 9)
    await db.paymentEvent.create({
      data: {
        userId: user.id,
        subscriptionId: updatedSub.id,
        eventType: "FULFILLMENT",
        provider: "FLUTTERWAVE",
        providerReference: txRef,
        providerEventId: `proration_${chargeResult.transactionId}`,
        amount: proratedAmountMinorUnits, // Integer minor units (Rule 8)
        currency: "usd",
        status: chargeResult.status,
        rawPayload: {
          upgradeType: "MONTHLY_TO_YEARLY",
          proratedAmountMinorUnits,
          transactionId: chargeResult.transactionId,
          timestamp: now.toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      plan: "PRO",
      interval: "YEARLY",
      proratedChargedMinorUnits: proratedAmountMinorUnits,
      currentPeriodEnd: newPeriodEnd.toISOString(),
    });
  } catch (error) {
    console.error("Unhandled error in upgrade route:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred during upgrade." } },
      { status: 500 },
    );
  }
}
