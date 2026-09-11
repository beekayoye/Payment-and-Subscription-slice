import type { Subscription } from "@/generated/prisma/client";

// The ONLY function anywhere in this codebase allowed to answer "does this
// user have Pro access" (PRD FR-2a, Section 7). Every screen, route handler,
// and middleware check must import and call this — never re-derive
// entitlement inline. See .agents/rules/skills/check-pro-access.md.
export function hasProAccess(subscription: Subscription | null): boolean {
  if (subscription === null) {
    return false;
  }

  return (
    subscription.plan === "PRO" &&
    (subscription.status === "ACTIVE" ||
      subscription.status === "CANCEL_SCHEDULED")
  );
}
