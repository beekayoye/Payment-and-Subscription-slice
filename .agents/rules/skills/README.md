# Skills

Task-oriented playbooks for building this system. Where `/.agents/rules/*.md` states constraints ("never do X"), each file here is the procedure for actually doing a recurring piece of work correctly the first time — what to touch, what order to do it in, and which rule/FR it must satisfy when finished.

Read the numbered rules files first (`01`–`12`) for the _why_. These files are the _how_. If a skill and a rules file ever disagree, the rules file wins — fix the skill, don't follow it.

| Skill                                                                    | Use when                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [implement-flutterwave-webhook.md](implement-flutterwave-webhook.md)     | Building or touching `/app/api/webhooks/flutterwave/route.ts`                        |
| [check-pro-access.md](check-pro-access.md)                               | Any screen, route, or middleware needs to know if a user has Pro                     |
| [implement-subscribe-flow.md](implement-subscribe-flow.md)               | Building Checkout Initiation or the Free→Paid fulfilment path                        |
| [implement-upgrade-flow.md](implement-upgrade-flow.md)                   | Building Monthly→Yearly upgrade with proration                                       |
| [implement-downgrade-flow.md](implement-downgrade-flow.md)               | Building Yearly→Monthly deferred downgrade                                           |
| [implement-cancel-flow.md](implement-cancel-flow.md)                     | Building the cancel flow                                                             |
| [log-payment-event.md](log-payment-event.md)                             | Any code path is about to write to `PaymentEvent`                                    |
| [add-checkout-rate-limiting.md](add-checkout-rate-limiting.md)           | Building or touching `/api/checkout` rate limiting                                   |
| [add-payment-screen-error-states.md](add-payment-screen-error-states.md) | Building any of the five payment-path screens                                        |
| [run-completion-checklist.md](run-completion-checklist.md)               | Finishing a task, phase, or PR                                                       |
| [handle-spec-ambiguity.md](handle-spec-ambiguity.md)                     | The PRD, AGENTS.md, or a rules file doesn't clearly cover what you're about to build |
