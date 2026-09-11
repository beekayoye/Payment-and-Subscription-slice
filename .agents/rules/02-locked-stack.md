# Locked Stack — No Substitutions

These decisions are final. Do not evaluate alternatives, suggest swaps, or abstract "for flexibility." If a task breaks one of these, the task has failed.

## Technology

| Layer | Locked Choice |
|---|---|
| Framework | Next.js, **App Router** (not Pages Router) |
| Language | TypeScript, **strict mode on** |
| ORM | Prisma — no raw SQL unless documented exception (see code-style rule) |
| Database | PostgreSQL — not MongoDB, SQLite, or any document store |
| Payment provider | **Flutterwave**, sandbox/test mode — not Stripe, not Paystack, no abstraction layer |
| Rate limiter storage | Postgres-backed `RateLimitBucket` table — not Redis, not in-memory, not third-party |
| Auth | Reused as-is from prior assessment — do not build, extend, or "improve" |

## Money Storage

Every money amount is a **whole integer in minor units** (kobo for NGN, cents for USD), with the currency stored alongside as its own column. Never use a float or decimal type for money. Anywhere. Ever.

## Environment Variables

Use Flutterwave env vars, not Stripe:

| Use This | Not This |
|---|---|
| `FLW_SECRET_KEY` | `STRIPE_SECRET_KEY` |
| `FLW_PUBLIC_KEY` | *(no Stripe equivalent)* |
| `FLW_SECRET_HASH` | `STRIPE_WEBHOOK_SECRET` |
| `FLW_PLAN_MONTHLY` | `STRIPE_PRICE_MONTHLY` |
| `FLW_PLAN_YEARLY` | `STRIPE_PRICE_YEARLY` |

## Prisma Enum Values

- Use `PaymentProvider.FLUTTERWAVE`, not `STRIPE`.
- Rename Stripe-specific fields: `flutterwaveCustomerEmail`, `flutterwaveSubscriptionId`, `pendingInterval` + `pendingEffectiveAt` (replaces `stripeScheduleId`).
- Keep provider-agnostic field names as-is: `provider`, `providerReference`, `providerEventId`.
