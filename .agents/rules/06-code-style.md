# Code Style & Quality

Optimize for the next person reading under time pressure, not for cleverness.

## TypeScript

- **Strict mode on** — always.
- No `any` without a comment explaining why it was unavoidable.
- Explicit types on function boundaries (params and return type). Inference is fine internally.

## Node.js

- **Current LTS only.** Pin exact version in `package.json` (`engines`) and CI/build config.
- No experimental or odd-numbered releases.

## Formatting & Linting

- ESLint + Prettier, default Next.js config as baseline.
- Do not hand-roll a custom rule set for this project size.

## SQL

- **No raw SQL** unless a query genuinely cannot be expressed in Prisma.
- If raw SQL is needed: put it in its own clearly-named function with a comment explaining why Prisma can't do it. Never inline in a route handler.

## Error Handling

- **No silent catches.** Every `catch` either handles the error meaningfully (a named error state) or re-throws with added context.
- Never swallow an error to make a red squiggle go away.

## Function Design

- Functions do **one thing**. Route handlers orchestrate — they don't contain proration formulas, idempotency checks, and entitlement logic inline in one 200-line function.
- Pull each concern into its named module per the directory layout.

## Code Hygiene

- No commented-out code.
- No dead branches.
- No `// TODO: handle later` inside a code path that's supposed to be complete. Deferred work goes in the PRD's Open Questions.

## Naming Convention

- **Naming matches the PRD's vocabulary exactly.** Use `Subscription`, `PaymentEvent`, `hasProAccess`, `pendingInterval`, `currentPeriodEnd`, etc. as named in the data model.
- Do not rename things "to be clearer" and fork the vocabulary between docs and code.
