// Plan / price / interval configuration — lives in app config, not a database
// table (PRD A3). Pricing is a test fixture chosen to make proration math
// verifiable by hand (PRD Section 8), not researched pricing.

export type PlanId = "FREE" | "PRO_MONTHLY" | "PRO_YEARLY";

export interface PlanConfig {
  id: PlanId;
  plan: "FREE" | "PRO";
  interval: "MONTHLY" | "YEARLY" | null;
  /** Whole integer, minor units (e.g. cents). Never a float. */
  priceMinorUnits: number;
  currency: string;
  /** Flutterwave Payment Plan ID, read from env. Null for the free plan. */
  flutterwavePlanId: string | null;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  FREE: {
    id: "FREE",
    plan: "FREE",
    interval: null,
    priceMinorUnits: 0,
    currency: "usd",
    flutterwavePlanId: null,
  },
  PRO_MONTHLY: {
    id: "PRO_MONTHLY",
    plan: "PRO",
    interval: "MONTHLY",
    priceMinorUnits: 900,
    currency: "usd",
    flutterwavePlanId: process.env.FLW_PLAN_MONTHLY ?? null,
  },
  PRO_YEARLY: {
    id: "PRO_YEARLY",
    plan: "PRO",
    interval: "YEARLY",
    priceMinorUnits: 9000,
    currency: "usd",
    flutterwavePlanId: process.env.FLW_PLAN_YEARLY ?? null,
  },
};
