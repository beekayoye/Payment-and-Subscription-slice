---
name: check-pro-access
description: Determine whether a user has Pro access, anywhere in the codebase — a screen, a route handler, middleware, a component. Use this instead of writing a new check.
---

# Check whether a user has Pro access

## The rule

There is exactly one function allowed to answer "does this user have Pro access" anywhere in this codebase: `hasProAccess(subscription: Subscription | null): boolean`, exported from `/lib/entitlement.ts`.

```ts
hasProAccess(subscription) === true
  iff subscription.plan === 'PRO'
  AND subscription.status is 'ACTIVE' or 'CANCEL_SCHEDULED'
```

## Steps

1. **Before writing any new "is this user Pro" logic, search for an existing call site first** — `grep -r hasProAccess`. If a call site already covers your case, reuse it; don't add a parallel path.
2. **If you need entitlement in a new location** (new route handler, new component, new middleware check), fetch the `Subscription` row from the database (or accept it as a prop passed down from a caller that already fetched it — don't refetch redundantly per rendered component), then call `hasProAccess(subscription)`. Do not read `subscription.plan` or `subscription.status` directly to make an access decision anywhere outside `/lib/entitlement.ts` itself.
3. **Handle the no-row case correctly.** A user with no `Subscription` row at all and a user with a row where `plan = FREE` are both simply not-Pro — `hasProAccess(null)` and `hasProAccess({ plan: 'FREE', ... })` must both return `false`, and both must render identically wherever "current plan" is shown (A16).
4. **Never derive entitlement from client state** — not a URL param, not a query string, not anything the client sent. Always from a `Subscription` row fetched server-side for the authenticated user.

## Forbidden patterns

- A second helper "just for this component" that re-implements the same check.
- An inline `if (subscription.plan === 'PRO' && ...)` anywhere outside `/lib/entitlement.ts`.
- A component prop like `isPro` computed by the caller with its own logic instead of by calling `hasProAccess()`.
- Trusting a `?plan=pro` query param, a client-side cookie value, or anything not read fresh from the database this request.

## Definition of done

- `grep -rn "plan === 'PRO'\|plan == 'PRO'"` outside `/lib/entitlement.ts` returns nothing.
- Every call site imports `hasProAccess` from `/lib/entitlement.ts`.

Satisfies: PRD FR-2a, Section 7. Rule 2.
