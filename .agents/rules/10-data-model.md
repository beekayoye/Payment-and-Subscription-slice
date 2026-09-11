# Data Model Rules

Rules governing the Prisma data model, adapted from PRD Section 10 with Flutterwave translations applied.

## Enums

```
PlanTier:        FREE | PRO
BillingInterval: MONTHLY | YEARLY
SubscriptionStatus: INCOMPLETE | ACTIVE | CANCEL_SCHEDULED | CANCELED | PAST_DUE
CancellationReason: TOO_EXPENSIVE | MISSING_FEATURES | SWITCHING_PROVIDER | NOT_USING_ENOUGH | TEMPORARY_PAUSE | OTHER
PaymentEventType: INITIATION | VERIFICATION | FULFILLMENT | FAILURE
PaymentProvider:  FLUTTERWAVE  (not STRIPE)
```

## Subscription Model

- `userId` is `@unique` — one subscription per user, always.
- A user is Free either because no `Subscription` row exists, OR because one exists with `plan = FREE` and `status = CANCELED`. Both cases must be handled identically everywhere (A16).
- On resubscribe, the existing row is **updated (upsert)**, never re-created (FR-22).
- `pendingInterval` is **display-only** — it does not determine what Flutterwave will charge.
- `pendingEffectiveAt` replaces `stripeScheduleId` since Flutterwave has no schedule object.
- Use `flutterwaveCustomerEmail` and `flutterwaveSubscriptionId` instead of Stripe-named fields.

## PaymentEvent Model

- **Append-only.** Never call `.update()` on this table (rule 9).
- Every event (success or failure) is a **new row**.
- `providerEventId` has a `@unique` constraint — this is the idempotency key.
- `providerEventId` is null for INITIATION rows (not webhook-sourced).
- `amount` is always an **integer in minor units** with `currency` alongside.
- `rawPayload` stores the full provider payload as JSON.
- Provider-agnostic field names (`provider`, `providerReference`, `providerEventId`) stay exactly as the PRD specifies — only the enum value and stored data change.

## RateLimitBucket Model

- Backs the rate limiter for checkout initiation (FR-32).
- One row per `(key, windowStart)`.
- Key is prefixed: `"user:<id>"` or `"ip:<addr>"`.
- `@@unique([key, windowStart])` constraint.

## Plan Config

- Plan/price/interval definitions live in **app config** (`/src/config/plans.ts`), NOT in a database table (PRD A3).
- Pricing is a test fixture: Pro Monthly $9.00 (900 minor units), Pro Yearly $90.00 (9000 minor units).
