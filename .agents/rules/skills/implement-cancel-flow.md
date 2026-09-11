---
name: implement-cancel-flow
description: Build the cancel flow — confirmation step, optional reason capture, access retained until period end. Use for the Billing View's Cancel control and /api/subscription/cancel.
---

# Implement the cancel flow

Cancel means any paid plan → Free. It is a distinct flow from downgrade (Yearly → Monthly, still paid) — separate UI, separate route.

## Steps

1. **Show the Cancel control only when `Subscription.status === 'ACTIVE'` and `cancelAtPeriodEnd === false`** (FR-18). Once cancellation is scheduled, the control disappears — there is no "Resume Subscription" action anywhere in scope (A13, N-list). Do not build one even if it seems like an obvious follow-up.
2. **Clicking Cancel opens a confirmation step** (modal or sub-screen) stating the exact date access ends (`currentPeriodEnd`). Cancellation does not execute until the user explicitly confirms (FR-19).
3. **After confirmation, show an optional reason prompt** — fixed list: `TOO_EXPENSIVE`, `MISSING_FEATURES`, `SWITCHING_PROVIDER`, `NOT_USING_ENOUGH`, `TEMPORARY_PAUSE`, `OTHER`, plus a free-text field shown only when `OTHER` is selected. Skipping the prompt is allowed — cancellation proceeds either way (FR-20).
4. **`POST /api/subscription/cancel`:**
   - Cancel the subscription with Flutterwave (or mark it to cancel at period end, whichever the provider actually supports for this — confirm rather than assume, per [handle-spec-ambiguity.md](handle-spec-ambiguity.md) if unclear).
   - Set `Subscription.cancelAtPeriodEnd = true` and store `cancellationReason` (+ `cancellationReasonOther` if provided) **immediately** — this does not wait for a webhook, since it's a direct API response (FR-29).
5. **Access stays valid until `currentPeriodEnd`**, gated only through `hasProAccess()` — see [check-pro-access.md](check-pro-access.md). Never revoke access at step 4 (rule 10).
6. **Only the renewal-confirmation webhook flips final state**: `Subscription.status = CANCELED`, `plan = FREE`. The row is updated, not deleted (FR-30, A16). This happens inside the webhook route's fulfilment step — see [implement-flutterwave-webhook.md](implement-flutterwave-webhook.md).
7. **If the cancel API call fails**, show the specific error inline and leave `Subscription` state unchanged — never optimistically update the UI first (FR-21).

## Definition of done

- `hasProAccess()` still returns `true` for this user immediately after step 4, and stays `true` until `currentPeriodEnd`.
- No "Resume" control, route, or Prisma transition exists anywhere in the codebase.
- The reason prompt is skippable without blocking cancellation.

Satisfies: PRD FR-18, FR-19, FR-20, FR-21, FR-29, FR-30, G4. Rule 10.
