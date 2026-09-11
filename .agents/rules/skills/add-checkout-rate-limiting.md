---
name: add-checkout-rate-limiting
description: Apply rate limiting to checkout initiation using the Postgres-backed RateLimitBucket table. Use for /api/checkout and /lib/rateLimit.ts — never substitute Redis or an in-memory counter.
---

# Add rate limiting to checkout initiation

## The rule

Rate limiting lives in `/lib/rateLimit.ts` against the `RateLimitBucket` Postgres table (per PRD Section 10). Not Redis, not an in-memory map, not a third-party rate-limit service — regardless of how much simpler those would be for a single-instance deployment (rule 14).

## Steps

1. **Confirm the `RateLimitBucket` model exists** in the Prisma schema: `id`, `key`, `windowStart`, `count`, with `@@unique([key, windowStart])`.
2. **Apply two limits on checkout initiation**: 5 requests per user per minute, keyed `"user:<id>"`, and 20 requests per IP per minute, keyed `"ip:<addr>"` (PRD A6/FR-32). Both are checked; exceeding either one is a rate-limit hit.
3. **Implement in `/lib/rateLimit.ts`** as a fixed-window or token-bucket check against `RateLimitBucket`: read or create the row for `(key, windowStart)`, increment `count`, compare against the limit — all inside a transaction so concurrent requests don't race past the limit.
4. **Call this check first thing inside `POST /api/checkout`**, before any Flutterwave call or `PaymentEvent` write.
5. **On exceeding the limit**, return **HTTP 429** with a `Retry-After` header. The Checkout Initiation UI surfaces this as a specific "too many attempts, try again in N seconds" message — never a generic error or blank page (FR-10).

## Definition of done

- No import of Redis, an in-memory `Map`, or any external rate-limit package anywhere in the codebase.
- A test that fires 6 checkout requests for one user inside a minute gets a 429 on the 6th, with `Retry-After` set.
- The 429 path renders a named UI state, not a generic error screen.

Satisfies: PRD FR-10, FR-32, Section 7. Rule 14.
