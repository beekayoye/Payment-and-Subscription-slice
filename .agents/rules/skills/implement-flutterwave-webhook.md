---
name: implement-flutterwave-webhook
description: Build or modify the Flutterwave webhook route — raw-body signature verification, server-side transaction re-verification, idempotency, then fulfilment. Use whenever touching /app/api/webhooks/flutterwave/route.ts or anything under /lib/flutterwave/.
---

# Implement the Flutterwave webhook route

## Preconditions

- Phase 0's downgrade-scheduling design decision is already documented (see [implement-downgrade-flow.md](implement-downgrade-flow.md)) — fulfilment for a downgrade-completion event depends on it.
- `PaymentEvent` and `Subscription` Prisma models exist and migrations are applied.

## Steps, in order — do not reorder or skip any step

1. **Read the raw body first.** Disable Next.js body parsing for this route; call `req.text()` (or equivalent) before any JSON parsing happens anywhere in the request lifecycle.
2. **Verify the signature.** Compute `HMAC-SHA256(FLW_SECRET_HASH, rawBody)` in `/lib/flutterwave/verifySignature.ts` and compare against the `flutterwave-signature` header. On mismatch, return **HTTP 401** immediately — do not parse the payload as JSON, do not log it as a trusted event.
3. **Parse the payload** only after signature verification passes.
4. **Re-verify the transaction server-side.** Call Flutterwave's transaction verification endpoint (`/lib/flutterwave/verifyTransaction.ts`) with the transaction ID from the payload. Confirm `status`, `amount`, and `currency` all match what was expected for this checkout/charge. Both signature verification and this call must pass — neither alone is sufficient.
5. **Check idempotency.** Look up the transaction ID against `PaymentEvent.providerEventId` (unique constraint). If a row already exists, return **HTTP 200** immediately and do nothing further — this is what makes a Flutterwave retry (up to 3 attempts, 30 minutes apart) safe.
6. **Record the event.** Write a new `PaymentEvent` row with the full raw payload (see [log-payment-event.md](log-payment-event.md)). `eventType = VERIFICATION` for confirmation events, `FAILURE` for failed payments. Never call `.update()` on `PaymentEvent` — every event is a new row.
7. **Apply fulfilment, but only from the one designated trigger event for this transition type.** Subscribe, upgrade-completion, downgrade-completion, and cancellation-completion each have exactly one event type allowed to write to `Subscription`. Every other related event for the same logical transition still gets its own `PaymentEvent` row (step 6) but must not touch `Subscription`. If you're not certain which event type is the designated trigger for a transition you're implementing, that's an open question — see [handle-spec-ambiguity.md](handle-spec-ambiguity.md), don't guess.
8. **On fulfilment**, update `Subscription` (`status`, `plan`, `interval`, `currentPeriodStart`, `currentPeriodEnd`; clear `pendingInterval`/`pendingEffectiveAt` if a scheduled downgrade just took effect; set `status = CANCELED` and `plan = FREE` if this is a cancellation-completion event) and write a second `PaymentEvent(eventType: FULFILLMENT)` row describing exactly what changed.
9. **On failure**, write a `FAILURE` event and stop — no retry, no dunning logic.

## Definition of done

- Steps 1–2 happen before any other code touches the request body (grep the route to confirm).
- A failing signature check never reaches step 3.
- The route has a test that replays one event twice and asserts exactly one `PaymentEvent` row and one state transition.
- The route has a test that fires all related events for one transition (e.g. multiple event types for one subscribe) and asserts exactly one `FULFILLMENT` row.
- No card data appears in `rawPayload` or anywhere else logged.

Satisfies: PRD Section 6, FR-22, FR-26, FR-28, FR-30, FR-31, FR-31a, G5, G6. Rules 1, 4, 5, 6, 9.
