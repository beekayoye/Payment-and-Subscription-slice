---
name: implement-upgrade-flow
description: Build the Monthly→Yearly upgrade path — proration calculation, confirmation, immediate charge. Use for /api/subscription/upgrade and /lib/proration.ts.
---

# Implement the upgrade flow (Monthly → Yearly)

Upgrade is **immediate**, unlike downgrade and cancel.

## Steps

1. **Calculate proration in `/lib/proration.ts` only** — this is the sole place the formula lives, so it can be unit-tested against Flutterwave's actual charge amount without spinning up a checkout flow. Formula: `remaining days ÷ total days × price difference` (daily proration, PRD A4), computed on the whole-integer minor-unit amounts — never floats.
2. **Show the exact prorated amount to the user for confirmation before charging.** Flutterwave does not calculate proration for you; this app is the only source of that number (FR-24, adapted from Stripe's invoice-preview — there is no equivalent Flutterwave preview call, so the number shown must come from step 1's calculation).
3. **On confirmation, `POST /api/subscription/upgrade`:**
   - Execute the calculated proration amount as an explicit **direct charge** against the customer's saved payment method.
   - Then cancel the old (Monthly) subscription and start the new (Yearly) subscription — Flutterwave subscriptions can't be modified in place.
   - This is applied right away, not deferred.
4. **Record the proration charge as its own `PaymentEvent`** with its own `providerEventId`, written when Flutterwave's corresponding webhook event arrives — see [log-payment-event.md](log-payment-event.md) (FR-26).
5. **If the upgrade API call fails**, the Billing View shows the specific error inline and leaves `Subscription` state unchanged — never optimistically update the UI before server confirmation (FR-21).

## Definition of done

- The proration number shown to the user and the amount actually charged match exactly (unit test comparing `/lib/proration.ts` output against the charge amount for the same inputs).
- No proration math exists inline in the route handler — it's imported from `/lib/proration.ts`.
- A failed upgrade charge leaves `Subscription.interval` untouched.

Satisfies: PRD FR-24, FR-25, FR-26, FR-21, G2. AGENTS.md Q2 proration row.
