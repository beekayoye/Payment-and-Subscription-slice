---
name: add-payment-screen-error-states
description: Give every payment-path screen (Plans, Checkout, Return, Billing) a named state for every failure mode instead of a generic error or blank page. Use whenever building or reviewing one of the five payment screens.
---

# Add error/empty/loading states to a payment-path screen

## The rule

No screen reachable from Plans, Checkout, Return, or Billing may dead-end: no blank page, no unhandled exception, no framework-default 404/500 (rule 12, G7).

## Steps

1. **For the screen you're building, list every FR in its section of the PRD** and confirm each one that describes a failure, loading, or empty condition has a distinct, named UI state — not a shared generic "Something went wrong" catch-all. Known ones already specified:
   - Checkout: rate-limited (FR-10), session-creation failure (FR-11).
   - Return View: processing (FR-13/14), polling-timeout (FR-15), payment-failed (FR-16).
   - Billing View: cancel/upgrade/downgrade API failure, shown inline without optimistic update (FR-21).
2. **Wrap every async handler** so no unhandled promise rejection can produce a blank response — a `catch` either renders a named error state or re-throws with context; it never swallows silently (per code-style rules).
3. **Confirm `error.tsx` and `not-found.tsx` exist** at the payment route group level and are actually reachable — test by forcing an error inside one of the routes and a navigation to a non-existent path under `/plans`, `/checkout`, `/billing`.
4. **Never optimistically update UI state before server confirmation** on any mutating action (upgrade, downgrade, cancel) — show a pending/loading state instead, and only reflect the new state once the server call resolves (FR-21).

## Definition of done

- Every failure path listed in step 1 renders visibly distinct copy/UI, not a shared fallback.
- Manually triggering an error inside each of the five screens never produces a blank page or the framework default error page.
- `error.tsx` and `not-found.tsx` exist under the payment route group.

Satisfies: PRD FR-10, FR-11, FR-15, FR-16, FR-21, G7. Rule 12.
