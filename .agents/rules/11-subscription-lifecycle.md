# Subscription Lifecycle Rules

## State Transitions

A user's plan state is one of: **Free**, **Pro Monthly**, **Pro Yearly**.

### Subscribe (Free → Pro Monthly or Free → Pro Yearly)
- Entitlement granted ONLY via webhook-driven fulfilment, never from the redirect (FR-22).
- Fulfilment **upserts** on `userId` — creates on first subscribe, updates on resubscribe (FR-22).
- On fulfilment: `status = ACTIVE`, `plan = PRO`, `interval` from purchased plan, period dates from Flutterwave (FR-23).

### Upgrade (Monthly → Yearly)
- **Immediate**, with proration.
- Calculate proration ourselves: `remaining days ÷ total days × price difference` (PRD A4).
- Show exact prorated amount to user for confirmation before charging (FR-24).
- Execute as a direct charge, then cancel old subscription + start new one (FR-25).
- Proration charge recorded as its own `PaymentEvent` (FR-26).

### Downgrade (Yearly → Monthly)
- **Deferred to period end** — never immediate (FR-27, rule 11).
- Set `pendingInterval = MONTHLY` and `pendingEffectiveAt` locally for display (FR-27).
- Actual change executed by our application at the right time (Flutterwave has no schedule object).
- `Subscription.interval` only updated when the renewal confirms the new plan took effect (FR-28).
- If the scheduling mechanism fails, roll back the local `pendingInterval` write and show a retry-capable error (FR-27).

### Cancel
- On confirmation: cancel the subscription with Flutterwave (or set to cancel at period end).
- Set `cancelAtPeriodEnd = true`, store `cancellationReason` (+ optional `cancellationReasonOther`) immediately — does NOT wait for webhook (FR-29).
- **Access stays valid until `currentPeriodEnd`** (rule 10).
- When renewal webhook confirms cancellation: `status = CANCELED`, `plan = FREE` — row is updated, not deleted (FR-30, A16).

### Downgrade vs Cancel — distinct flows
- "Downgrade" = Yearly → Monthly (still paid). Uses the downgrade action.
- "Cancel" = any paid plan → Free. Uses the cancel action.
- These are separate UI flows with separate API routes (A10).

## Entitlement Function

`hasProAccess(subscription: Subscription | null): boolean` returns true ONLY when:
- `plan === 'PRO'` AND
- `status` is `ACTIVE` or `CANCEL_SCHEDULED`

This is the **only** function anywhere allowed to answer "does this user have Pro access" (FR-2a).

## Cancel Control Visibility

- Show Cancel only when `status = ACTIVE` AND `cancelAtPeriodEnd = false` (FR-18).
- Once cancellation is scheduled, the Cancel control **disappears** — no "Resume" action is in scope (A13).
