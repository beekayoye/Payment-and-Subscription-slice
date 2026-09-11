# Project Identity & Source of Truth

## What This Is

A test-mode subscription billing system built against **Flutterwave** (sandbox mode). A signed-in user holds one of three plan states — Free, Pro Monthly, or Pro Yearly — on their user record. The system handles: subscribe, upgrade (with mid-cycle proration), downgrade (deferred to next renewal), and cancel (access retained through paid period).

The product being sold is a **plan flag on the user record**. Nothing else is gated.

## Source of Truth Hierarchy

1. **What to build** → `Docs/subscription-system-prd-v2.md` (the PRD wins)
2. **How to behave, structure code, handle edge cases** → `AGENTS.md` (this wins over PRD)
3. The PRD was written for **Stripe** but the provider is **Flutterwave**. The translation table in AGENTS.md Q2 is authoritative. Never implement against Stripe or Paystack APIs.

## Scope

This is **v1**, scoped to Phases 0–4 from the PRD's roadmap (Section 13). Nothing beyond that is in scope until a human says otherwise. Never work ahead of the current phase — roadmap order is a rule, not a suggestion.
