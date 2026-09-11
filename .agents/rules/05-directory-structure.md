# Directory Structure & Module Boundaries

Use exactly this layout. Do not invent parallel structures, put API logic in components, or reach into Prisma from a React component.

## Required Layout

```
/prisma
  schema.prisma
  migrations/

/src
  /app
    /(shell)/
      layout.tsx              # signed-in shell: auth guard, current-plan header (FR-1, FR-2)
    /plans/
      page.tsx                # Plans View (FR-3–FR-7)
    /checkout/
      page.tsx                # Checkout Initiation UI (FR-8–FR-11)
      /return/
        page.tsx              # Return View (FR-12–FR-16)
    /billing/
      page.tsx                # Billing View (FR-17–FR-21)
    /api
      /checkout/route.ts               # FR-8, FR-9, rate-limited
      /webhooks/flutterwave/route.ts   # raw-body; signature verify → transaction verify → idempotency → fulfilment
      /subscription/
        /upgrade/route.ts              # FR-24–FR-26
        /downgrade/route.ts            # FR-27–FR-28
        /cancel/route.ts               # FR-29–FR-30
        /status/route.ts               # Return View polling and Billing View
    error.tsx                          # required — G7
    not-found.tsx                      # required — G7

  /lib
    entitlement.ts           # hasProAccess() — ONLY export for entitlement (FR-2a)
    proration.ts             # daily proration calculation, unit-tested in isolation
    rateLimit.ts             # RateLimitBucket read/write logic
    db.ts                    # single Prisma client instance
    /flutterwave/
      client.ts              # thin wrapper around Flutterwave API calls
      verifySignature.ts     # flutterwave-signature HMAC check
      verifyTransaction.ts   # server-side transaction re-verification

  /config
    plans.ts                 # plan/price/interval config — NOT database-driven (PRD A3)

  /components
    ...                      # presentational only; no Prisma or Flutterwave calls

/tests
  /unit
    proration.test.ts
    entitlement.test.ts
  /integration
    webhook-idempotency.test.ts       # replay same event twice → one PaymentEvent, one transition
    webhook-dedupe-fulfilment.test.ts # multiple related events → one FULFILLMENT row
```

## Boundaries That Must Hold

1. **Entitlement**: Nothing outside `/lib/entitlement.ts` computes Pro access. Every screen, route handler, and middleware imports `hasProAccess()` from there.

2. **Flutterwave surface**: Nothing outside `/app/api/webhooks/flutterwave/route.ts` and `/lib/flutterwave/*` talks to Flutterwave's webhook or verification surface. UI code never calls Flutterwave directly.

3. **Prisma client**: Nothing outside `/lib/db.ts` instantiates a Prisma client. One instance, imported everywhere.

4. **Proration math**: Lives only in `/lib/proration.ts` for isolated unit testing.

5. **Components**: Presentational only — no direct Prisma or Flutterwave calls from any component.
