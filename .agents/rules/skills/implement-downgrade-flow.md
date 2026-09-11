---
name: implement-downgrade-flow
description: Build the Yearly→Monthly deferred downgrade path. Use for /api/subscription/downgrade and the application-owned scheduling mechanism that executes it at renewal. Flutterwave has no Subscription Schedule equivalent, so this is entirely our own responsibility.
---

# Implement the downgrade flow (Yearly → Monthly)

Downgrade is **deferred to the next renewal**, never immediate. Flutterwave subscriptions cannot be modified in place and have no schedule object — the deferred change must be tracked and executed entirely by this application.

## Precondition — do not skip

Before writing this flow, confirm the Phase 0 design decision (cron job vs. webhook-triggered check for executing the deferred change) is already made and documented. If it isn't, that's the blocking task — see [handle-spec-ambiguity.md](handle-spec-ambiguity.md) rather than picking a mechanism ad hoc while building this route.

## Steps

1. **On confirmation, `POST /api/subscription/downgrade`:**
   - Set `Subscription.pendingInterval = MONTHLY` and `Subscription.pendingEffectiveAt = currentPeriodEnd` locally. These fields are **display-only** — they are never the source of truth for what Flutterwave will actually charge (mirrors what `stripeScheduleId` would have guaranteed in the Stripe version; Flutterwave has nothing to store instead, so the correctness burden sits entirely on the mechanism from the precondition).
   - If the write fails, the user sees a specific retry-capable error — never a silently-scheduled change nothing will actually execute.
2. **Show the pending state.** Plans View: current plan's card shows the pending change and effective date, e.g. "Yearly — switching to Monthly on Mar 4, 2027" (FR-5). Billing View: same pending-downgrade indicator (FR-17).
3. **At the effective time** (via whichever mechanism was decided in the precondition — cron sweep over `pendingEffectiveAt <= now()`, or a check triggered off the renewal-charge webhook): cancel the old (Yearly) subscription with Flutterwave and start a new (Monthly) subscription for the same customer.
4. **Only when this execution is confirmed** (the designated fulfilment trigger — see [implement-flutterwave-webhook.md](implement-flutterwave-webhook.md) step 7) does `Subscription.interval` actually change to `MONTHLY`; `pendingInterval` and `pendingEffectiveAt` are cleared at that point (FR-28).
5. **Never apply the interval change at request time in step 1.** If you find `Subscription.interval` being set to `MONTHLY` anywhere in the downgrade-request route handler, that's the bug this whole flow exists to prevent (rule 11) — Flutterwave doesn't know about the change until step 3 actually happens.

## Definition of done

- `Subscription.interval` stays `YEARLY` immediately after the downgrade request; only `pendingInterval`/`pendingEffectiveAt` change.
- The execution mechanism from the precondition is implemented and documented, not a stub or a `// TODO`.
- A failed downgrade-schedule write rolls back cleanly with no dangling `pendingInterval`.

Satisfies: PRD FR-5, FR-17, FR-27, FR-28, G3. AGENTS.md Q2 downgrade row, Phase 0 requirement. Rule 11.
