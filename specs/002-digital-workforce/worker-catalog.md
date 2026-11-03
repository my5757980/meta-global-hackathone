# Worker catalog: a used-car exporter

The same eight headings for every business the pattern is used in. The live version of the role cards is `apps/server/src/fte/workforce.ts`, and the console's Workforce tab shows it.

## Definition

A used-car exporter sells cars from Japanese stock and auctions to buyers abroad. One sale runs from a first message to a car delivered to a far-off port, and passes through seven jobs that used to be seven people.

## System of record

One Postgres database: stock, auction lots and results, leads, quotes, invoices, payments, units, documents, shipping progress, chats, and the audit log. Prices come from a deterministic engine (`services/pricing.ts`). No FTE holds a fact of its own: every number comes from a tool result.

## Worker fleet

| Seat | FTE | Woken by |
| --- | --- | --- |
| Sales | Sora | A buyer's message, and every event about that buyer |
| Invoices | Mei | `invoice.requested` |
| Accounts | Ren | `payment.slip` |
| Operations | Aoi | A document arriving from the yard or the shipping line |
| Auction desk | Kaito | `enquiry.created`, `auction.order.created` |
| CRM | Yuki | `contact.message` |
| Website | Hana | `web_order.created`, `vehicle.created` |
| Chief of staff | Tomo | `approval.requested`, and his own heartbeat |

Steps that need no judgement are reflexes in plain code, with no model: the final PDF after an approval, the unit and costing after a payment, an order following its bid, imported leads getting an owner.

## Authority envelope

Set by the owner on a screen, and checked on the server inside each tool.

| What | Who, up to | Above that |
| --- | --- | --- |
| Discount | Sora 5%, Tomo 8% | The owner |
| Auction bid | Sora ¥3,000,000, Tomo ¥6,000,000 | The owner |
| Approving an invoice | Mei $60,000, Tomo $150,000 | The owner |
| Recording a payment | Ren $60,000, Tomo $150,000 | The owner |
| Refunds, disputes, legal matters | Nobody | Always a person |

Each task has its own dial: L0 a person does it, L1 it proposes and a person approves, L3 it acts and stops at its limits, L4 it runs on its own. A seat can also be switched off, and has a daily token budget.

## Human supervisor

The owner. The owner sets the limits, moves the dials, answers what is above the chief of staff's mandate, reads the daily report, and can overrule a decision. A person also takes any chat a buyer asks a person for, and any voice or video call.

## Verification checkpoints

- **Invoice rubric** in code (`services/invoiceCheck.ts`): the consignee is complete, every car has a price, no car is sold or on another invoice, the price is the accepted quote or not below the policy. It runs when Mei reads the invoice and again when she approves it.
- **Slip checks** in code: the amount, the currency, the company's account and the reference are compared with what the picture really said; the slip's sender must be the invoice's buyer; a reference can be used once.
- **Document check** in code: a document's chassis must be this unit's.
- **Doer and checker**: Sora asks, Mei checks. A desk passes up, Tomo decides, and the server checks his mandate.
- **Signed ledger**: each authority decision is signed over the one before it, so a change shows.
- **Evals** on the live model, with safety cases for each desk (`fte/evals.ts`).
- **End-to-end test**: a whole sale with no staff action, on the live model.

## Reference engines

Muse Spark Open, Meta's open-weight model, for every model call: tool calling, reading pictures, hearing voice notes, summaries and reports. MCP for tools, with a run token per job and a tool list per seat. An event outbox for handing work on.

## Failure modes

| What can go wrong | What happens |
| --- | --- |
| A fake slip, or the same slip twice | `record_payment` refuses it, and Sora tells the buyer why |
| Words on a picture that give orders | They are data: the checks do not read them, and nothing is recorded |
| A document for another car | `file_document` refuses it, and Aoi passes it up |
| The model is down, or a job fails | The job is tried once more, then the owner is told and a person can do it on the same screen |
| A desk uses up its token budget | It stops, says so in the team room, and the owner is told |
| The owner does not answer | After the set hours the safe default applies: not approved, on the record |
| A decision the owner disagrees with | The owner overrules it, and the chief reads that before deciding again. The action stands until a person changes it on its own screen |
| Someone edits the decision history | The ledger's chain breaks, and the console shows where |
