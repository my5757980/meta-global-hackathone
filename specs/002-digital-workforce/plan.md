# Plan: the digital workforce

## Decisions

1. **One runtime, many role cards.** `fte/workforce.ts` holds the roster; `fte/workerRun.ts` runs any worker: same model, same loop, same run record as Sora. A role lives in a skill file (`skills/<desk>/SKILL.md`), the book's "a role is a skill".
2. **Same doors as people.** Workers call the services the screens call (`approveInvoice`, `rejectInvoice`, `markInvoiceSent`...). So the audit, the buyer's view and every later step are the same whoever acted.
3. **Scoped tools over the same MCP server.** `TOOLS` grows; each run token carries `workerKey`; `runTool` refuses a tool outside that worker's list.
4. **Reflex first, model when it needs judgement** (the book's nervous system). A deterministic step uses no tokens: final PDF and send after approval, a unit after the first payment, a stage from a structured signal, costing. The model reads pictures, weighs exceptions, writes to people.
5. **Checks in code, not in the prompt.** `invoiceRubric` is code. `approve_invoice` runs it again and refuses on a fail. `record_payment` compares the arguments with what vision read.
6. **Autonomy lives in the database**, read at each decision.
7. **The ledger** is an HMAC chain over decision rows, keyed by SESSION_SECRET.
8. **Simulated world, labelled.** `services/opsFeed.ts` plays the yard and the shipping line on the demo clock, only in demo mode.

## Data

- `fte_workers`: key, user, per-task levels, enabled, daily tokens.
- `fte_runs.worker_key`.
- `fte_decisions`: the signed ledger, with overrule fields.
- `fte_reports`: one per day.
- `payments.slip_reference`, `contact_messages.reply`.

## Risks

- Tokens: every decision costs some. Reflexes first, a daily cap per worker, and the public demo's own cap.
- A race with tests that expect a pending invoice: `WORKFORCE_ENABLED=false` for those suites.
- 4 GB laptop: one worker at a time per desk, two desks at most at once.
