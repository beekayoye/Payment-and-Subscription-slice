import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasProAccess } from "@/lib/entitlement";
import { BillingClient } from "@/components/BillingClient";

// Billing View (FR-17–FR-21).
// Entitlement evaluated solely through hasProAccess() (FR-2a, Rule 2).

export default async function BillingPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in");
  }

  const subscription = await db.subscription.findUnique({
    where: { userId: user.id },
  });

  const isPro = hasProAccess(subscription);

  const subscriptionDTO = subscription
    ? {
        id: subscription.id,
        plan: subscription.plan,
        interval: subscription.interval,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodStart: subscription.currentPeriodStart ? subscription.currentPeriodStart.toISOString() : null,
        currentPeriodEnd: subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString() : null,
        pendingInterval: subscription.pendingInterval,
        pendingEffectiveAt: subscription.pendingEffectiveAt ? subscription.pendingEffectiveAt.toISOString() : null,
        cancellationReason: subscription.cancellationReason,
      }
    : null;

  return <BillingClient subscription={subscriptionDTO} isPro={isPro} userEmail={user.email} />;
}
