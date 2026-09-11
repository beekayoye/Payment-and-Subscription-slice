# AGENTS.md — Subscription System

This file governs how any AI coding agent (including Antigravity) behaves while building this project. It does not describe the product — the PRD does that. This file is rules of conduct. Where the two ever seem to disagree, resolve it using the precedence rule in Question 1, not by picking whichever is more convenient.

---

## Q1. What is this project?

A test-mode subscription billing system. A signed-in user holds one of three states — Free, Pro Monthly, or Pro Yearly — on their own user record. The system supports subscribing, upgrading with mid-cycle proration, downgrading deferred to the next renewal, and cancelling with access retained through the paid period. The thing being sold is a plan flag on the user record. Nothing else is gated. This is **v1 of the build**, scoped to Phases 0–4 exactly as laid out in the PRD's roadmap — nothing beyond that is in scope until a human says otherwise.

**Source of truth:** `subscription-system-prd-v2.md`. When this AGENTS.md and the PRD conflict on *what* to build, the PRD wins. When they conflict on *how to behave, structure code, or handle an edge case not covered by the PRD*, this file wins. Feature requirements live in the PRD and get turned into tasks; this file supplies the rules those tasks must obey no matter which feature is being built.

**Known contradiction you must treat as resolved, not as license to freelance:** the PRD (v2) was written against Stripe and still says "Stripe" throughout — its environment variable names, its Prisma field names (`stripeCustomerId`, `stripeSubscriptionId`, `stripeScheduleId`), its webhook mechanics, and its Subscription Schedule mechanism for downgrades. The actual provider for this build is **Flutterwave**, not Stripe, and not Paystack. Section 2 of this file states exactly which Stripe-specific mechanisms are superseded and what replaces them. Do not implement anything against the Stripe API. Do not implement anything against the Paystack API. If you find a part of the PRD that assumes Stripe-only capability and this file does not tell you what replaces it, stop and ask — do not invent a Flutterwave equivalent on your own (see Q7).

---

## Q2. What is locked

These are decisions the team has already made. You do not evaluate alternatives, you do not suggest "a cleaner way," and you do not swap one for something else because it seems technically better. If you would break one of these but the feature still runs, that is a failed task, not a passed one with a footnote.

**Stack — never substitute any of these:**
- Framework: Next.js, App Router (not Pages Router).
- Language: TypeScript, strict mode on.
- ORM: Prisma. No raw SQL except inside a documented, reviewed exception (see Q5).
- Database: PostgreSQL. Not MongoDB, not SQLite, not a document store — regardless of how small the dataset is.
- Payment provider: **Flutterwave**, in sandbox/test mode. Not Stripe. Not Paystack. Not a "we'll abstract the provider so we can swap later" layer — build directly against Flutterwave.
- Rate limiter storage: a Postgres-backed table (`RateLimitBucket`, per PRD Section 10). Not Redis, not an in-memory map that resets on deploy, not a third-party rate-limit service.
- Money storage: every amount is a whole integer in minor units (e.g. kobo, not naira; cents, not dollars), with the currency stored alongside as its own column. **Never use a float or decimal type for money. Anywhere. Ever.**
- Auth: reused as-is from the prior assessment. You do not build a new auth system, add a new session strategy, or "improve" the existing one, even if you think it's thin.

**Flutterwave translation of the PRD's Stripe-specific mechanics — this is locked, not a suggestion:**

