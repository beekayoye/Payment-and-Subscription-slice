# Hard Rules — What Must Never Happen

Breaking any single rule below means the task has **failed**, even if the app builds and runs correctly.

## Entitlement & Security

1. **Never grant entitlement without a verified, server-confirmed payment.** Both HMAC signature verification AND the Flutterwave transaction-verify API call must pass before `Subscription.status` moves to `ACTIVE`. No exceptions for testing. *(PRD G5, FR-22, Section 6)*

2. **Never derive Pro access anywhere except through `hasProAccess(subscription)`.** This single function in `/lib/entitlement.ts` is the ONLY code allowed to answer "does this user have Pro access." Not a component prop, not a second helper, not an inline check. *(PRD FR-2a)*

3. **Never read plan or payment state from a URL, query string, or any client-supplied value.** The Return View treats the checkout reference in its URL as a lookup hint at most — it re-fetches truth from the database. *(PRD FR-12)*

4. **Never trust a webhook payload before signature verification, and never grant entitlement from the payload alone.** Re-verify the transaction against Flutterwave's own API first. Both checks are required — neither alone is sufficient. *(PRD Section 6 steps 5–8)*

5. **Never process the same provider event twice.** Idempotency on transaction ID is mandatory. Must hold under Flutterwave's retry behavior (up to 3 retries at 30-minute intervals). *(PRD FR-31, G6)*

6. **Never let more than one event type trigger a fulfilment write for the same logical transition.** One designated trigger event per transition type; all other related events are logged but don't touch `Subscription`. *(PRD FR-31a)*

7. **Never store card numbers, CVVs, or raw card data anywhere** — not in the database, not in logs, not in stored webhook payloads. Provider tokens/references are fine; PANs never are. *(PRD A8)*

## Data Integrity

8. **Never store money as anything other than a whole integer in minor units**, with currency alongside. No floats, no decimals, not even "just for display." *(AGENTS.md Q2)*

9. **Never update or overwrite a `PaymentEvent` row.** Every event is a new appended row. If you're writing `.update()` against this table, stop — you're breaking an audit guarantee. *(PRD FR-31)*

## Lifecycle Correctness

10. **Never revoke access immediately on cancellation.** Access stays valid through `currentPeriodEnd`. Only the renewal-confirmation webhook flips status to `CANCELED` and plan to `FREE`. *(PRD FR-29, FR-30, G4)*

11. **Never apply a downgrade immediately.** Flutterwave has no schedule object — deferred change is entirely our application's responsibility to track and execute at the right time. *(PRD FR-27/28)*

## UX & Error Handling

12. **Never let any screen in the payment path dead-end.** No blank page, no unhandled exception, no framework-default 404/500. Every failure mode gets a specific, named state. *(PRD G7, FR-11, FR-15, FR-16, FR-21)*

## Scope

13. **Never build anything the PRD explicitly rules out:**
    - No landing or marketing/pricing page (N1)
    - No product features gated behind Pro (N2)
    - No refunds (N3)
    - No dunning/retry logic on failed renewals (N4)
    - No admin dashboard (N5)
    - No team/org billing (N6)
    - No multi-currency support (N7)
    - No "Resume Subscription" control (FR-18)
    - No new auth system (N8)

## Abuse Protection

14. **Never skip or reimplement the rate limiter.** Checkout initiation uses the `RateLimitBucket` Postgres table — not skipped for dev convenience, not swapped for Redis or in-memory. *(PRD FR-32)*
