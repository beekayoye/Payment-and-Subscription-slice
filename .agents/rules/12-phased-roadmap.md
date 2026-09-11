# Phased Roadmap — Build Order Is Mandatory

Phases must be completed **in order**. Never work ahead of the current phase. If Phase 1 is incomplete, do not start Phase 3 pieces.

## Phase 0 — Foundation

- Wire up reused auth middleware to this app.
- Create `Subscription`, `PaymentEvent`, and `RateLimitBucket` Prisma models and run migrations.
- Set up Flutterwave sandbox account, Plan IDs, and webhook forwarding (ngrok).
- **CRITICAL**: Decide and document the downgrade-scheduling mechanism before writing checkout/fulfilment code, so initial subscription creation is compatible with it later.

## Phase 1 — Subscribe

- Plans View (Free/Monthly/Yearly display only).
- Checkout Initiation (including in-flight-session check, FR-8).
- Webhook endpoint with signature verification + idempotency + designated-trigger-event rule (FR-31a).
- Return View with polling.
- Free → Monthly fulfilment end to end using upsert-on-`userId` (FR-22).

## Phase 2 — Upgrade & Billing

- Monthly → Yearly upgrade with proration preview and immediate charge.
- Billing View showing live status and renewal date, gated through `hasProAccess()` (FR-2a).

## Phase 3 — Downgrade & Cancel

- Yearly → Monthly scheduled downgrade (FR-27) — deferred, tracked by our application.
- Cancel flow with confirmation step and optional reason capture.
- Pending-change indicators on Plans and Billing views.

## Phase 4 — Hardening

- Rate limiting on checkout using `RateLimitBucket`.
- Custom `error.tsx` / `not-found.tsx` across the payment route group.
- Idempotency replay test.
- Duplicate-fulfilment test (FR-31a).
- Proration unit tests.
- Review every screen for reachable dead-end states.
- Run through the "Verified by" column in PRD Section 11 for every metric.
