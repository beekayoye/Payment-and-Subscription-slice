---
name: implement-subscribe-flow
description: Build the Free→Monthly or Free→Yearly path — Checkout Initiation, the redirect, and webhook-driven fulfilment. Use for /checkout, /checkout/return, and /api/checkout.
---

# Implement the subscribe flow (Free → Pro Monthly / Pro Yearly)

## Scope check first

Only reachable for a Free → Monthly or Free → Yearly transition. A user with an active paid subscription must be redirected to the Billing View, never shown checkout again (FR-8).

## Steps

1. **Checkout Initiation UI** (`/checkout/page.tsx`): only rendered for the Free → paid transition per FR-7's routing rule.
2. **`POST /api/checkout`**:
   - Apply rate limiting first — see [add-checkout-rate-limiting.md](add-checkout-rate-limiting.md). A rate-limited request returns a specific "too many attempts, try again in N seconds" message, never a generic error or blank page (FR-10).
   - Check for an existing `INCOMPLETE`-status checkout from this user within the last 10 minutes; if found, redirect to that existing session/reference instead of creating a new one (FR-8).
   - Initiate Flutterwave hosted payment/inline checkout with the target Payment Plan ID (`FLW_PLAN_MONTHLY` or `FLW_PLAN_YEARLY`).
   - Write a `PaymentEvent(eventType: INITIATION, providerReference: tx_ref)` row — see [log-payment-event.md](log-payment-event.md). No entitlement is granted at this step.
   - Redirect the browser to Flutterwave's hosted checkout URL.
   - If Flutterwave session creation fails (network error, invalid plan ID, provider outage), return a specific retry-capable error, not a 500 (FR-11).
3. **Return View** (`/checkout/return/page.tsx`):
   - Never read plan or payment state from the URL or any client-supplied value — treat any reference in the URL as a lookup hint at most (FR-12).
   - On load, fetch `Subscription` state via `GET /api/subscription/status`. If already `ACTIVE`, show success immediately (FR-13).
   - If not yet `ACTIVE`, show a "processing your payment" state and poll the status endpoint (e.g. every 2 seconds, capped at 15 attempts / 30 seconds) (FR-14).
   - If polling exceeds the cap without reaching `ACTIVE`, show a specific "this is taking longer than expected" state with manual refresh and a link to Billing — never a blank page or spinner-forever (FR-15).
   - If a `FAILURE` `PaymentEvent` exists for this session before `ACTIVE` is reached, show a specific failure state with a link back to Plans (FR-16).
4. **Fulfilment** happens only inside the webhook route — see [implement-flutterwave-webhook.md](implement-flutterwave-webhook.md). It never happens from the Return View redirect itself (FR-22).
   - Fulfilment **upserts** the `Subscription` row keyed on `userId` — creates a new row on first-ever subscribe, updates the existing row on resubscribe. `userId` is `@unique`, so a blind `create` will fail for a returning user who has cancelled before; always upsert.
   - Sets `status = ACTIVE`, `plan = PRO`, `interval` from the purchased plan, `currentPeriodStart`/`currentPeriodEnd` from Flutterwave's data (FR-23).

## Definition of done

- No entitlement is granted anywhere in the checkout-initiation or return-view code paths — only the webhook route writes to `Subscription`.
- Every named state in steps 3 has a distinct UI (processing / success / stuck / failed) — none of them collapse into a generic spinner or error.
- Resubscribe (user cancelled once, subscribes again) updates the existing row rather than erroring on a unique-constraint violation.

Satisfies: PRD FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-22, FR-23, G1. Rules 1, 3, 4, 12.
