import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasProAccess } from "@/lib/entitlement";
import { PlansClient } from "@/components/PlansClient";

// Plans View (FR-3–FR-7).
// Reads entitlement exclusively via hasProAccess() (FR-2a, Rule 2).

export default async function PlansPage() {
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
        plan: subscription.plan,
        interval: subscription.interval,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString() : null,
        pendingInterval: subscription.pendingInterval,
        pendingEffectiveAt: subscription.pendingEffectiveAt ? subscription.pendingEffectiveAt.toISOString() : null,
      }
    : null;

  return <PlansClient subscription={subscriptionDTO} isPro={isPro} />;
}
