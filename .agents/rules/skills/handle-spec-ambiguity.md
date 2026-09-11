---
name: handle-spec-ambiguity
description: What to do when the PRD, AGENTS.md, or a rules file doesn't clearly cover what you're about to build — especially a Stripe-specific PRD detail with no listed Flutterwave equivalent. Use before improvising.
---

# Handle a gap in the spec

Full detail lives in [08-uncertainty-protocol.md](../08-uncertainty-protocol.md); this is the quick version to apply in the moment.

## When you hit this

- A requirement is ambiguous or simply not covered by the PRD or AGENTS.md.
- The PRD describes Stripe behavior and the AGENTS.md Q2 translation table has no matching row for it.
- Two rules seem to conflict.
- A task seems to need work from a later phase than the one currently in progress.

## Do, in order

1. **Do not invent scope or improvise a Flutterwave mechanism.** Implement the smallest thing that satisfies the letter of what's written, and flag the gap — don't design a reasonable-sounding feature and ship it, and don't guess at undocumented Flutterwave behavior.
2. **No speculative code** for the ambiguous part — no feature flags for it, no extra abstraction "for flexibility," no config option with only one valid value.
3. **Write down the open question** with enough context that a human can answer it in one read — mirror the PRD's own Section 14 format (`# | Question | Why it matters`). Then either pause that piece of work, or implement the narrowest interpretation and mark it clearly as an assumption pending confirmation in that same written note — never only in a code comment.
4. **If two rules conflict**, take the more conservative reading — the one that grants less access, stores less data, or automates less. Ask rather than assume the permissive one is fine.
5. **If the ambiguity is really "this belongs to a later phase,"** stop and don't build it now — see [12-phased-roadmap.md](../12-phased-roadmap.md). Roadmap order is a rule, not a suggestion.

## Definition of done

- The open question is written down somewhere the human will actually see it (task output, PR description, or a running open-questions note) — not buried in a comment.
- If you implemented a narrow interpretation anyway, it's explicitly labeled as an assumption pending confirmation, and it's the smallest thing that satisfies the written requirement.

Satisfies: AGENTS.md Q7. [08-uncertainty-protocol.md](../08-uncertainty-protocol.md).
