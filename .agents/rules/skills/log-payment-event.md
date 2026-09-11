---
name: log-payment-event
description: Write a PaymentEvent row correctly. Use this any time a code path is about to record a checkout initiation, a verified webhook event, a fulfilment, or a failure.
---

# Log a PaymentEvent

## The rule

`PaymentEvent` is **append-only**. Every event — success or failure — is a new row. If you're about to write `.update()` against this table, stop; that breaks an audit guarantee the whole system depends on (rule 9).

## Which `eventType` to use

| Situation                                             | `eventType`    | `providerEventId`                                        |
| ----------------------------------------------------- | -------------- | -------------------------------------------------------- |
| Checkout initiated, redirecting to Flutterwave        | `INITIATION`   | `null` (not webhook-sourced, not retried by Flutterwave) |
| Webhook signature + transaction verified              | `VERIFICATION` | Flutterwave transaction ID                               |
| Entitlement change actually applied to `Subscription` | `FULFILLMENT`  | Flutterwave transaction ID                               |
| Declined payment, failed verification, provider error | `FAILURE`      | Flutterwave transaction ID if one exists, else `null`    |

## Every row must have

- `provider = PaymentProvider.FLUTTERWAVE`.
- `providerReference`: `tx_ref` for `INITIATION` rows; the Flutterwave transaction ID for `VERIFICATION`/`FULFILLMENT`/`FAILURE` rows.
- `amount` as a whole integer in minor units, `currency` alongside it as its own field — never a float, never a decimal type, not even for a row that's "just for display" (rule 8).
- `status`: the raw provider status string as Flutterwave returned it (e.g. `"successful"`, `"failed"`) — don't normalize or rename it.
- `rawPayload`: the full provider payload as JSON. Before writing it, confirm no card number or CVV is embedded in what Flutterwave sent — it shouldn't be, but this is the row that would leak it if something upstream changed (rule 7).
- `userId`, and `subscriptionId` when one exists yet (it won't for the very first `INITIATION` row of a brand-new user).

## Idempotency

`providerEventId` carries a `@unique` constraint — this is the idempotency key. Before writing a `VERIFICATION`/`FULFILLMENT`/`FAILURE` row, check whether one already exists for this transaction ID; if it does, the caller (the webhook route) should already have returned HTTP 200 and stopped before reaching this point — see [implement-flutterwave-webhook.md](implement-flutterwave-webhook.md).

## Definition of done

- `grep -rn "\.update(" prisma-using-code` touching `PaymentEvent` returns nothing.
- Every `INITIATION` row has `providerEventId: null`.
- No money field anywhere is a `Float` or `Decimal` in the Prisma schema or the write payload.

Satisfies: PRD FR-31, FR-31a, Section 11 metric. Rules 7, 8, 9.
