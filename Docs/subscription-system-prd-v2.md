# Subscription System PRD (v2)

**Revision note:** This is v2, produced after a structured review of v1 that surfaced 13 lapses (1 critical, 3 high, the rest medium/low). All 16 corrections from that review are applied below. The most significant change is in Section 5.8: the downgrade mechanism now explicitly uses a Stripe Subscription Schedule instead of a local-only database flag — in v1, the local flag alone would not have actually changed the price at renewal, silently breaking G3.

## 1. Product Summary

A test-mode subscription system that lets a signed-in user hold one of three states on their user record: free, Pro Monthly, or Pro Yearly. The system handles the full paid-plan lifecycle — subscribe, upgrade with mid-cycle proration, downgrade deferred to period end, and cancel with access retained through the paid period — using Stripe in test mode as the payment provider. The product being sold is a plan flag on the user record; no gated features, marketing pages, or card storage are part of this system. The single, documented way anything reads that flag is defined in FR-2a. Authentication is reused from a prior assessment and treated as already solved.

## 2. Problem Statement

Building correct subscription billing is a common but easy-to-get-wrong engineering problem: entitlements get granted on unverified client state, webhooks get processed twice, proration math is skipped or faked, and users land on blank screens mid-payment. This project exists to demonstrate a correct, minimal implementation of that problem: server-side verification before entitlement, idempotent webhook processing, real proration, and no dead ends in the payment path. It is not solving a business problem; it is proving the mechanics are handled correctly.

This PRD assumes a reused auth session of unknown exact shape (see Section 14, Q3); that unknown is treated as a delivery risk carried by this document, not a design decision resolved here (see Section 9, Risks).

## 3. Goals and Non-Goals

### Goals

| # | Goal |
|---|------|
| G1 | A signed-in user can move from free to Pro Monthly through a real Stripe test-mode checkout. |
| G2 | A user can upgrade Monthly → Yearly mid-cycle with an accurately calculated and displayed proration charge. |
| G3 | A user can downgrade Yearly → Monthly, with the change taking effect only at the next renewal. |
| G4 | A user can cancel, keep access until the paid period ends, and optionally record why they left. |
| G5 | No entitlement is ever granted without a signature-verified, server-side-confirmed payment event. |
| G6 | Every payment-related event is recorded exactly once, even if Stripe retries the webhook. |
| G7 | The user is never shown a blank screen, an unhandled error, or a 404 anywhere in the payment path. |

### Non-Goals

| # | Non-Goal |
|---|------|
| N1 | No landing page or pricing marketing page. |
| N2 | No product features gated behind the Pro plan — the plan flag is the entire product. |
| N3 | No refunds. |
| N4 | No dunning, retries, or grace-period logic for failed renewal payments. |
| N5 | No admin dashboard or internal tooling. |
| N6 | No team, organization, or multi-seat billing — one subscription per individual user. |
| N7 | No multi-currency support — a single currency will be chosen (see Q2) and hardcoded; switching between currencies later is out of scope. *(Reworded in v2 — see review.)* |
| N8 | No building or re-specifying authentication — it is reused as-is from a prior assessment. |

## 4. User Personas

**[ADDED]** Personas are lightweight because this is a single-user, single-plan system with no organizational structure.

**The Subscriber** — a signed-in individual user. Wants to see what plan they're on, change it without surprises, and not be charged or lose access without warning. Represents the only real actor in this system.

