# Subscription & Payment Slice — Documentation

---

## 1. What This Is

This is a test-mode subscription billing slice. A signed-in user holds one of three states on their own user record — Free, Pro Monthly, or Pro Yearly — and can move between them: subscribe to a paid plan through Flutterwave's hosted checkout, upgrade from Monthly to Yearly mid-cycle with a prorated charge calculated and shown before they confirm, schedule a downgrade that is deferred to the end of the period they already paid for, and cancel while keeping access until that period ends. Every payment-related event is written to an append-only log. Entitlement is only ever granted after Flutterwave's webhook has been signature-verified *and* the transaction has been independently re-verified against Flutterwave's own API — never on the strength of a redirect or anything the browser claims.

What is deliberately not here: there is no landing page, no pricing marketing page, and no product feature locked behind the paywall. The thing being sold is a plan flag on a user record and nothing more, because the point of this slice is to prove the billing mechanics are correct, not to build a product around them. There are also no refunds, no dunning or retry logic when a renewal fails, no admin dashboard, no team or multi-seat billing, no multi-currency support, and no "resume subscription" control once a cancellation is scheduled. Those are scope cuts made up front, not oversights. Section 7 separates them from the things that are genuinely incomplete.

---

## 2. How To Run It

### What to install

- **Node.js 24.16.0** — pinned exactly in `package.json` under `engines`. Odd-numbered and experimental releases are not supported.
- **Docker Desktop** — used to run PostgreSQL. A native Postgres install works equally well if you prefer; you only need a reachable Postgres 16 instance.
- A **Flutterwave test account** — https://dashboard.flutterwave.com

### Steps

**1. Install dependencies.**

```bash
npm install
```

This also runs `prisma generate` via the `postinstall` hook, which writes the typed Prisma client into `src/generated/prisma`. That directory is gitignored and regenerated, never edited by hand.

**2. Start PostgreSQL.**

```bash
docker run --name subscription-db -e POSTGRES_USER=appuser -e POSTGRES_PASSWORD=appsecret \
  -e POSTGRES_DB=subscription_system -p 5432:5432 -d postgres:16-alpine
```

If Docker Desktop is not running, nothing will be listening on port 5432 and the app fails with `ECONNREFUSED`. This is the single most common startup failure — see Section 6.

**3. Create `.env`.**

Copy the template and fill it in:

```bash
cp .env.example .env
```

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Your Postgres connection string. Must match the credentials from step 2. |
| `FLW_BASE_URL` | `https://api.flutterwave.com/v3` for a v3 account. **Must match the generation of your key** — a v3 key sent to the v4 host returns 401. |
| `FLW_SECRET_KEY` | Flutterwave Dashboard → Settings → API. Looks like `FLWSECK_TEST-…`. |
| `FLW_PUBLIC_KEY` | Same dashboard page. |
| `FLW_ENCRYPTION_KEY` | Same dashboard page. Only used for encrypted direct card charges; the hosted-checkout flow here does not touch it. |
| `FLW_PLAN_MONTHLY` / `FLW_PLAN_YEARLY` | Numeric Payment Plan IDs from Dashboard → Payment Plans. Create two plans ($9 / 30 days, $90 / 365 days). **While these are empty, checkout is a one-off payment and no recurring subscription is created.** |
| `FLW_SECRET_HASH` | You invent this. Put the same value in Dashboard → Settings → Webhooks → "Secret hash". Verification is an exact string comparison, so any mismatch rejects every webhook. |
| `FLW_MOCK_MODE` | `false` for real payments. `true` only for the offline test suite — it fakes provider responses, so checkout reports success with no money moving. |
| `AUTH_SECRET` | You invent this. Minimum 32 characters. Signs the session cookie; changing it invalidates all existing sessions. |
| `APP_URL` | `http://localhost:3000` locally. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Your mail provider. With Gmail, `SMTP_PASS` must be an App Password (not your account password) and `SMTP_FROM` must match `SMTP_USER` or a verified alias, or the send is rejected. If `SMTP_HOST`/`SMTP_USER` are left blank the app logs verification codes to the server console instead of emailing them, which is fine for local review. |

`.env.example` is committed with commented placeholders. `.env` is gitignored and must never be committed.

**4. Apply migrations.**

```bash
npm run prisma:migrate
```

Creates `User`, `Subscription`, `PaymentEvent`, and `RateLimitBucket` with their indexes and constraints.

**5. Start the app.**

```bash
npm run dev
```

**6. Open it.**

http://localhost:3000 — this redirects straight to `/plans`. There is no page at `/` by design (no landing page).

### To test webhooks

Flutterwave cannot reach `localhost`. You need a public HTTPS tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

Take the `https://…trycloudflare.com` host it prints and set the webhook URL in Flutterwave → Settings → Webhooks to `https://<that-host>/api/webhooks/flutterwave`. The hostname changes on every restart, so it has to be re-pasted. Without a running tunnel no webhook ever arrives, fulfilment never happens, and the Return View spins until it times out.

---

## 3. The Flow, Step By Step

### Signing up and getting a session

The user lands on `/plans` and is redirected to `/sign-in` because no session exists. The guard doing this lives in `src/app/(shell)/layout.tsx`, which calls `getSessionUser()` and redirects when it returns null — every screen inside the `(shell)` route group inherits it.

On `/sign-up` the user submits name, email, and password. The browser POSTs JSON to `/api/auth/signup`. That route (`src/app/api/auth/signup/route.ts`) validates the fields, bcrypt-hashes the password, generates a 6-digit code and a 32-byte token, stores both on the `User` row with a 24-hour expiry, and dispatches an email via `src/lib/email.ts`. It deliberately does not create a session yet — an unverified account cannot sign in.

The user enters the code on `/verify-email`, which POSTs to `/api/auth/verify-email`. That route compares the submitted code (or the token from the email link) against the stored value, checks expiry, sets `emailVerified = true`, clears the code, and only then calls `setSessionCookie()`. The user is redirected to `/plans`.

Signing in later POSTs to `/api/auth/signin`, which looks up the user, bcrypt-compares the password, refuses with a distinct `EMAIL_NOT_VERIFIED` error if the address was never confirmed, and otherwise sets the session cookie.

### Choosing a plan

`/plans` is a server component (`src/app/(shell)/plans/page.tsx`). It loads the user's `Subscription` row, computes entitlement through `hasProAccess()`, and hands a plain DTO to `src/components/PlansClient.tsx`. The three cards are read from `src/config/plans.ts` — application config, never a database table, so prices cannot drift per-environment.

Clicking a paid plan the user is not already on POSTs `{ planId }` to `/api/checkout`.

