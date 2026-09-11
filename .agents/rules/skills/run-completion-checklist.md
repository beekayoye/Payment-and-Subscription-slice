---
name: run-completion-checklist
description: Run and honestly fill in the completion checklist at the end of any task, phase, or PR. Use before reporting work as done.
---

# Run the completion checklist

## The rule

Producing this checklist is part of the task, not an optional wrap-up. Every box must be backed by something you actually checked (a grep, a test run, a manual walkthrough) — not marked done because the happy path worked. If a box can't be checked honestly, the task is not done; say so plainly and name which box, rather than reporting completion (see [08-uncertainty-protocol.md](../08-uncertainty-protocol.md)).

## Steps

1. Copy the checklist from [07-completion-checklist.md](../07-completion-checklist.md) verbatim.
2. For each box, actually perform the check before ticking it:
   - Build/lint/migration boxes → run the commands, don't assume.
   - `hasProAccess()` exclusivity → `grep -rn "plan === 'PRO'"` outside `/lib/entitlement.ts` (see [check-pro-access.md](check-pro-access.md)).
   - Webhook signature/verification order → read the route top-to-bottom, confirm order matches [implement-flutterwave-webhook.md](implement-flutterwave-webhook.md).
   - Idempotency / duplicate-fulfilment tests → run them, don't just confirm they exist.
   - No card data → grep logged payloads and schema fields.
   - Money fields → grep the Prisma schema for `Float`/`Decimal` near amount fields.
   - `.update()` on `PaymentEvent` → grep for it (see [log-payment-event.md](log-payment-event.md)).
   - Cancel/downgrade timing → manually trace `hasProAccess()` and `Subscription.interval` immediately after the action, confirm nothing changed early.
   - Error states → walk each screen per [add-payment-screen-error-states.md](add-payment-screen-error-states.md).
   - Scope → re-read this task against the current phase in [12-phased-roadmap.md](../12-phased-roadmap.md) and the non-goals in [03-never-rules.md](../03-never-rules.md) rule 13.
   - Rate limiting → confirm per [add-checkout-rate-limiting.md](add-checkout-rate-limiting.md).
3. **Traceability**: for every requirement this task claims to satisfy, cite its PRD ID (`FR-#`, `G#`, `N#`) next to the checklist line it maps to.
4. Report the filled-in checklist as part of the task output — not a separate "looks good" summary.

## Definition of done

- Every checked box has a corresponding action taken this session (a command run, a grep executed, a file read), not an assumption.
- Any unchecked box is named explicitly, with the reason it's unchecked.

Satisfies: PRD Section 11 ("Verified by" column), AGENTS.md Q6.