| PRD says (Stripe) | Build this instead (Flutterwave) |
|---|---|
| `stripe.webhooks.constructEvent` with a signing secret | Read the raw request body before any parsing. Compute `HMAC-SHA256(secretHash, rawBody)` and compare it against the `flutterwave-signature` request header. Reject on any mismatch with HTTP 401, before touching the payload. |
| Trust the verified webhook payload directly | After signature verification, call Flutterwave's transaction verification endpoint server-side with the transaction ID from the payload, and confirm status, amount, and currency match what you expected **before granting any entitlement**. The signature proves the request came from Flutterwave; it does not by itself prove the transaction succeeded for the amount you expect. Both checks are required — neither one alone is sufficient. |
| Idempotency on Stripe event ID (`evt_...`) | Idempotency on Flutterwave's transaction ID (or `tx_ref` for initiation-side dedup). Flutterwave documents that the same webhook can be delivered more than once and retries non-200 responses up to 3 times at 30-minute intervals — your idempotency check must hold under that. |
| Stripe Checkout Session (`mode: subscription`) | Flutterwave hosted payment / inline checkout, with the target Payment Plan ID passed at charge time. A Flutterwave subscription is created automatically on the customer's **first successful charge against a plan** — there is no separate "create subscription" call before payment the way Stripe's Checkout Session implies. |
| Stripe Subscription Schedule (two-phase, used for deferred downgrade) | **Flutterwave has no equivalent object.** Flutterwave subscriptions are tied to a plan and a customer email and cannot be modified in place — changing plan means cancelling the current subscription and creating a new one on the new plan. A deferred downgrade must therefore be tracked and executed entirely by our own application (a scheduled job, or logic triggered off the renewal-charge webhook) that cancels the old-plan subscription and starts the new-plan one at the correct time. Deciding the exact mechanism (cron job vs. webhook-triggered check) is a **Phase 0 design decision you must make and document before writing checkout/fulfilment code** — same rule the PRD applied to the Stripe version, carried over because the underlying risk (building fulfilment code that's incompatible with how downgrade will later work) is identical. |
| `proration_behavior: create_prorations` (Stripe calculates and charges proration automatically) | **Flutterwave does not calculate proration.** You calculate it yourself using the existing daily-proration formula (remaining days ÷ total days × price difference, per the PRD's proration assumption), show it to the user for confirmation, then execute it as an explicit direct charge against the customer's saved payment method, followed by cancelling the old-plan subscription and starting the new-plan one. |
| `Subscription.stripeCustomerId`, `stripeSubscriptionId`, `stripeScheduleId` | Rename to `flutterwaveCustomerEmail` (or however the customer is addressed on Flutterwave's side — subscriptions there key off email), `flutterwaveSubscriptionId`, and replace `stripeScheduleId` with `pendingInterval` + `pendingEffectiveAt` (a timestamp), since there is no schedule object to reference. |
| `PaymentProvider.STRIPE` (Prisma enum value) | `PaymentProvider.FLUTTERWAVE`. |
| Env vars `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | `FLW_SECRET_KEY`, `FLW_PUBLIC_KEY`, `FLW_SECRET_HASH` (used for webhook signature verification), `FLW_PLAN_MONTHLY`, `FLW_PLAN_YEARLY`. |
| Stripe CLI for local webhook forwarding | Any HTTPS tunnel to localhost (e.g. ngrok) pointed at the webhook route — Flutterwave, like Stripe, cannot reach `localhost` directly. |

The `PaymentEvent` model's field names in the PRD (`provider`, `providerReference`, `providerEventId`) are already provider-agnostic — keep them exactly as specified, only the enum value and the data stored in them changes.

**A note on the PRD itself:** because the PRD's prose, code samples, and env var names were never actually rewritten for Flutterwave, you will keep running into Stripe-flavored language while reading it. The table above is the authoritative translation. If you hit a Stripe-specific detail not covered by that table, this is a gap in the specification — follow Q7, do not guess a Flutterwave equivalent.

---

## Q3. What must never happen

Every rule below is written as a direct order. Breaking any one of them means the task has failed, even if the app builds, runs, and looks correct in a demo. Where a PRD requirement number exists, it's cited — go read that requirement before touching the related code.

1. **Never grant entitlement without a verified, server-confirmed payment.** Signature verification and the Flutterwave transaction-verify call (Q2 table) must both pass before `Subscription.status` moves to `ACTIVE`. No exceptions for "just to test the UI." *(PRD G5, FR-22, Section 6.)*
2. **Never derive Pro access anywhere except through one function.** `hasProAccess(subscription)` is the only code in this entire codebase allowed to answer "does this user have Pro access." Not a component prop, not a second helper "for convenience," not an inline check in a route handler. One function, one call site pattern, everywhere. *(PRD FR-2a.)*
3. **Never read plan or payment state from a URL, query string, or any value supplied by the client.** The Return View, in particular, treats the checkout reference in its URL as a lookup hint at most — it re-fetches truth from the database, always. *(PRD FR-12.)*
4. **Never trust a webhook payload before its signature is verified, and never grant entitlement from the payload alone** — re-verify the transaction against Flutterwave's own API first (Q2 table). *(PRD Section 6 steps 5–8, adapted for Flutterwave.)*
5. **Never process the same provider event twice.** Idempotency on the provider's transaction/event identifier is mandatory, and it must hold correctly given Flutterwave's documented retry behavior (same event redelivered up to 3 times). *(PRD FR-31, Section 6 step 6, G6.)*
6. **Never let more than one event type trigger a fulfilment write for the same logical transition.** One designated trigger event per transition type (subscribe, upgrade, downgrade completion, cancellation completion); every other related event is still logged, but does not touch `Subscription`. *(PRD FR-31a, Section 6 step 8a.)*
7. **Never store card numbers, CVVs, or any raw card data anywhere** — not in the database, not in application logs, not embedded inside a stored webhook payload. A provider-issued token or reference is fine; a PAN is never fine. *(PRD A8, Section 11 metric.)*
8. **Never store a money amount as anything other than a whole integer in minor units, with currency stored alongside.** No floats, no decimals, not even "just for display." *(Locked in Q2; original engineering requirement.)*
9. **Never update or overwrite a `PaymentEvent` row.** Every event — success or failure — is a new appended row. If you find yourself writing `.update()` against this table, stop; you're about to break an audit guarantee. *(PRD FR-31, Section 11 metric.)*
10. **Never revoke access immediately on cancellation.** Access stays valid through `currentPeriodEnd`; only the renewal-confirmation webhook flips status to `CANCELED` and plan to `FREE`. *(PRD FR-29, FR-30, G4.)*
11. **Never apply a downgrade immediately, and never assume the provider applies it automatically.** Since Flutterwave has no schedule object, the deferred change is entirely our own application's responsibility to track and execute at the right time (Q2 table). *(PRD FR-27/28, adapted.)*
12. **Never let any screen in the payment path dead-end.** No blank page, no unhandled exception, no framework-default 404/500 reachable from Plans, Checkout, Return, or Billing. Every failure mode gets a specific, named state. *(PRD G7, FR-11, FR-15, FR-16, FR-21.)*
13. **Never build anything the PRD explicitly rules out:** no landing or marketing/pricing page, no product feature gated behind Pro, no refunds, no dunning/retry logic on failed renewals, no admin dashboard, no team/org billing, no multi-currency support, no "Resume Subscription" control, no new auth system. If a task description implies one of these, that's a signal to stop and check with a human, not to quietly build it because it seemed helpful. *(PRD N1–N8, FR-18.)*
14. **Never skip or reimplement the rate limiter.** Checkout initiation is rate-limited using the locked `RateLimitBucket` table — not skipped for convenience during development, and not swapped for Redis or an in-memory counter. *(PRD FR-32, Section 7.)*

---

## Q4. How is the work arranged

Use this layout. Don't invent parallel structures, don't put API logic in components, don't reach into Prisma from inside a React component.

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
        page.tsx               # Return View (FR-12–FR-16)
    /billing/
      page.tsx                # Billing View (FR-17–FR-21)
    /api
      /checkout/route.ts               # FR-8, FR-9, rate-limited
      /webhooks/flutterwave/route.ts   # raw-body route; signature verify → transaction verify → idempotency → fulfilment
      /subscription/
        /upgrade/route.ts              # FR-24–FR-26
        /downgrade/route.ts            # FR-27–FR-28
        /cancel/route.ts               # FR-29–FR-30
        /status/route.ts               # used by Return View polling and Billing View
    error.tsx                          # required — G7
    not-found.tsx                      # required — G7

  /lib
    entitlement.ts           # hasProAccess() — the ONLY export allowed to answer entitlement (FR-2a, rule 2)
    proration.ts             # daily proration calculation, unit-tested in isolation
    rateLimit.ts             # RateLimitBucket read/write logic
    db.ts                    # single Prisma client instance, imported everywhere else needs one
    /flutterwave/
      client.ts              # thin wrapper around Flutterwave API calls
      verifySignature.ts     # flutterwave-signature check (Q2 table)
      verifyTransaction.ts   # server-side transaction re-verification (Q2 table)

  /config
    plans.ts                 # plan/price/interval config — NOT database-driven (PRD A3)

  /components
    ...                      # presentational only; no direct Prisma or Flutterwave calls from here

/tests
  /unit
    proration.test.ts
    entitlement.test.ts
  /integration
    webhook-idempotency.test.ts     # replay same event twice → one PaymentEvent, one transition (FR-31)
    webhook-dedupe-fulfilment.test.ts # multiple related events, one transition → one FULFILLMENT row (FR-31a)
```

**Boundaries that must hold:**
- Nothing outside `/lib/entitlement.ts` computes Pro access. Every screen, every route handler, every middleware check imports `hasProAccess()` from there.
- Nothing outside `/app/api/webhooks/flutterwave/route.ts` and `/lib/flutterwave/*` talks to Flutterwave's webhook or verification surface. UI code and other routes never call Flutterwave directly to "check" a payment (rule 3/4).
- Nothing outside `/lib/db.ts` instantiates a Prisma client. One instance, imported everywhere.
- Proration math lives only in `/lib/proration.ts`, so it can be unit-tested against Flutterwave's actual charge amount without spinning up a whole checkout flow.

---

## Q5. How should the code look

Clean, readable, boring in the best sense. Optimize for the next person reading it under time pressure, not for cleverness.

- **TypeScript strict mode**, no `any` without a comment explaining why it was unavoidable. Prefer explicit types on function boundaries (params and return), inference is fine internally.
- **Node.js: current LTS only.** Pin the exact version in `package.json` (`engines`) and in whatever CI/build config exists. Do not use an experimental or odd-numbered release.
- **Formatting/linting:** ESLint + Prettier, default Next.js config as the baseline. Do not hand-roll a custom rule set for a project this size.
- **No raw SQL** unless a specific query genuinely cannot be expressed in Prisma — and if that happens, put the raw query in its own clearly-named function with a comment explaining why Prisma couldn't do it, not inline in a route handler.
- **No silent catches.** Every `catch` either handles the error meaningfully (a named error state per rule 12) or re-throws with added context. Never swallow an error to make a red squiggle go away.
- **Functions do one thing.** A route handler orchestrates; it doesn't contain the proration formula inline, the idempotency check inline, and the entitlement logic inline all in one 200-line function. Pull each into its named module from Q4's layout.
- **No commented-out code, no dead branches, no `// TODO: handle later` inside a code path that's supposed to be complete.** If something is genuinely deferred, it belongs in the PRD's Open Questions, not as a comment in shipped code.
- **Naming matches the PRD's vocabulary.** Use `Subscription`, `PaymentEvent`, `hasProAccess`, `pendingInterval` etc. exactly as named in the data model — don't rename things "to be clearer" and fork the vocabulary between the docs and the code.

---

## Q6. What counts as done

At the end of any task, phase, or PR, produce this checklist filled in — not just "done," but which specific PRD requirement or rule each line satisfies. Do not mark something done because the happy path works; walk the failure paths too.

```
## Completion checklist

Build
- [ ] `next build` completes with zero errors and zero type errors
- [ ] ESLint passes with zero errors
- [ ] Prisma schema is valid and migrations apply cleanly to a fresh database

Entitlement & security (rules 1–7)
- [ ] hasProAccess() is the only place entitlement is computed — grep confirms no duplicate logic
- [ ] Webhook route verifies flutterwave-signature before parsing the body
- [ ] Webhook route re-verifies the transaction against Flutterwave's API before fulfilment
- [ ] Idempotency test passes: replaying one event twice produces one PaymentEvent row
- [ ] Duplicate-fulfilment test passes: related events for one transition produce exactly one FULFILLMENT row
- [ ] No card data appears anywhere in the database, logs, or stored payloads

Money & logging (rules 8–9)
- [ ] Every amount field is an integer in minor units; no float/decimal anywhere in the money path
- [ ] No code path calls .update() on PaymentEvent

Lifecycle correctness (rules 10–11)
- [ ] Cancelling does not revoke access before currentPeriodEnd (manual or automated check)
- [ ] Downgrade does not change the effective plan before the renewal boundary
- [ ] The downgrade execution mechanism (Q2 table) is implemented and documented, not left as a stub

Error handling (rule 12)
- [ ] Every FR in the relevant screen's section has a corresponding named error/empty/loading state
- [ ] Custom error.tsx and not-found.tsx exist and are reachable from the payment route group

Scope (rule 13)
- [ ] No feature was built that isn't in this phase's task list
- [ ] No non-goal (N1–N8) was implemented

Abuse protection (rule 14)
- [ ] Checkout initiation is rate-limited via RateLimitBucket and returns 429 with Retry-After when exceeded

Traceability
- [ ] Every requirement this task claims to satisfy is listed by its PRD ID (FR-#, G#, N#)
```

If any box can't be checked honestly, the task is not done — say so plainly and name which box, rather than reporting completion.

---

## Q7. What does the agent do when unsure

Stop reaching for a solution and do these, in order:

1. **Do not invent scope.** If a requirement is ambiguous, underspecified, or simply not covered by the PRD or this file, that is not permission to design a reasonable-sounding feature and ship it. Implement the smallest thing that satisfies the letter of what's written, and flag the gap.
2. **Do not guess at a Flutterwave mechanism that isn't in the Q2 table.** If the PRD describes Stripe behavior with no listed Flutterwave equivalent, treat it as an open question, not an invitation to improvise an integration against undocumented behavior.
3. **Never write speculative, branching, "just in case" code.** No feature flags for unbuilt features, no extra abstraction layers for flexibility nobody asked for, no config options with only one valid value. That is exactly the spaghetti this file exists to prevent.
4. **Surface the question instead of resolving it silently.** Add it to a running list of open questions (mirroring the PRD's own Section 14 pattern) with enough context that a human can answer it in one read, and either pause that piece of work or implement the narrowest interpretation while clearly marking it as an assumption pending confirmation — never bury the assumption in a comment nobody will read.
5. **When two rules in this file seem to conflict, prefer the more conservative one** — the one that grants less access, stores less data, or does less automatically. Ask rather than pick the permissive interpretation.
6. **Never work ahead of the current phase.** If Phase 1 is incomplete, do not start building Phase 3 pieces because they seem related or convenient to do together. Roadmap order (PRD Section 13) is a rule, not a suggestion.