### Checkout initiation

`src/app/api/checkout/route.ts` does six things in order:

1. Resolves the session; 401 if absent.
2. Extracts the client IP from `x-forwarded-for`.
3. Calls `checkCheckoutRateLimit()` — 5 requests per user per minute, 20 per IP. Over the limit returns **429** with a `Retry-After` header.
4. Validates `planId` against the config.
5. Refuses with `ALREADY_ACTIVE` if `hasProAccess()` is already true, pointing the user at `/billing`.
6. Looks for an `INITIATION` event from the last 10 minutes for the same plan and, **only if no terminal event has landed since**, returns that existing checkout link rather than creating a second one. This absorbs double-clicks without resurrecting a spent link.

It then calls `initiateFlutterwavePayment()` in `src/lib/flutterwave/client.ts`, writes a `PaymentEvent` with `eventType: INITIATION` and `providerReference: tx_ref`, and returns the hosted checkout URL. **No entitlement is granted here.**

### Paying

The browser navigates to Flutterwave's hosted page. Card details are entered on Flutterwave's infrastructure and never touch this application. Flutterwave then redirects back to `/checkout/return`.

### The Return View

`src/app/(shell)/checkout/return/page.tsx` renders `src/components/ReturnClient.tsx`. The URL carries `status`, `tx_ref`, and `transaction_id` query parameters, and **all of them are ignored as proof of anything**. The component polls `GET /api/subscription/status` every 2 seconds, up to 15 times, and decides what to show purely from what the database says:

- already `ACTIVE` → success
- a `FAILURE` event recorded → failure state with a link back to Plans
- 15 attempts elapsed → "taking longer than expected", with a manual retry and a link to Billing
- a 401 → a distinct "session expired" state, because retrying cannot fix that

### Fulfilment — where entitlement is actually granted

Asynchronously, Flutterwave POSTs to `/api/webhooks/flutterwave` (`src/app/api/webhooks/flutterwave/route.ts`). The order matters and is strict:

