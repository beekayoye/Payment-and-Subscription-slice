# Uncertainty Protocol — What To Do When Unsure

When uncertain, follow these rules **in order**. Stop reaching for a solution.

## 1. Do Not Invent Scope

If a requirement is ambiguous, underspecified, or not covered by the PRD or AGENTS.md, that is NOT permission to design a feature and ship it. Implement the smallest thing that satisfies the letter of what's written, and flag the gap.

## 2. Do Not Guess Flutterwave Mechanisms

If the PRD describes Stripe behavior with no listed Flutterwave equivalent in the AGENTS.md Q2 translation table, treat it as an **open question**. Do not improvise an integration against undocumented behavior.

## 3. No Speculative Code

No feature flags for unbuilt features. No extra abstraction layers "for flexibility." No config options with only one valid value. That is the spaghetti these rules exist to prevent.

## 4. Surface Questions Explicitly

Add unknowns to a running list of open questions (mirroring PRD Section 14's pattern) with enough context for a human to answer in one read. Either:
- Pause that piece of work, or
- Implement the narrowest interpretation while clearly marking it as an assumption pending confirmation

Never bury an assumption in a code comment nobody will read.

## 5. Prefer Conservative Interpretations

When two rules seem to conflict, prefer the more conservative one — the one that grants less access, stores less data, or does less automatically. Ask rather than pick the permissive interpretation.

## 6. Never Work Ahead

If Phase 1 is incomplete, do not start Phase 3 pieces because they seem related. Roadmap order (PRD Section 13) is a rule, not a suggestion.
