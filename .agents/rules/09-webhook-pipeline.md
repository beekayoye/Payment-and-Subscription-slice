# Webhook & Payment Verification Pipeline

The complete end-to-end pipeline for handling Flutterwave payment events, adapted from PRD Section 6 with the AGENTS.md Q2 Flutterwave translation applied.

## Pipeline Steps (in order)

### 1. Initiation
- User selects a plan on Plans View.
- Server initiates Flutterwave hosted payment/inline checkout with the target Payment Plan ID.
- A `PaymentEvent(eventType: INITIATION, providerReference: tx_ref)` row is written.
- User is redirected to Flutterwave's hosted checkout page.
- **No entitlement exists yet.**

### 2. Payment
- User pays on Flutterwave's page. No card data ever reaches this application.

### 3. Redirect
- Flutterwave redirects to the Return View. The Return View treats any URL parameters as a **lookup hint only**, never as proof of payment (FR-12).

### 4. Webhook Delivery
- Flutterwave POSTs webhook events to `POST /api/webhooks/flutterwave`.
- Flutterwave retries non-200 responses up to 3 times at 30-minute intervals.

### 5. Signature Verification
- Read **raw request body** before any parsing (disable Next.js body parsing for this route).
- Compute `HMAC-SHA256(FLW_SECRET_HASH, rawBody)`.
- Compare against the `flutterwave-signature` header.
- On mismatch: reject with **HTTP 401**. Do not parse. Do not log as trusted.

### 6. Transaction Re-Verification
- Call Flutterwave's transaction verification endpoint server-side with the transaction ID.
- Confirm **status**, **amount**, and **currency** match expected values.
- Only proceed if both signature AND transaction verification pass.

### 7. Idempotency Check
- Check the transaction ID against `PaymentEvent.providerEventId` (unique constraint).
- If row already exists: return **HTTP 200** immediately, do nothing further.
- This makes Flutterwave retries safe.

### 8. Recording
- Write a `PaymentEvent` row with the full raw payload.
- `eventType` based on event type: `VERIFICATION` for confirmation events, `FAILURE` for failed payments.

### 9. Fulfilment
- For success events: update the `Subscription` row (status, plan, interval, period dates).
- Write a second `PaymentEvent(eventType: FULFILLMENT)` recording what changed.
- **One designated trigger event per transition type** — all other related events are recorded but do NOT trigger fulfilment writes (FR-31a).

### 10. Failure Handling
- For failed payments: record a `FAILURE` event.
- No automated retry or dunning (N4).

### 11. Read Path
- Return View and Billing View ONLY read `Subscription` and `PaymentEvent` rows from the database.
- They NEVER call Flutterwave directly to check payment status.
- They NEVER trust redirect query parameters as entitlement signals.
- They read entitlement through `hasProAccess()` only.