1. `await req.text()` — the **raw** body, before any JSON parsing.
2. Verify the signature from the `flutterwave-signature` or `verif-hash` header via `src/lib/flutterwave/verifySignature.ts`. Mismatch → **401**, and the payload is never parsed or trusted. A missing `FLW_SECRET_HASH` also rejects rather than falling back to a default.
3. Parse the JSON.
4. Re-verify the transaction server-side with `verifyFlutterwaveTransaction()` against Flutterwave's own API, confirming status, amount, and currency. The signature proves the request came from Flutterwave; it does not prove the payment succeeded for the expected amount. Both checks are required.
5. Idempotency: look up `providerEventId` (the provider's transaction id). If a row exists, return **200** immediately and do nothing else.
6. Write a `VERIFICATION` `PaymentEvent`.
7. Check the event is the designated fulfilment trigger for this transition. Every other related event is still logged for audit but does **not** touch `Subscription`.
8. Upsert the `Subscription` on `userId` — create on first subscribe, update on resubscribe — setting `status = ACTIVE`, `plan = PRO`, the interval, and the period dates.
9. Write a second `PaymentEvent` with `eventType: FULFILLMENT`.

The Return View's next poll sees `ACTIVE` and flips to success.

### A note on the UI layer

Every screen above is a thin server component that resolves the session, reads the database, computes entitlement once via `hasProAccess()`, and passes a plain serialisable DTO to a client component (`PlansClient`, `CheckoutClient`, `ReturnClient`, `BillingClient`). No client component touches Prisma or Flutterwave — that boundary is deliberate, so provider and database access stay in auditable places.

Styling comes from the project's design tokens rather than ad-hoc values. `src/app/globals.css` imports `design-tokens.css` (generated from `design-tokens.tokens.json` by `design-tokens-to-css.js`) and the DM Sans family, then builds the shared `.btn`, `.badge`, `.alert`, `.modal-*`, and shell classes on top of the semantic `--color-*`, `--spacing-*`, and `--typography-*` variables. Components reference the semantic role tokens (`var(--color-primary)`, `var(--color-error)`) and never the raw primitive palette, so the theme stays changeable in one place.

### Upgrade, downgrade, cancel

`/billing` (`src/app/(shell)/billing/page.tsx` → `src/components/BillingClient.tsx`) shows plan, interval, status, renewal or access-end date, and any pending downgrade.

- **Upgrade** — `GET /api/subscription/upgrade` returns a proration *preview* computed by `calculateUpgradeProration()`. The user confirms, and `POST` to the same route recalculates the amount server-side (never trusting the number the client was shown), charges it, switches the row to Yearly, and records the charge as its own `PaymentEvent`.
- **Downgrade** — `POST /api/subscription/downgrade` sets `pendingInterval = MONTHLY` and `pendingEffectiveAt = currentPeriodEnd`. `interval` itself is untouched; the user keeps Yearly until the boundary.
- **Cancel** — `POST /api/subscription/cancel` sets `cancelAtPeriodEnd = true`, moves status to `CANCEL_SCHEDULED`, and stores the optional reason immediately. Because `hasProAccess()` treats `CANCEL_SCHEDULED` as entitled, access survives until the period ends.

---

## 4. The Data Model

### `User`

Holds an account and its credential and email-verification state.

```prisma
model User {
  id                  String    @id @default(cuid())
  email               String    @unique
  name                String
  passwordHash        String
  emailVerified       Boolean   @default(false)
  verificationCode    String?
  verificationExpires DateTime?
  resetToken          String?
  resetExpires        DateTime?
  subscription        Subscription?
  paymentEvents       PaymentEvent[]
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  @@index([email])
}
```

- `id` is `cuid()` rather than an auto-increment integer: sequential ids leak how many users exist and make one account's id guessable from another's.
- `passwordHash` is non-nullable — there is no code path that creates an account without a hash, so the column should not permit one.
- `emailVerified` defaults to `false`, so a new row is unverified unless something explicitly proves otherwise. Defaulting to `true` would make a missed update silently grant access.
- `verificationCode`, `verificationExpires`, `resetToken`, `resetExpires` are all nullable because they only exist during a flow and are cleared afterward. A non-null code on a verified account would be a stale credential left lying around.

### `Subscription`

One row per user describing the plan they currently hold.

```prisma
model Subscription {
  id                        String             @id @default(cuid())
  userId                    String             @unique
  plan                      PlanTier           @default(FREE)
  interval                  BillingInterval?
  status                    SubscriptionStatus @default(INCOMPLETE)
  currentPeriodStart        DateTime?
  currentPeriodEnd          DateTime?
  cancelAtPeriodEnd         Boolean            @default(false)
  cancellationReason        CancellationReason?
  cancellationReasonOther   String?
  pendingInterval           BillingInterval?
  pendingEffectiveAt        DateTime?
  flutterwaveCustomerEmail  String
  flutterwaveSubscriptionId String?            @unique
}
```

- `plan`, `interval`, `status`, and `cancellationReason` are **enums, not strings**. A typo like `"ACTIVE "` or `"Pro"` becomes a database error instead of a subscription that silently never matches an entitlement check.
- `interval` is nullable because Free has no billing interval. Forcing a value would mean inventing a meaningless one.
- `currentPeriodStart` / `currentPeriodEnd` are nullable for the same reason: a Free or never-yet-confirmed subscription has no paid period. They are the authority for when access ends, so they come from the provider rather than being recalculated locally.
- `cancellationReason` is nullable and stays that way when the user skips the prompt — skipping is explicitly allowed. `cancellationReasonOther` is free text used only when the reason is `OTHER`.
- `pendingInterval` / `pendingEffectiveAt` record a scheduled downgrade for display. They are **not** the source of truth for what the provider will charge.

### `PaymentEvent`

The append-only audit log. One row per payment-related thing that happened.

```prisma
model PaymentEvent {
  id                String           @id @default(cuid())
  userId            String
  subscriptionId    String?
  eventType         PaymentEventType
  provider          PaymentProvider  @default(FLUTTERWAVE)
  providerReference String
  providerEventId   String?          @unique
  amount            Int
  currency          String
  status            String
  rawPayload        Json
  createdAt         DateTime         @default(now())
}
```

- `amount` is `Int` holding **minor units** (cents/kobo). Never `Float` or `Decimal`. See Section 5.
- `currency` is stored alongside every amount, because `900` is meaningless without knowing it is USD.
- `status` is the provider's **raw** status string, deliberately un-normalised, so the log records what the provider actually said rather than this app's interpretation of it.
- `providerEventId` is nullable — `INITIATION` rows are created by this app, not by a webhook, so they have no provider event id and are not subject to provider retries.
- `subscriptionId` is nullable because the very first `INITIATION` for a brand-new user happens before any `Subscription` row exists.
- `rawPayload` is `Json` so the complete provider payload is preserved for later debugging without having to predict which fields matter.

### `RateLimitBucket`

A fixed-window counter, one row per key per window.

```prisma
model RateLimitBucket {
  id          String   @id @default(cuid())
  key         String
  windowStart DateTime
  count       Int      @default(0)
  @@unique([key, windowStart])
}
```

- `key` is prefixed (`user:<id>` or `ip:<addr>`) so both limits share one table without colliding.
- `windowStart` is the floor of the current minute, which is what makes the window deterministic across processes.

### Which constraints make an invalid state impossible

These are load-bearing, not decorative. All are present in the live database (verified via `pg_indexes` and `pg_constraint`):

| Constraint | What it prevents |
|---|---|
| `PaymentEvent.providerEventId` **UNIQUE** | The same provider event being recorded twice. This is the idempotency guarantee. Flutterwave retries a non-200 webhook 3 times, and two deliveries can race; the application check narrows the window but this index is what makes double-processing *impossible* rather than merely unlikely. |
| `Subscription.userId` **UNIQUE** | A user ending up with two subscription rows — which would make "what plan am I on?" ambiguous and let entitlement depend on which row was read. It is also what makes `upsert` on `userId` the correct operation for a returning subscriber. |
| `User.email` **UNIQUE** | Two accounts on one address, which would make sign-in non-deterministic and let someone hijack a pending verification by re-registering. |
| `Subscription.flutterwaveSubscriptionId` **UNIQUE** | Two local users pointing at one provider subscription, where cancelling one would silently revoke the other's access. |
| `RateLimitBucket (key, windowStart)` **UNIQUE** | Two counter rows for the same window. Without it, concurrent requests each insert their own row, every counter reads `1`, and the limit never triggers. It is what makes the atomic upsert-and-increment correct. |
| `Subscription.userId` → `User.id` **FK** (`ON DELETE RESTRICT`) | A subscription orphaned from its user, and deletion of a user who still has billing state. |
| `PaymentEvent.userId` → `User.id` **FK** | Audit rows attributed to a user that does not exist, which would make the log untrustworthy as evidence. |
| `amount Int` (type as constraint) | A fractional currency amount ever being representable. |

---

## 5. The Concepts

The concepts below are the brief's eleven engineering requirements, each given its own subheading, followed by the three authentication concepts — authentication was built in this project and wired into this slice, so it is in scope here too (see the disclosure in Section 7).

### Money in Minor Units

**What it is.** Every amount is stored as a whole number of the currency's smallest unit — 900 means $9.00, not 9.0 — with the currency code kept in its own column next to it. Nothing in the money path is ever a decimal or floating-point number.

**Why it is needed.** Floating point cannot represent most decimal fractions exactly. `0.1 + 0.2` is `0.30000000000000004`. Accumulate that across a prorated upgrade and a stored invoice total and you get an amount that disagrees with what the provider charged by a cent — which means a reconciliation that never balances and a customer who was charged something other than what they were shown. Integers have no such failure mode: arithmetic is exact.

**How I implemented it.** `amount Int` in `PaymentEvent`, and prices as integers in `src/config/plans.ts` (`priceMinorUnits: 900` / `9000`). Conversion to major units happens only at the boundary where the provider demands it, in `src/lib/flutterwave/client.ts`:

```ts
const amountMajorUnits = (params.amountMinorUnits / 100).toFixed(2);
```

Coming back the other way, `verifyTransaction.ts` converts immediately and rounds to an integer so no float survives into the database:

```ts
const amountMinorUnits = Math.round(rawAmount * 100);
```

**What I chose against, and why.** Postgres `NUMERIC`/`DECIMAL` is genuinely exact and would also have been correct. I chose integers because the exactness then holds in *JavaScript too*, not just in the database — `NUMERIC` arrives in JS as a string or a lossy number, so every read would need a decimal library to stay safe. Integers are exact in both places with no extra dependency. The cost is that the unit is implicit in the column name rather than the type, which I mitigate by always storing `currency` beside it.

### Server-Side Verification Before Entitlement

**What it is.** Before the app marks anyone as a paying subscriber, it asks Flutterwave directly, server to server, whether that transaction actually succeeded and for how much. It does not believe the browser, the redirect URL, or even the contents of the webhook on their own.

**Why it is needed.** The user's browser is fully under the user's control. Flutterwave redirects back to `/checkout/return?status=successful&transaction_id=123`. If the app trusted that, anyone could type that URL themselves — or edit `status=failed` to `successful` — and get a paid plan for free. Equally, a webhook body could claim a $9000 payment when $9 was charged. Only the provider's own API can settle it.

**How I implemented it.** `verifyFlutterwaveTransaction()` in `src/lib/flutterwave/verifyTransaction.ts` calls `GET /v3/transactions/{id}/verify` and returns the provider's status, amount, and currency. The webhook route calls this *after* signature verification and *before* any write to `Subscription`. The Return View never reads its own URL for truth — it polls `/api/subscription/status`, which reads only the database.

I also removed a mock fallback that had been keyed on a missing API key: if `FLW_SECRET_KEY` was absent it used to fabricate `status: "successful"`. Mock behaviour is now opt-in via `FLW_MOCK_MODE`, and a missing key throws:

```ts
throw new Error("FLW_SECRET_KEY is not set — cannot verify transaction with Flutterwave.");
```

**What I chose against, and why.** The simpler option is to trust the webhook payload alone, since it is signature-verified and therefore genuinely from Flutterwave. I rejected it because a valid signature proves *origin*, not *outcome* — a replayed or stale-but-authentic event still carries a signature. The extra API call costs latency on a path that already runs asynchronously, which is a cheap price for the guarantee.

### Webhook Signature Verification

**What it is.** Flutterwave and this app share a secret. Every webhook carries a value derived from that secret, and the app checks it before treating the request as real. Anything that fails is rejected before its body is even parsed.

**Why it is needed.** The webhook endpoint has to be publicly reachable for Flutterwave to call it, which means anyone on the internet can also call it. Without verification, an attacker POSTs `{"status":"successful","id":"1"}` to `/api/webhooks/flutterwave` and is granted a paid subscription. This is the single most exposed surface in the slice.

**How I implemented it.** `src/lib/flutterwave/verifySignature.ts`, called as the first thing after reading the raw body. It handles both of Flutterwave's schemes — v3 sends the secret hash verbatim in `verif-hash` (a direct comparison), v4 sends `HMAC-SHA256(secret, rawBody)` in `flutterwave-signature` — and both comparisons are timing-safe:

```ts
if (expectedHmacBuf.length === receivedBuf.length && timingSafeEqual(expectedHmacBuf, receivedBuf)) {
  return true;
}
```

The route reads `await req.text()` before any JSON parsing, because a signature is over exact bytes and re-serialising JSON would change them.

**What I chose against, and why.** I initially had the route fall back to a hardcoded `"test_secret_hash"` when the env var was unset, for convenience during development. That is an authentication bypass the moment it ships, since the fallback value is in the source. I removed it: a missing secret now rejects with 401 and logs why. The convenience was not worth a publicly-known valid signature. I also chose `timingSafeEqual` over `===` so the comparison cannot be attacked byte-by-byte by measuring response times.

### Idempotency

**What it is.** Processing the same provider event more than once must have exactly the same effect as processing it once. The provider's transaction id is used as a key: if it has been seen, the handler stops.

**Why it is needed.** Flutterwave retries any webhook that does not return 200, three times at 30-minute intervals, and can also deliver the same event more than once on its own. Without a key, one payment writes three `FULFILLMENT` rows and shifts the period end forward three times — so the user's access silently extends for free, and the audit log no longer matches the money.

**How I implemented it.** `providerEventId` carries a `UNIQUE` index, and the webhook checks it before doing any work:

```ts
const existingEvent = await db.paymentEvent.findUnique({ where: { providerEventId: transactionId } });
if (existingEvent) {
  return NextResponse.json({ received: true, idempotent: true }, { status: 200 });
}
```

Returning 200 is the important part — a non-200 would make Flutterwave retry the thing it has already delivered successfully. There is a second, related rule: only one designated event type per transition is allowed to write to `Subscription`, because one logical payment can emit several distinct events, each with its own id, and per-id idempotency alone would not stop three of them each fulfilling once.

**What I chose against, and why.** Checking for an existing row in application code alone would have been simpler, but two concurrent deliveries can both read "no row" before either writes. The unique index closes that race at the only layer that can — the database. I kept the application check as well, because it turns the common case into a clean 200 instead of a caught constraint violation.

### Append-Only Payment Log

**What it is.** Every payment-related occurrence — initiation, verification, fulfilment, failure — is inserted as a new row. Nothing in the codebase updates or deletes a row in that table.

**Why it is needed.** This log is the evidence for why any user has the access they have. If a row could be updated, a bug that overwrote a `FAILURE` with a `FULFILLMENT` would destroy the only record that the payment failed, and a later dispute would be unanswerable. Append-only means history is reconstructible even when the current state is wrong.

**How I implemented it.** Four `eventType` values on `PaymentEvent`, and only `.create()` is ever called against it — `INITIATION` at checkout, `VERIFICATION` after the provider confirms, `FULFILLMENT` alongside the entitlement change, `FAILURE` on a declined or unverifiable transaction. The full provider payload is kept in `rawPayload`. Verifiable with a grep: no `.update()` or `.delete()` targets this table.

**What I chose against, and why.** The obvious alternative is a mutable `payments` row per transaction whose status moves `pending → succeeded`. It is less storage and easier to query for "current state". I rejected it because the state transition is exactly the thing worth auditing, and an update throws it away. The cost is more rows and needing `ORDER BY createdAt` to find the latest — cheap next to losing history.

### Single-Source Entitlement

**What it is.** Exactly one function in the codebase answers "does this user have Pro access", and every screen, route, and guard calls it. No component re-derives that answer from plan or status fields on its own.

**Why it is needed.** Entitlement looks trivial until cancellation exists. A cancelled-but-not-yet-expired user has `cancelAtPeriodEnd = true` and must **still** have access. If three components each write their own `plan === 'PRO' && status === 'ACTIVE'`, every one of them silently revokes access the instant someone cancels — the exact bug the "keeps access until the period ends" requirement exists to prevent. One function means one place to get it right.

**How I implemented it.** `hasProAccess()` in `src/lib/entitlement.ts`, and nothing else is permitted to compute it:

```ts
export function hasProAccess(subscription: Subscription | null): boolean {
  if (subscription === null) return false;
  return subscription.plan === "PRO" &&
    (subscription.status === "ACTIVE" || subscription.status === "CANCEL_SCHEDULED");
}
```

It takes `Subscription | null` deliberately, because "no row yet" and "row that says FREE" are both simply not-Pro and must render identically.

**What I chose against, and why.** A boolean `isPro` column on `User`, updated on every transition, would make reads trivial. I rejected it because it is a denormalised copy that can disagree with the subscription it was derived from — and when it does, the user either pays for nothing or gets access for free, with no way to tell which is right. Deriving it on read means it cannot drift.

### Proration

**What it is.** When a user upgrades partway through a month they have already paid for, they should not pay the full new price on top. Proration works out how much of the old period is unused and charges the difference for the time remaining.

**Why it is needed.** Without it, upgrading mid-cycle either double-charges the user for days they already bought, or hands them the upgrade free until their next renewal. The first produces refund requests; the second is revenue quietly lost. It also has to be *shown* before confirming, because a surprise charge of an amount the user never agreed to is a chargeback.

**How I implemented it.** `calculateUpgradeProration()` in `src/lib/proration.ts` — the only place the formula lives, so it can be unit-tested without running a checkout. It is the daily method: remaining days ÷ total days × price difference, in minor units.

```ts
const priceDifference = yearlyPriceMinorUnits - monthlyPriceMinorUnits;
const proratedMinorUnits = Math.round((remainingDays / totalDays) * priceDifference);
```

`GET /api/subscription/upgrade` returns this as a preview for confirmation; `POST` recalculates it server-side rather than accepting whatever figure the client says it displayed.

**What I chose against, and why.** A provider-calculated proration (Stripe's `create_prorations`, say) would be authoritative and less code. That option does not exist here — Flutterwave does not calculate proration — so the choice was forced. Within what was left, I chose whole-day granularity over per-second because the difference is sub-cent at these prices and whole days are something a user can verify by hand. Rounding is `Math.round` (nearest minor unit); the brief did not specify a rule, so I picked the conventional one and documented it rather than leaving it implicit.

### Deferred Cancellation

**What it is.** Cancelling schedules the end of a subscription rather than ending it immediately. The user keeps everything they paid for until the period boundary, and only then does the plan revert to Free.

**Why it is needed.** The user has already paid for the full period. Revoking at the moment they click cancel takes money for service not delivered. It also makes cancelling feel punitive, which pushes people to wait until the last day and increases the chance they forget and get billed again — worse for both sides.

**How I implemented it.** `POST /api/subscription/cancel` sets `cancelAtPeriodEnd = true`, moves status to `CANCEL_SCHEDULED`, and stores the optional reason immediately — it does not wait for a webhook, because this is a synchronous decision, not an async payment. Access survives because `hasProAccess()` counts `CANCEL_SCHEDULED` as entitled. Only the renewal-confirmation webhook flips `status` to `CANCELED` and `plan` to `FREE`, and it **updates** the row rather than deleting it, so the history survives.

Cancellation is never one click. `src/components/BillingClient.tsx` runs an explicit state machine — `NONE → CONFIRM → REASON` — where the `CONFIRM` modal states the exact date access ends and nothing is sent until the user accepts it:

```ts
type CancelStep = "NONE" | "CONFIRM" | "REASON";
```

The Cancel control itself only renders when `status === "ACTIVE"` and `cancelAtPeriodEnd === false`, so it disappears once a cancellation is scheduled rather than offering a second, meaningless cancel.

**What I chose against, and why.** Deleting the `Subscription` row on cancel would be tidier. I rejected it twice over: it destroys the audit trail linking past `PaymentEvent` rows to a subscription, and a returning subscriber would need a new row — which the `UNIQUE` constraint on `userId` makes fragile. Updating in place means one row per user forever, and `upsert` handles resubscribe correctly. I also chose against a single-click cancel with an undo window: undo is friendlier, but it means the row is already mutated while the user still believes it might not be, and reconciling that with the provider is harder than simply asking first.

### Cancellation Reason Capture

**What it is.** After cancellation is confirmed, the user is offered a short fixed list of reasons plus a free-text box, and the choice is stored on the subscription. Answering is entirely optional — skipping it still cancels.

**Why it is needed.** Cancellations are the only moment a departing user is willing to say why, and a free-text-only box produces answers nobody can aggregate. A fixed enum means "how many people left because of price?" is one `GROUP BY` instead of reading prose. The optional part matters just as much: making the prompt mandatory would either block a user from cancelling — which is a dark pattern and in some jurisdictions unlawful — or train them to click the first option to escape, which poisons the data worse than having none.

**How I implemented it.** `cancellationReason` is a `CancellationReason` enum with six values, and `cancellationReasonOther` is a separate nullable free-text column used only when the reason is `OTHER` — keeping them apart means the aggregatable column stays clean and never holds arbitrary prose. The `REASON` step of the state machine in `BillingClient.tsx` renders the six options, revealing the free-text input only when `OTHER` is selected. Both a "Skip & Confirm Cancellation" button and a "Confirm Cancellation" button call the same function, the former with no arguments:

```ts
const executeCancellation = async (reasonVal?: string, otherVal?: string) => { ... }
```

`/api/subscription/cancel` validates the submitted reason against an allow-list before writing, so a crafted request cannot put an arbitrary value in the column, and stores `reasonOther` only when the reason is genuinely `OTHER`.

**What I chose against, and why.** I considered capturing the reason *before* executing the cancellation, so no one could cancel without answering. I rejected it for the reason above — it converts an optional question into a toll gate. I also chose against a free-text-only field, which is easier to build and more expressive for the user, because the resulting data is unanalysable without manual reading; the enum plus an `OTHER` escape hatch gets both.

### No Dead Ends in the Payment Path

**What it is.** Every state a user can reach while paying — including every way it can fail — resolves to a screen that names what happened and offers a way forward. No blank page, no infinite spinner, no unhandled exception, and no framework-default 404 or 500 anywhere in the flow.

**Why it is needed.** This is the payment path, so the user is at their most anxious: they have just entered card details and do not know whether they have been charged. A blank screen at that moment produces a support ticket at best and a duplicate payment at worst, because the natural response is to try again. A generic "something went wrong" is barely better — it gives the user no way to tell "your card was declined" (try another card) from "we are still confirming" (wait) from "your session expired" (sign in again), and those demand different actions.

**How I implemented it.** Every failure mode gets its own named state rather than sharing a fallback:

- **Return View** (`ReturnClient.tsx`) — five distinct states: `PROCESSING` with an attempt counter, `SUCCESS`, `TIMEOUT` after 15 polls with a manual retry and a Billing link, `FAILURE` when a `FAILURE` event is recorded, and `UNAUTHENTICATED` when the status call 401s.
- **Checkout** (`CheckoutClient.tsx`) — a rate-limit hit is handled separately from a provider error, because one resolves by waiting and the other by retrying:

```ts
if (res.status === 429) {
  setRetryAfterSeconds(data.error?.retryAfterSeconds || 60);
```

- **Billing** — API failures render inline and leave subscription state untouched; the UI never optimistically shows a change the server has not confirmed.
- **App-wide** — `src/app/error.tsx` and `src/app/not-found.tsx` catch anything that escapes, and `/` redirects to `/plans` so the root is not a 404 despite having no landing page.
- Every API route returns the same shape, `{ error: { code, message } }`, so the frontend can branch on `code` instead of pattern-matching prose.

**What I chose against, and why.** The less laborious option is one error boundary and one generic message for everything, which is genuinely less code and less duplication. I rejected it because the distinctions are exactly what the user needs at this moment, and collapsing them hides the cause — I hit this concretely during the build, where a 401 was rendering as "taking longer than expected" and the real problem was only visible in the browser console (Section 6). I also chose against auto-retrying on failure: silently retrying a payment-adjacent call risks a second charge, so the retry is always a button the user presses.

### Rate Limiting

**What it is.** A cap on how often one user or one IP can hit checkout initiation in a given minute. Over the cap, the request is refused with 429 and told when to try again.

**Why it is needed.** `/api/checkout` is the most expensive endpoint here — each call does several database queries and an outbound API call to Flutterwave. Someone holding down the subscribe button, or scripting it, creates a pile of abandoned checkout sessions, burns provider API quota, and can exhaust the connection pool so that legitimate requests fail. Naming it concretely: twenty clicks a second is twenty hosted sessions and twenty `INITIATION` rows, none of which will ever be paid.

**How I implemented it.** `checkCheckoutRateLimit()` in `src/lib/rateLimit.ts` — 5 per user per minute, 20 per IP — backed by the `RateLimitBucket` Postgres table. The window is the floor of the current minute, and the counter is an atomic upsert-and-increment inside a transaction:

```ts
return tx.rateLimitBucket.upsert({
  where: { key_windowStart: { key, windowStart } },
  create: { key, windowStart, count: 1 },
  update: { count: { increment: 1 } },
});
```

Exceeding it returns 429 with `Retry-After`, which the UI renders as a specific "too many attempts, try again in N seconds" message rather than a generic error.

**What I chose against, and why.** Redis with `INCR`/`EXPIRE` is the standard answer and is faster, with free key expiry. I did not use it because it adds an entire piece of infrastructure for one counter in a single-instance test deployment, and the stack is explicitly Postgres-only. An in-memory `Map` would have been simpler still and I rejected that too: it resets on every deploy and is per-process, so it provides no real limit. The honest cost of my choice is a database write per checkout attempt, and that the window is fixed rather than sliding — so a burst straddling a minute boundary can briefly double the limit.

### Password Hashing

**What it is.** The password is converted into a fixed-length string that cannot be reversed. On sign-in the app hashes what was typed and compares hashes. The real password is never stored.

**Why it is needed.** If the database is ever read by someone who should not have it, plaintext passwords hand over every account immediately — and because people reuse passwords, accounts on other services too. Hashes give an attacker strings that are expensive to work backwards from.

**How I implemented it.** bcrypt via `bcryptjs` in `src/lib/auth-utils.ts`, at signup and password reset, compared at sign-in:

```ts
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
```

bcrypt is deliberately slow, which barely affects one honest login but severely slows an attacker testing millions.

**What I chose against, and why.** SHA-256 is fast and general-purpose, which is exactly what makes it wrong here — speed is the attacker's advantage. Argon2 is arguably stronger and is the current recommendation. I used bcrypt because it is well understood and well supported in this stack. The cost factor is 10 rather than 12; 12 would be the better default and is a one-character change I would make before real users.

### Session Management

**What it is.** After sign-in the server gives the browser a cookie containing a signed token that identifies the user. Every subsequent request carries it, and the server verifies the signature before trusting the identity inside.

**Why it is needed.** HTTP is stateless, so without it the user would have to re-authenticate on every page. The signature is the load-bearing part: a cookie of `{"userId":"abc"}` with no signature could simply be edited to another user's id, which is total account takeover by typing in devtools.

**How I implemented it.** `signSessionToken()` / `verifySessionToken()` in `src/lib/auth-utils.ts` — a base64url payload with an expiry, plus an HMAC-SHA256 signature over it, compared with `timingSafeEqual`. The cookie is set in `src/lib/auth.ts` as `httpOnly`, `sameSite: "lax"`, `path: "/"`, `secure` in production, 7-day expiry. `httpOnly` keeps it out of reach of JavaScript, so an XSS bug cannot read it. `sameSite: "lax"` is chosen specifically so the cookie survives the top-level redirect back from Flutterwave — `strict` would drop it and break the Return View.

**What I chose against, and why.** A database-backed session table would allow genuine server-side revocation — signing out everywhere, or killing a stolen session immediately. A stateless signed token cannot be revoked before it expires; the only lever is rotating `AUTH_SECRET`, which logs everyone out. I accepted that because it needs no lookup per request, and for this slice the 7-day window is tolerable. For real users handling money I would switch to stored sessions.

### Email Verification

**What it is.** A new account must prove it controls the address it registered with, by entering a code sent to it, before it can sign in.

**Why it is needed.** Without it, anyone can register using someone else's address. That person then gets mail from a service they never joined, and worse, the account — along with any billing attached to it — is associated with an address its real owner does not control. It also stops trivially-automated signup floods.

**How I implemented it.** Signup generates a 6-digit code and a 32-byte token with a 24-hour expiry, stores them on the `User` row, and emails both a code and a link (`src/lib/email.ts`). `/api/auth/verify-email` accepts either, checks expiry, sets `emailVerified = true`, clears the code, and only then establishes a session. `/api/auth/signin` refuses an unverified account with a distinct `EMAIL_NOT_VERIFIED` code so the UI can offer to resend rather than showing "wrong password".

**What I chose against, and why.** A magic-link-only flow (no code) is fewer moving parts and avoids a typeable secret. I kept the code as well because links break routinely — mail clients rewrite them, and the link carries a host that is wrong the moment the tunnel hostname changes in local development. Supporting both means verification still works when the link does not. The cost is two credentials to expire and clear instead of one.

### No Card Data Stored

**What it is.** Card numbers, expiry dates, and CVVs never reach this application, let alone its database or logs. Only provider-issued references are ever stored.

**Why it is needed.** Storing card data puts the system in scope for PCI DSS obligations it is nowhere near meeting, and makes the database a target worth attacking. The safest way to not leak card data is to never possess it.

**How I implemented it.** Structurally, by using Flutterwave's **hosted** checkout: the user is redirected to Flutterwave's own page and enters card details there, so the data never transits this server. What comes back in `rawPayload` is a BIN and last four digits (`553188` / `2950`) — a partial reference that cannot reconstruct a card number — plus provider ids. No schema column anywhere holds a PAN or CVV.

**What I chose against, and why.** Flutterwave's direct-charge API would have let me build the card form inside the app, which looks better and avoids a redirect to a third-party page. It requires collecting the card number and CVV, AES-256-GCM encrypting them, and POSTing them through my own backend — meaning card data transits infrastructure I own, with the compliance burden that follows. For a slice whose purpose is demonstrating correct billing mechanics, that trade was clearly not worth it.

---

## 6. What Went Wrong

### 1. A v3 API key sent to the v4 host — every checkout 401'd

**Symptom.** `POST /api/checkout` returned 502. The server log showed `Flutterwave payment initiation failed: HTTP 401 - {"status":"failed","error":{"type":"UNAUTHORIZED","code":"10401","message":"Unauthorized"}}`.

**Investigation.** My first assumption was a bad key — so I checked the key was a test key, not truncated, and had no stray whitespace. It was fine. I then tested the key directly with curl against `https://api.flutterwave.com/v3/payments`, and it returned **200** with a valid hosted link. So the key worked, which meant the app was not sending the request I thought it was. The giveaway was the error's *shape*: `{"error":{"type":...,"code":...}}` is Flutterwave's v4 format, not v3's `{"status":"error","message":...}`.

**Cause.** Mine. When setting up `.env` I had organised the Flutterwave variables into two blocks — "(A) v4" and "(B) v3" — with instructions to fill in one. But `FLW_BASE_URL` sat inside the v4 block while `client.ts` read it *unconditionally*. So the v3 key was being sent to `developersandbox-api.flutterwave.com`, which rejected it.

**Fix.** Pointed `FLW_BASE_URL` at `https://api.flutterwave.com/v3` and commented out the v4-only variables so they cannot leak into the v3 code path. The deeper fix was to the `.env` layout itself: two parallel blocks sharing one variable is a trap, so the base URL is now a single top-level setting with both valid values documented next to it.

### 2. Payment succeeded, webhook verified, entitlement never granted

**Symptom.** A real test payment went through. A `VERIFICATION` event appeared in the log with `status: successful`. But the subscription stayed `plan: FREE, status: INCOMPLETE`, and the user remained on the free plan.

**Investigation.** Because `VERIFICATION` was written, I knew signature verification, JSON parsing, transaction re-verification, and the idempotency check had all passed — the failure had to be after step 6. I checked whether the `Subscription` upsert was throwing, but there was no 500 and no error in the log. I checked the rate limiter and the user-lookup fallbacks; both were irrelevant. What settled it was querying the stored `rawPayload` of that exact event, which showed `"event.type": "CARD_TRANSACTION"` — and no `event` field at all.

**Cause.** The route only treated `charge.completed` and `subscription.created` as designated fulfilment triggers. This account sends Flutterwave's **legacy** webhook shape (`event.type: "CARD_TRANSACTION"`, `txRef` in camelCase, no `data` envelope), so the trigger check fell through to "record for audit, do not fulfil" — working exactly as written, and wrong.

**Fix.** Recognised `CARD_TRANSACTION` and `ACCOUNT_TRANSACTION` alongside the modern names, and made the `tx_ref` extraction accept `txRef` too. A real consequence worth recording: that specific payment can never be recovered, because a `VERIFICATION` row already exists for its transaction id and the idempotency guard correctly refuses to reprocess it. The guard cannot distinguish "already fulfilled" from "recorded but skipped by a bug".

### 3. Could not start a second payment for ten minutes

**Symptom.** After the payment above, clicking subscribe again appeared to do nothing useful — the user was sent to a Flutterwave page that would not take a payment.

**Investigation.** I checked the rate limiter first, since repeated clicking was involved; the buckets showed `count: 1`, so that was not it. I checked the `ALREADY_ACTIVE` guard, but `hasProAccess()` was false, so that branch was not firing either. Reading the route top to bottom, the culprit was the FR-8 in-flight session check.

**Cause.** The route reuses any `INITIATION` from the last 10 minutes for the same plan, returning the stored checkout link. That rule exists to absorb double-clicks. But a Flutterwave hosted link is **single-use**, and this one had already been paid — so for ten minutes every attempt was handed a spent link, dead-ending the payment path.

**Fix.** Reuse now happens only while a session is genuinely still in flight: if a `VERIFICATION`, `FULFILLMENT`, or `FAILURE` has been recorded since that initiation, a fresh link is created. One subtlety caught during implementation — my first version matched on `providerReference`, which never fires, because `INITIATION` stores the `tx_ref` while webhook rows store the provider's transaction id. It matches on timing instead.

### 4. A missing API key silently fabricated successful payments

**Symptom.** Found by reading rather than by failing: with `FLW_SECRET_KEY` blank, checkout completed and transaction verification returned `status: "successful"`.

**Investigation.** Tracing why a verification could succeed without network access led to a guard in both `client.ts` and `verifyTransaction.ts` that treated *an absent key* as "use mock mode", returning hardcoded success. It was also partly keyed on the transaction id containing the strings `"idempotency"` or `"dedupe"` — put there so the integration tests would pass.

**Cause.** Test convenience wired into production code paths, with the trigger being a **misconfiguration**. A deployment that forgot one environment variable would grant paid access to anyone who asked, while looking healthy.

**Fix.** Mock behaviour is now opt-in only, via an explicit `FLW_MOCK_MODE` flag, and a missing key throws a descriptive error instead. The tests still pass by setting the flag. Related, in the same pass: the webhook route had `process.env.FLW_SECRET_HASH || "test_secret_hash"`, meaning an unset secret accepted a hardcoded, source-visible signature — an authentication bypass. It now rejects with 401.

### 5. `ECONNREFUSED` on every database call

**Symptom.** Sign-in and sign-up both returned 500. `PrismaClientKnownRequestError … code: 'ECONNREFUSED'` on `db.user.findUnique()`.

**Investigation.** I checked the Prisma client was generated and the `DATABASE_URL` was well-formed — both fine. Checked for a native Postgres Windows service: none installed. `netstat` showed nothing listening on 5432 at all, which reframed it from "auth is broken" to "there is no database".

**Cause.** Docker Desktop was not running, so the Postgres container was down. Nothing to do with the application code.

**Fix.** Started Docker Desktop; the container came back up on its own and bound 5432. Worth recording because the error message points at auth code and the real cause is one layer below it. The follow-up I did *not* make, and should: a dead database surfaces as a generic 500 "Failed to sign in", which tells the user nothing. A distinct `SERVICE_UNAVAILABLE` state would be the honest treatment.

### 6. A one-character typo silently rejected every webhook

**Symptom.** Webhooks stopped being accepted. No `VERIFICATION` rows appeared for new payments.

**Investigation.** Dumped the configured secret hash and checked its length and character set: 49 characters, and not valid hex, when the generated value was 48 hex characters.

**Cause.** A stray `m` had been appended to `FLW_SECRET_HASH` in `.env`. Verification is an exact string comparison, so the value no longer matched the dashboard and every delivery was correctly rejected with 401.

**Fix.** Removed the character and confirmed both sides match. I deliberately did not "fix" this silently when I first spotted it, because I could not tell which of the two values the dashboard held — changing the wrong side would have preserved the mismatch.

---

## 7. What This Slice Does Not Handle

### Known broken — would need fixing before this works end to end

- **Upgrade proration cannot actually charge.** Flutterwave's tokenized-charge endpoint requires a saved card token, and nothing stores one. `verifyTransaction` now returns `cardToken` from the provider, but persisting it needs a new `Subscription` column and a migration. The route fails cleanly (state untouched, specific error) rather than corrupting anything, but the upgrade does not complete.
- **Provider-side cancellation cannot work.** The webhook stores `flutterwaveSubscriptionId` as a fabricated string (`flw_sub_<txid>`), not the numeric id Flutterwave's cancel endpoint expects — that id is only available from the subscriptions listing. `findFlutterwaveSubscriptionId()` exists in the client for this, but is not yet wired into fulfilment. Local cancellation state is correct; the provider is simply never told.
- **Deferred downgrade is recorded but never executed.** `pendingInterval` and `pendingEffectiveAt` are set, and both screens display the pending change, but nothing applies it at the boundary. Flutterwave has no scheduling object, so this needs a time-based sweep owned by this application. That mechanism was specified and never built.
- **No recurring billing.** `FLW_PLAN_MONTHLY` / `FLW_PLAN_YEARLY` are unset, so checkout creates a one-off charge and Flutterwave never creates a subscription or sends a renewal. Until two Payment Plans exist and their numeric ids are configured, nothing renews.
- **The webhook's `FAILURE` path can crash.** When transaction verification fails it writes a `PaymentEvent` with `userId: "unknown"`, which violates the foreign key to `User` — so the insert throws and the handler 500s instead of recording the failure. Needs a nullable `userId` or a different attribution strategy.

### What breaks at scale

- **The rate limiter is single-instance in effect.** It is correct across processes thanks to the unique constraint, but it is a database write per checkout attempt, and a fixed window means a burst straddling a minute boundary can pass up to double the limit. A sliding window or a distributed limiter would be needed before meaningful traffic.
- **Sessions cannot be revoked.** Stateless signed tokens stay valid until they expire. There is no "sign out everywhere", and a stolen cookie works for up to 7 days. Real money demands server-side sessions.
- **Return View polling does not scale.** Fifteen requests per checkout per user, each hitting the database twice. Fine at this size; wasteful at thousands of concurrent checkouts, where server-sent events or a websocket would be the answer.
- **No observability.** Failures go to `console.error`. There is no structured logging, no alerting, and nothing that would tell you webhooks had silently stopped arriving — which is exactly the failure that happened twice during this build and was only caught by manually querying the database.
- **`rawPayload` grows unboundedly.** Every event stores a full provider payload as JSON with no retention policy.

### Left out because it was outside the brief

These were explicit non-goals, not omissions: landing and pricing pages; any product feature gated behind Pro; refunds; dunning, retries, or grace periods on failed renewals; an admin dashboard; team, organisation, or multi-seat billing; multi-currency; a "resume subscription" control after cancellation is scheduled; and Yearly → Free as a downgrade (it is treated as a cancellation).

### Left out because I ran out of time

- **The three bugs in "known broken" above.** Each needs a schema migration plus wiring, and I chose to document them precisely rather than half-build them.
- **Tests are thin.** There are unit tests for proration and entitlement, and integration tests for webhook idempotency and duplicate-fulfilment. They require the dev server running and `FLW_MOCK_MODE=true`, which makes them awkward to run in CI. There is no test for the rate limiter's concurrency behaviour, the cancel flow, or any of the error states.
- **Error states are uneven.** The Return View now has named states for processing, success, timeout, failure, and expired session. Other screens still fall back to generic messages, and a database outage surfaces as a bare 500 everywhere.
- **`SMTP_FROM` is unquoted in `.env`** and contains characters that break any tool that shell-sources the file. Harmless to the app, noted rather than fixed.

### Disclosure: authentication

The brief permits reusing authentication from a previous assessment provided the reuse is stated. **Nothing was reused.** The authentication in this repository was built inside this project and wired directly into the subscription slice:

- `src/lib/auth-utils.ts` — bcrypt password hashing, 6-digit verification codes and 32-byte tokens from `crypto.randomBytes`, and HMAC-SHA256 session token signing and verification.
- `src/lib/auth.ts` — `getSessionUser()`, `setSessionCookie()`, `clearSessionCookie()`.
- `src/app/api/auth/*` — `signup`, `signin`, `signout`, `verify-email`, `forgot-password`, `reset-password`.
- `src/lib/email.ts` — Nodemailer dispatch for verification codes and password-reset links.
- Screens: `/sign-up`, `/sign-in`, `/verify-email`, `/forgot-password`, `/reset-password`.

The connection to billing is the point worth noting: `getSessionUser()` is the single entry point every subscription surface depends on. The `(shell)` layout uses it to guard Plans, Checkout, Return, and Billing; every subscription API route calls it first and returns 401 without it; and `Subscription.userId` and `PaymentEvent.userId` are foreign keys to the `User` table that authentication owns, so a subscription cannot exist without an authenticated account behind it.

---

## 8. If I Built This Again

I would build the provider integration against a written-down contract before building anything on top of it. Almost every serious problem in Section 6 traces to the same root: code that assumed one shape of Flutterwave and an account that spoke another. The key went to the wrong host because two API generations were conflated in configuration; the payment silently failed to grant entitlement because the webhook arrived in a legacy envelope nobody had checked for; the mock fallback existed because nobody had confirmed what a real response looked like, so a fake one was easier. I would start by capturing one real sandbox payment end to end — the initiation response, the verification response, the exact webhook body — pinning those as fixtures, and writing the client against them. That single step would have caught the host mismatch, the `CARD_TRANSACTION` envelope, and the single-use nature of the hosted link before any of them cost a debugging session, and it would have made the mock honest, because it would have been derived from something real instead of invented to make a test pass.