**The Evaluator** *(secondary, [ADDED])* — whoever reviews this build against the requirements (an instructor, a technical reviewer, or the developer's future self debugging a webhook issue). Cares that every payment event is traceable in the payment log, that proration math is verifiable, and that idempotency actually holds up under a replayed webhook. This persona is served by the payment log and Prisma data model, not by any UI.

**Abuse/misuse note** *(added in v2)*: FR-32's rate limits exist to defend against a scripted or repeatedly-clicking actor hammering `/api/checkout` — not a full persona, but the numbers in FR-32 are otherwise unmotivated without naming this threat explicitly.

## 5. Functional Requirements

Each requirement is discrete and testable. IDs are grouped by screen or flow. Items marked *(v2)* are new or rewritten from the review.

### 5.1 Signed-In Shell

- FR-1: All five screens are only reachable by a user with a valid session from the reused auth system; unauthenticated access redirects to the existing sign-in flow, not to a payment screen.
- FR-2: The shell displays the user's current plan state (Free / Pro Monthly / Pro Yearly) in a persistent location (e.g. header) on every screen it wraps.
- **FR-2a *(v2, new)*:** The only sanctioned way to check plan entitlement anywhere in this system is reading `Subscription.plan` (via the `hasProAccess(subscription)` helper described in Section 7). No other logic — UI, middleware, or otherwise — may independently derive entitlement. This replaces the undefined "checked elsewhere" reference that existed in v1's FR-30.

### 5.2 Plans View

- FR-3: The view renders exactly three plan cards: Free, Pro Monthly, Pro Yearly, sourced from the application's plan config, not a database table.
- FR-4: The user's current plan is visually marked as current (e.g. a badge), determined by reading `Subscription.plan` + `Subscription.interval` + `Subscription.status`, not by client-side assumption. **This must render identically whether the user has no `Subscription` row at all or has a row with `plan = FREE` (e.g. after a prior cancellation) — both are the same Free state to this screen (see A16, v2).**
- FR-5: If `Subscription.pendingInterval` is set (a downgrade is scheduled), the current plan's card shows the pending change and the effective date (`currentPeriodEnd`), e.g. "Yearly — switching to Monthly on Mar 4, 2027."
- FR-6: If `Subscription.cancelAtPeriodEnd` is true, the card shows "Cancels on [currentPeriodEnd]" instead of a renewal date.
- FR-7: Selecting a plan that differs from the current one routes to the correct action: Free → Monthly or Free → Yearly go to Checkout Initiation; Monthly → Yearly goes to the Upgrade action; Yearly → Monthly goes to the Downgrade action. Selecting the current plan is a no-op.

### 5.3 Checkout Initiation

- FR-8: Only reachable for a Free → Monthly or Free → Yearly transition. A user who already has an active paid subscription is redirected to the Billing View, not shown checkout again. **If an `INCOMPLETE`-status checkout session already exists for this user from within the last 10 minutes *(v2, new)*, the user is redirected to that existing Stripe Checkout Session rather than a new one being created — this prevents duplicate concurrent sessions from repeated clicks.**
- FR-9: On submit, the server creates a Stripe Checkout Session in `subscription` mode for the selected price, records a payment log row with `eventType = INITIATION`, and redirects the browser to the Stripe-hosted checkout URL. No entitlement is granted at this step.
- FR-10: The endpoint is rate-limited (see FR-31, FR-32). A rate-limited request shows a specific "too many attempts, try again in N seconds" message, never a generic error or blank page.
- FR-11: If Stripe session creation fails (network error, invalid price ID, Stripe outage), the user sees a specific retry-capable error screen, not a 500 page or silent redirect failure.

### 5.4 Return View

- FR-12: This view never reads plan state from the URL, a query parameter, or any client-supplied value. It only reads `Subscription` state from the database via an authenticated API call.
- FR-13: On load, if the subscription is already `ACTIVE` (webhook beat the redirect), show a success state immediately.
- FR-14: If the subscription is not yet `ACTIVE`, show a "processing your payment" state and poll the status endpoint (e.g. every 2 seconds, capped at 15 attempts / 30 seconds).
- FR-15: If polling exceeds the cap without reaching `ACTIVE`, show a specific "this is taking longer than expected" state with a manual refresh action and a link to the Billing View — never a blank page, spinner-forever, or 404.
- FR-16: If the payment log shows a `FAILURE` event for this session before `ACTIVE` is reached, show a specific failure state with a link back to Plans, not a generic error.

### 5.5 Billing View

- FR-17: Displays current plan, interval, status, `currentPeriodEnd` as "renews on" (active) or "access ends on" (canceling), and any pending downgrade.
- **FR-18 *(v2, rewritten — resume flow cut)*:** Shows a Cancel control only when `Subscription.status = ACTIVE` and `cancelAtPeriodEnd = false`. Once cancellation is scheduled, the Cancel control simply disappears; there is no "Resume Subscription" action in this scope. *(v1 proposed a resume flow with no backing API route, no Prisma-level transition, and an unresolved open question about whether it was even wanted — cut rather than half-specified. See Q4, resolved.)*
- FR-19: Clicking Cancel opens a confirmation step (modal or sub-screen) stating the exact date access ends. Cancellation is not executed until the user explicitly confirms.
- FR-20: After confirming cancellation, an optional reason prompt appears with a fixed list (`TOO_EXPENSIVE`, `MISSING_FEATURES`, `SWITCHING_PROVIDER`, `NOT_USING_ENOUGH`, `TEMPORARY_PAUSE`, `OTHER`) plus a free-text field shown only when `OTHER` is selected. Skipping the prompt is allowed; cancellation proceeds either way.
- FR-21: If the cancel or upgrade/downgrade API call fails, the Billing View shows the specific error inline and leaves the subscription state unchanged — it never optimistically updates the UI before server confirmation.

### 5.6 Subscribe (Free → Monthly or Free → Yearly)

- FR-22: Entitlement is granted only when a webhook-driven fulfilment event is processed (see Section 6), never from the Return View redirect itself. **Fulfilment upserts the `Subscription` row keyed on `userId`** *(v2, added)* **— it creates a new row on a user's first-ever subscribe, and updates the existing row on any later resubscribe. This is required because `Subscription.userId` is `@unique`; a returning user who cancelled once already has a row, and a blind `create` would fail the unique constraint.**
- FR-23: On fulfilment, `Subscription.status = ACTIVE`, `plan = PRO`, `interval` set from the purchased price, `currentPeriodStart`/`currentPeriodEnd` set from Stripe's subscription object.

### 5.7 Upgrade (Monthly → Yearly)

- FR-24: Before charging, the system fetches Stripe's upcoming invoice preview for the plan change and displays the exact prorated amount (in dollars, derived from minor units) to the user for confirmation.
- FR-25: On confirmation, the server updates the Stripe subscription's price with `proration_behavior: create_prorations`, invoiced immediately. This is applied right away — not deferred.
- FR-26: The proration charge is treated as a distinct payment event and is recorded in the payment log with its own `providerEventId` when Stripe's corresponding invoice/webhook event arrives.

### 5.8 Downgrade (Yearly → Monthly)

**Rewritten in v2.** v1's FR-27 only wrote a local database flag (`pendingInterval`) and never told Stripe anything had changed. Since Stripe has no knowledge of your database, the subscription would have simply renewed at the old yearly price and interval — the downgrade would never have actually happened. The corrected mechanism below closes that gap.

- **FR-27 *(v2, rewritten)*:** On confirmation, the server creates (or updates) a **Stripe Subscription Schedule** with two phases: the current phase continues at the existing price through `currentPeriodEnd`, and a second phase starts at `currentPeriodEnd` on the Monthly price. The Stripe Subscription Schedule ID is stored on `Subscription.stripeScheduleId`. In the same request, `Subscription.pendingInterval = MONTHLY` is set locally — this local field is for display only (FR-5) and is never the source of truth for what Stripe will actually charge. **If the Stripe Subscription Schedule call fails, the local `pendingInterval` write is rolled back and the user sees a specific retry-capable error, not a silently-scheduled change that Stripe doesn't know about.**
- FR-28: The scheduled change is only reflected as complete in `Subscription.interval` when the renewal webhook event confirms the new price phase took effect on Stripe's side (see Section 6); `pendingInterval` and `stripeScheduleId` are cleared at that point.

### 5.9 Cancel

- FR-29: On confirmation, the server sets `cancel_at_period_end: true` on the Stripe subscription. `Subscription.cancelAtPeriodEnd = true` and `cancellationReason` (+ optional `cancellationReasonOther`) are stored immediately — this does not wait for a webhook, since it's a direct API response, not an async payment event.
- **FR-30 *(v2, rewritten)*:** Access remains valid until `currentPeriodEnd`, gated by the single entitlement read path defined in FR-2a. When the renewal webhook confirms the subscription reached `canceled` status, `Subscription.status = CANCELED` and `plan` reverts to `FREE` (the row is updated, not deleted — see A16).

### 5.10 Payment Event Logging

- FR-31: Every one of the following produces its own `PaymentEvent` row, never an update to a prior row: checkout initiation, webhook signature verified + parsed (`VERIFICATION`), entitlement change applied (`FULFILLMENT`), and any failure (declined payment, failed verification, Stripe error) (`FAILURE`).
- **FR-31a *(v2, new)*:** A single logical transition (e.g. subscribing) can cause Stripe to send multiple distinct webhook events, each with its own event ID (e.g. `checkout.session.completed`, `customer.subscription.created`, `invoice.paid` can all fire for one subscribe action). Per-event-ID idempotency alone does not prevent three separate `FULFILLMENT` writes for what is really one transition. To prevent this, exactly one designated Stripe event type per transition type is allowed to write to `Subscription` (see Section 6, step 8a for the mapping); all other related events are still recorded as their own `PaymentEvent` row for audit purposes, but are not fulfilment triggers.
- FR-32: Rate limiting on checkout initiation: 5 requests per user per minute and 20 requests per IP per minute *(assumption, [ADDED] — see Section 7 for justification, and Section 4 for the threat it defends against)*. Exceeding either returns HTTP 429 with a `Retry-After` header, surfaced to the user per FR-10.

## 6. Payment Verification and Webhook Processing Pipeline

**There is no AI or ML component anywhere in this system.** This section is repurposed, as instructed, to describe the payment verification pipeline end to end.

1. **Initiation** — User selects a plan on the Plans View. Server creates a Stripe Checkout Session (`mode: subscription`) for the corresponding Price ID from config. A `PaymentEvent(eventType: INITIATION, providerReference: session.id)` row is written. User is redirected to Stripe's hosted checkout page. No entitlement exists yet.
2. **Payment** — User pays on Stripe's page. Stripe, not this system, handles card capture. No card data ever reaches this application (satisfies the "no card details stored" requirement by construction).
3. **Redirect** — Stripe redirects the browser to the Return View with only a session ID in the URL. The Return View treats this ID as a lookup hint at most, never as proof of payment (FR-12).
4. **Webhook delivery** — Stripe asynchronously POSTs event objects (`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`) to a dedicated route, e.g. `POST /api/webhooks/stripe`.
5. **Signature verification** — The route reads the raw request body (Next.js body parsing must be disabled for this route) and calls Stripe's SDK signature verification (`stripe.webhooks.constructEvent`) using the endpoint's signing secret. A request that fails verification is rejected with HTTP 400 and is never parsed as a trusted event or logged as anything but a rejected/unverified attempt.
6. **Idempotency check** — After verification, the event's `id` (e.g. `evt_1AbC...`) is checked against `PaymentEvent.providerEventId` under a unique constraint. If a row already exists, the handler returns HTTP 200 immediately and performs no further action — this is what makes a Stripe retry safe.
7. **Recording** — If new, a `PaymentEvent` row is written with the full raw payload, `eventType` set based on the Stripe event type (`VERIFICATION` for the initial confirmation events, `FAILURE` for `invoice.payment_failed`).
8. **Fulfilment** — For success events, the handler updates the `Subscription` row: sets `status`, `plan`, `interval`, `currentPeriodStart`, `currentPeriodEnd`, clears `pendingInterval`/`stripeScheduleId` if a scheduled change just took effect, clears `cancelAtPeriodEnd`/sets `status = CANCELED` if this is a cancellation-completion event. A second `PaymentEvent(eventType: FULFILLMENT)` row is written recording exactly what changed.
   - **8a *(v2, new — implements FR-31a)*:** Only one Stripe event type per transition type is treated as the fulfilment trigger: `checkout.session.completed` for initial subscribe, `customer.subscription.updated` for upgrade completion, downgrade-schedule-phase-change, and cancellation completion. Every other related event (`customer.subscription.created`, `invoice.paid`, etc.) is still recorded per step 7, but does not independently trigger step 8's `Subscription` update.
9. **Failure handling** — For `invoice.payment_failed`, a `FAILURE` event is recorded and, in this system's scope, no further automated action is taken (no retry, no dunning — see N4). The subscription's `status` may reflect Stripe's own `past_due` state for visibility, but nothing in this system acts on it.
10. **Read path** — The Return View and Billing View only ever read `Subscription` and `PaymentEvent` rows already written by this pipeline, through the single entitlement helper defined in FR-2a. They never call Stripe directly to check payment status and never trust a redirect query parameter as an entitlement signal.

## 7. Technical Requirements

- **Stack**: Next.js (App Router), TypeScript, Prisma, PostgreSQL — locked, no substitutions.
- **Entitlement helper *(v2, new)*:** a single exported function, e.g. `hasProAccess(subscription: Subscription | null): boolean`, that returns true only when `plan === 'PRO'` and `status` is `ACTIVE` or `CANCEL_SCHEDULED`. This is the only function anywhere in the codebase allowed to answer "does this user have Pro access" (implements FR-2a).
- **Routes**:
  - `POST /api/checkout` — creates Checkout Session, rate-limited, checks for an existing `INCOMPLETE` session first (FR-8).
  - `POST /api/webhooks/stripe` — signature-verified, idempotent, raw-body route (`export const config = { api: { bodyParser: false } }` equivalent for App Router: read `req.text()` before any JSON parsing).
  - `POST /api/subscription/upgrade` — triggers immediate prorated interval change.
  - `POST /api/subscription/downgrade` — creates the Stripe Subscription Schedule described in FR-27 and sets `pendingInterval` locally.
  - `POST /api/subscription/cancel` — sets `cancel_at_period_end`, stores reason.
  - `GET /api/subscription/status` — used by Return View polling and Billing View.
- **Environment variables**: `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`. All test-mode keys.
- **Rate limiting**: **[ADDED, assumption]** a fixed-window or token-bucket limiter (5/user/min, 20/IP/min on `/api/checkout`) implemented with the `RateLimitBucket` Postgres table defined in Section 10 (no Redis in this stack). Flagged explicitly because this approach does not scale across multiple server instances — acceptable for a single-instance test-mode deployment, called out again in Risks.
- **Error handling**: a shared error-response shape (`{ error: { code, message } }`) for every API route in the payment path; a custom Next.js `error.tsx` and `not-found.tsx` for the subscription route group so no payment-path navigation can hit the framework default error page; every async handler wrapped so no unhandled promise rejection can produce a blank response.
- **Local webhook testing**: Stripe CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`) is required for local development since Stripe cannot reach `localhost` directly. **[ADDED, assumption]** — flagged because it's an operational detail not stated in the original brief but required to actually build this.
- **Testing**: unit tests for the proration calculation and the idempotency check function; at least one integration test that replays the same webhook event ID twice and asserts a single `PaymentEvent` row and a single state transition; a test asserting that `checkout.session.completed` plus `customer.subscription.created` plus `invoice.paid` arriving for the same subscribe action produces exactly one `FULFILLMENT` row (implements FR-31a / step 8a).

## 8. Business Model

**This is not a pricing strategy — it is a test fixture** *(v2, added)*: no market research informs the numbers below; the only requirement on them is that they make proration math independently verifiable by hand. No real monetization goal exists for this project (see Section 2, Context).

| Plan | Interval | Price | Stored as |
|------|----------|-------|-----------|
| Free | — | $0 | no `Subscription` row, or a row with `plan = FREE` (see A16) |
| Pro | Monthly | $9.00 | 900 (minor units), currency `usd` |
| Pro | Yearly | $90.00 | 9000 (minor units), currency `usd` |

Yearly is priced at 10 months' worth of Monthly (a 2-month discount), a common SaaS pattern chosen here only to make the proration math on upgrade non-trivial to verify by hand.

## 9. Risks

| Risk | Type | Notes |
|------|------|-------|
| **Reused auth system's session shape and available user claims are unknown** *(v2, new)* | Product/Technical | Phase 0 assumes the reused auth session can just be wired up directly (see Section 2). If the claims it actually exposes don't cover what route guards or FR-1 need, Phase 0 scope grows before Phase 1 can start. See Q3. |
| Webhook arrives before or long after the user's redirect | Technical | Mitigated by Return View polling (FR-14) rather than trusting the redirect; a webhook delayed past the polling window still resolves correctly once it arrives, just not instantly visible to the user. |
| Clock drift / timezone bugs in period boundary comparisons | Technical | Mitigated by storing all period timestamps in UTC and always comparing against Stripe's own period fields rather than recalculating them locally. |
| Stripe API/webhook payload shape changes between API versions | Technical | Pin the Stripe SDK and API version explicitly in code; do not float to `latest`. |
| Rate limiter is single-instance (Postgres counter, no Redis) | Technical, accepted | Acceptable for test-mode/single-instance scope; would need a distributed limiter before any real multi-instance deployment. |
| No dunning/retry on failed renewal payments | Accepted (N4) | A user whose renewal fails will show `past_due` in Stripe with no automated follow-up in this system — deliberate scope cut, not an oversight. |
| No refund handling | Accepted (N3) | Any refund issued in the Stripe dashboard will not be reflected in `Subscription` state automatically. |
| Test-mode to live-mode migration | Technical | Live mode requires separate API keys, a separate webhook endpoint + signing secret, and separate Price IDs; none of this is handled by an environment flag alone and would need explicit config duplication. |
| Multiple Stripe events firing for one logical transition | Technical | Mitigated by the designated-trigger-event rule (FR-31a, Section 6 step 8a); without it, one subscribe/upgrade/downgrade could produce multiple redundant `FULFILLMENT` rows. |

## 10. Prisma Data Model

```prisma
// Existing User model — referenced only, not redefined here.
// Assumed shape, reused from prior assessment's auth system:
// model User {
//   id    String @id @default(cuid())
//   email String @unique
//   ...
// }

enum PlanTier {
  FREE
  PRO
}

enum BillingInterval {
  MONTHLY
  YEARLY
}

enum SubscriptionStatus {
  INCOMPLETE       // checkout initiated, not yet confirmed by webhook
  ACTIVE
  CANCEL_SCHEDULED // cancelAtPeriodEnd = true, still has access
  CANCELED
  PAST_DUE         // renewal payment failed; recorded, not acted on (see N4)
}

enum CancellationReason {
  TOO_EXPENSIVE
  MISSING_FEATURES
  SWITCHING_PROVIDER
  NOT_USING_ENOUGH
  TEMPORARY_PAUSE
  OTHER
}

enum PaymentEventType {
  INITIATION
  VERIFICATION
  FULFILLMENT
  FAILURE
}

enum PaymentProvider {
  STRIPE
}

model Subscription {
  id                  String              @id @default(cuid())
  userId              String              @unique
  plan                PlanTier            @default(FREE)
  interval            BillingInterval?
  status              SubscriptionStatus  @default(INCOMPLETE)

  currentPeriodStart  DateTime?
  currentPeriodEnd    DateTime?

  cancelAtPeriodEnd   Boolean             @default(false)
  cancellationReason  CancellationReason?
  cancellationReasonOther String?

  // Set when a downgrade is scheduled; cleared once the renewal webhook
  // confirms the new interval took effect (FR-27, FR-28).
  // Display-only — NOT the source of truth for what Stripe will charge.
  pendingInterval     BillingInterval?

  // Stripe Subscription Schedule id created for a scheduled downgrade
  // (FR-27, v2). This is what actually makes the interval change happen
  // on Stripe's side; pendingInterval alone does not. Cleared alongside
  // pendingInterval once the schedule's new phase takes effect (FR-28).
  stripeScheduleId     String?

  stripeCustomerId     String
  stripeSubscriptionId String?            @unique

  paymentEvents       PaymentEvent[]

  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  @@index([stripeCustomerId])
}

model PaymentEvent {
  id                String            @id @default(cuid())
  userId            String
  subscriptionId    String?
  subscription      Subscription?     @relation(fields: [subscriptionId], references: [id])

  eventType         PaymentEventType
  provider          PaymentProvider   @default(STRIPE)

  // Stripe Checkout Session id for INITIATION rows;
  // Stripe Event id (evt_...) for VERIFICATION / FULFILLMENT / FAILURE rows.
  providerReference String

  // Unique per Stripe event — this is the idempotency key (FR-31 / Section 6 step 6).
  // Null for INITIATION rows, which are not webhook-sourced and not retried by Stripe.
  providerEventId   String?           @unique

  amount            Int               // minor units (cents)
  currency          String            // ISO 4217, lowercase, e.g. "usd"
  status            String            // raw provider status string, e.g. "succeeded", "requires_payment_method"

  rawPayload        Json

  createdAt         DateTime          @default(now())

  @@index([userId])
  @@index([provider, providerReference])
}

// Added in v2 — backs the rate limiter described in Section 7 / FR-32.
// A row per (key, windowStart); key is either a userId or an IP address,
// distinguished by a prefix (e.g. "user:<id>" / "ip:<addr>").
model RateLimitBucket {
  id          String   @id @default(cuid())
  key         String
  windowStart DateTime
  count       Int      @default(0)

  @@unique([key, windowStart])
  @@index([key, windowStart])
}
```

## 11. Success Metrics

Functional and correctness metrics only, per Context. No business KPIs are tracked in this scope. **A "Verified by" column is added in v2** — every target now names how it's actually checked, not just what it should equal.

| Metric | Target | Verified by *(v2, new)* |
|--------|--------|--------------------------|
| Entitlement changes with no corresponding server-verified `PaymentEvent` | 0 | Manual audit: for each `Subscription` row, every `status`/`plan` change has a matching `FULFILLMENT` `PaymentEvent` with an earlier `createdAt`. |
| Duplicate `Subscription` state transitions from a single Stripe event replayed twice | 0 (idempotency holds) | Integration test: replay the same webhook event ID twice, assert one `PaymentEvent` row and one state transition. |
| Multiple `FULFILLMENT` rows for one logical transition (e.g. `checkout.session.completed` + `customer.subscription.created` + `invoice.paid`) | 0 *(v2, new metric — implements FR-31a)* | Integration test: fire all three related events for one subscribe action, assert exactly one `FULFILLMENT` row. |
| Unhandled errors, blank screens, or default framework 404/500 pages reachable from the payment path | 0 | Manual walkthrough of every FR in Section 5 checking for a named error/empty state; confirm custom `error.tsx`/`not-found.tsx` are in place. |
| Proration amount shown to the user vs. amount actually invoiced by Stripe | Exact match | Unit test comparing the local proration calculation's output against Stripe's upcoming-invoice preview response for the same inputs. |
| Cancellations that immediately revoke access instead of waiting for period end | 0 | Manual check: after FR-29 runs, `hasProAccess()` (Section 7) still returns true until `currentPeriodEnd`. |
| Payment log rows overwritten instead of appended | 0 | Query: `SELECT id FROM "PaymentEvent" GROUP BY id HAVING COUNT(*) > 1` returns nothing, plus a code-review check that no code path calls `.update()` on `PaymentEvent`. |
| Card detail fields present anywhere in this system's database or logs | 0 | Schema review: no field in Section 10 stores card data; confirm no card fields appear in `rawPayload` logging beyond what Stripe itself returns (Stripe does not return full card numbers). |

## 12. Assumptions

| # | Assumption | Source |
|---|------------|--------|
| A1 | Payment provider is Stripe, test mode. | [MINE] |
| A2 | Single currency, USD, minor units. | [MINE] |
| A3 | Plan/price definitions live in app config, not a DB table. | [MINE] |
| A4 | Proration is daily: remaining days ÷ total days × price difference. | [MINE] |
| A5 | All period boundaries stored and compared in UTC. | [MINE] |
| A6 | Rate limits: 5/user/min and 20/IP/min on checkout initiation. | [MINE] |
| A7 | Downgrade and cancel are deferred to period end; upgrade is immediate with proration. | [MINE] |
| A8 | No card data stored anywhere. | [MINE] |
| A9 | This is an assessment/portfolio project, not a live commercial product — success metrics are functional, not business KPIs. | [MINE] |
| A10 | "Downgrade" specifically means Yearly → Monthly (still paid); "Cancel" means any paid plan → Free. These are treated as distinct flows with distinct UI. | [ADDED] |
| **A11** *(v2, corrected)* | Downgrade is implemented via a **Stripe Subscription Schedule** created at the moment of the downgrade request, with two phases (current price through period end, new price after) — not a local-only flag, and not a custom cron job re-checking dates. | [ADDED] |
| A12 | Rate limiting is implemented with a Postgres-backed counter (`RateLimitBucket`, Section 10; no Redis), acceptable only for single-instance test-mode use. | [ADDED] |
| **A13** *(v2, resolved and cut)* | Resuming a subscription that's scheduled to cancel is **out of scope in v2** — the Cancel control simply disappears once a cancellation is scheduled (FR-18). v1 had this as in-scope; the review found no backing route or Prisma transition, so it was cut rather than half-specified. | [ADDED] |
| A14 | Local development requires the Stripe CLI to forward webhooks to localhost. | [ADDED] |
| A15 | Placeholder pricing: Pro Monthly $9.00, Pro Yearly $90.00 — a test fixture, not researched pricing (see Section 8). | [ADDED] |
| **A16** *(v2, corrected)* | A user is Free either because no `Subscription` row exists yet, **or** because one exists with `plan = FREE` and `status = CANCELED` (e.g. after a prior cancellation). Both cases must be checked identically wherever entitlement or "current plan" is read (FR-2a, FR-4). `userId` is `@unique` on `Subscription`, so a returning user's row is updated on resubscribe, never re-created (FR-22). | [ADDED] |
| A17 *(v2, new)* | The Stripe Subscription Schedule ID for a pending downgrade is stored on `Subscription.stripeScheduleId`; it is the source of truth for what Stripe will actually do at renewal, while `pendingInterval` is display-only. | [ADDED] |

## 13. Phased Roadmap

| Phase | Scope |
|-------|-------|
| Phase 0 — Foundation | Wire up reused auth middleware to this app; create `Subscription`, `PaymentEvent`, and `RateLimitBucket` Prisma models and run migrations; set up Stripe test-mode account, Price IDs, and CLI webhook forwarding. **Decide and document the downgrade-scheduling mechanism (Stripe Subscription Schedules, per Section 5.8) before building checkout/fulfilment code, so initial subscription creation is compatible with it later** *(v2, new)*. |
| Phase 1 — Subscribe | Plans View (Free/Monthly/Yearly display only), Checkout Initiation (including the in-flight-session check, FR-8), webhook endpoint with signature verification + idempotency + the designated-trigger-event rule (FR-31a), Return View with polling, Free → Monthly fulfilment end to end using upsert-on-`userId` (FR-22). |
| Phase 2 — Upgrade & Billing | Monthly → Yearly upgrade with proration preview and immediate charge; Billing View showing live status and renewal date, gated through the `hasProAccess()` helper (FR-2a). |
| Phase 3 — Downgrade & Cancel | Yearly → Monthly scheduled downgrade via Subscription Schedule (FR-27); cancel flow with confirmation step and optional reason capture; pending-change indicators on Plans and Billing views. |
| Phase 4 — Hardening | Rate limiting on checkout using `RateLimitBucket`; custom error/404 pages across the payment route group; idempotency replay test; duplicate-fulfilment test (FR-31a); proration unit tests; review of every screen for a reachable dead-end state; run through the "Verified by" column in Section 11 for every metric. |

## 14. Open Questions

| # | Question | Why it matters |
|---|----------|-----------------|
| Q1 | Confirm Stripe as the provider, or specify Paystack/Flutterwave instead. | Changes the entire webhook payload shape, the proration mechanism (Stripe has native subscription proration; others may not), and the data model's provider-specific fields. |
| Q2 | Confirm currency: USD or NGN? | Affects minor-unit conventions and whether Stripe test mode needs a different account region; also resolves the wording of N7. |
| Q3 | What is the actual auth system from the prior assessment (session strategy, what fields are on the user context)? | This PRD assumes only `{ id, email }` is available; if roles or additional claims exist, the shell and route guards may need more. Now also tracked as a Risk (Section 9). |
| **Q4** *(v2, resolved)* | ~~Is resuming a scheduled cancellation actually wanted?~~ **Resolved:** cut. The Cancel control simply disappears once scheduled (FR-18, A13). | Closed by this revision — no longer open. |
| Q5 | Should `PAST_DUE` status be visible to the user anywhere, given dunning itself is out of scope? | Affects whether Billing View needs a state for this or can ignore it entirely. |
| Q6 | Are the specific rate limit numbers (5/user/min, 20/IP/min) acceptable, or should they be tuned/justified differently? | Currently an unvalidated default (A6). |
| Q7 | Is this being graded against a rubric that specifies additional required screens, fields, or behaviors not in the original brief? | Would change Functional Requirements directly. |
| Q8 | Should the yearly downgrade path also support going from Yearly directly to Free (skip Monthly), or must a user always pass through Monthly first? | Not addressed in the original brief; currently out of scope — Yearly → Free is treated as Cancel, not Downgrade. |
| **Q9** *(v2, resolved)* | ~~How should the downgrade change actually get registered with Stripe?~~ **Resolved:** via a Stripe Subscription Schedule created at the time of the downgrade request (FR-27, A11). This was the most severe defect found in the v1 review. | Closed by this revision — implementation approach settled, no longer open. |
