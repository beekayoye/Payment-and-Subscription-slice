# Flutterwave Integration Rules

The PRD was written for Stripe. The actual provider is **Flutterwave**. This file is the authoritative translation. If a Stripe-specific detail in the PRD has no entry here, treat it as an open question — do not improvise.

## Webhook Signature Verification

- Read the **raw request body** before any parsing.
- Compute `HMAC-SHA256(FLW_SECRET_HASH, rawBody)`.
- Compare the result against the `flutterwave-signature` request header.
- Reject mismatches with **HTTP 401**, before touching the payload.
- This replaces `stripe.webhooks.constructEvent`.

## Transaction Re-Verification

- After signature verification, call Flutterwave's **transaction verification endpoint** server-side with the transaction ID from the payload.
- Confirm **status, amount, and currency** match expectations **before granting any entitlement**.
- The signature proves the request came from Flutterwave; it does NOT prove the transaction succeeded for the expected amount.
- **Both checks are required — neither alone is sufficient.**

## Idempotency

- Key on Flutterwave's **transaction ID** (or `tx_ref` for initiation-side dedup).
- Flutterwave retries non-200 responses up to **3 times at 30-minute intervals**.
- The idempotency check must hold under that retry pattern.

## Checkout / Subscription Creation

- Use Flutterwave **hosted payment / inline checkout** with the target Payment Plan ID passed at charge time.
- A Flutterwave subscription is created automatically on the customer's **first successful charge against a plan** — there is no separate "create subscription" call.
- This replaces Stripe Checkout Session (`mode: subscription`).

## Downgrade Mechanism

- **Flutterwave has NO equivalent to Stripe Subscription Schedules.**
- Subscriptions are tied to a plan and customer email and cannot be modified in place.
- Changing plan = cancel current subscription + create new one on the new plan.
- Deferred downgrade must be tracked and executed entirely by our application (scheduled job or webhook-triggered check).
- **Phase 0 design decision**: the exact mechanism must be decided and documented before writing checkout/fulfilment code.

## Upgrade / Proration

- **Flutterwave does NOT calculate proration.**
- Calculate proration ourselves: `remaining days ÷ total days × price difference` (daily proration formula from PRD A4).
- Show the prorated amount to the user for confirmation.
- Execute as an explicit **direct charge** against the customer's saved payment method.
- Then cancel old-plan subscription and start new-plan subscription.

## Customer Identification

- Flutterwave subscriptions key off **email**, not a separate customer ID.
- Use `flutterwaveCustomerEmail` instead of `stripeCustomerId`.
- Use `flutterwaveSubscriptionId` instead of `stripeSubscriptionId`.
- Replace `stripeScheduleId` with `pendingInterval` + `pendingEffectiveAt` (a timestamp).

## Local Development

- Use any HTTPS tunnel (e.g. ngrok) pointed at the webhook route.
- Flutterwave cannot reach `localhost` directly.
