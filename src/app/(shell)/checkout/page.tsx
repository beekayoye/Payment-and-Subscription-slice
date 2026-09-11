import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasProAccess } from "@/lib/entitlement";
import { CheckoutClient } from "@/components/CheckoutClient";
import type { PlanId } from "@/config/plans";

// Checkout Initiation UI (FR-8–FR-11).
// Only reachable for Free → Monthly or Free → Yearly transition. Active Pro users redirect to Billing.

interface CheckoutPageProps {
  searchParams: Promise<{ plan?: string }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Check if user already has an active Pro subscription (FR-8)
  const subscription = await db.subscription.findUnique({
    where: { userId: user.id },
  });

  if (hasProAccess(subscription)) {
    redirect("/billing");
  }

  const resolvedParams = await searchParams;
  const rawPlan = resolvedParams.plan;
  const initialPlanId: PlanId = rawPlan === "PRO_YEARLY" ? "PRO_YEARLY" : "PRO_MONTHLY";

  return <CheckoutClient initialPlanId={initialPlanId} userEmail={user.email} />;
}
