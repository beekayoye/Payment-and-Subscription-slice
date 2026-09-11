# Completion Checklist

At the end of any task, phase, or PR, produce this checklist **filled in** — not just "done," but which specific PRD requirement or rule each line satisfies. Do not mark something done because the happy path works; walk the failure paths too.

If any box can't be checked honestly, the task is **not done** — say so plainly and name which box.

```markdown
## Completion Checklist

### Build
- [ ] `next build` completes with zero errors and zero type errors
- [ ] ESLint passes with zero errors
- [ ] Prisma schema is valid and migrations apply cleanly to a fresh database

### Entitlement & Security (rules 1–7)
- [ ] hasProAccess() is the only place entitlement is computed — grep confirms no duplicate logic
- [ ] Webhook route verifies flutterwave-signature before parsing the body
- [ ] Webhook route re-verifies the transaction against Flutterwave's API before fulfilment
- [ ] Idempotency test passes: replaying one event twice produces one PaymentEvent row
- [ ] Duplicate-fulfilment test passes: related events for one transition produce exactly one FULFILLMENT row
- [ ] No card data appears anywhere in the database, logs, or stored payloads

### Money & Logging (rules 8–9)
- [ ] Every amount field is an integer in minor units; no float/decimal anywhere in the money path
- [ ] No code path calls .update() on PaymentEvent

### Lifecycle Correctness (rules 10–11)
- [ ] Cancelling does not revoke access before currentPeriodEnd (manual or automated check)
- [ ] Downgrade does not change the effective plan before the renewal boundary
- [ ] The downgrade execution mechanism is implemented and documented, not left as a stub

### Error Handling (rule 12)
- [ ] Every FR in the relevant screen's section has a corresponding named error/empty/loading state
- [ ] Custom error.tsx and not-found.tsx exist and are reachable from the payment route group

### Scope (rule 13)
- [ ] No feature was built that isn't in this phase's task list
- [ ] No non-goal (N1–N8) was implemented

### Abuse Protection (rule 14)
- [ ] Checkout initiation is rate-limited via RateLimitBucket and returns 429 with Retry-After when exceeded

### Traceability
- [ ] Every requirement this task claims to satisfy is listed by its PRD ID (FR-#, G#, N#)
```
