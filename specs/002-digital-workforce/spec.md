# Feature spec: the digital workforce

**Status:** in build, 3 Nov 2026. **Owner's order:** from the first message to the car at the port, every step is done by a Digital FTE. Nothing in the normal flow is manual. Same features as before, the same screens.

**Source of the method:** The AI Agent Factory (agentfactory.panaversity.org): the Worker Catalog, Human-Agent Teams, Identic AI, Workforce with Paperclip, the Nervous System, and the thesis's seven invariants.

## What changes

AutoFTE had one Digital FTE, Sora, doing the sales agent's job. People did the rest. Now every role in the business is held by its own FTE. The book's rule: "The Worker is not the role. A vertical is unbundled into a fleet of role-based Workers, each focused enough to be specified, supervised and verified." The human moves to the board (the book's Invariant 1: "The human is the principal"): sets the limits, reads the report, decides what is above every limit.

## Roster

| FTE | Holds the seat of | Does the real system's job | Tasks |
|---|---|---|---|
| Sora | Sales agent | Chat, stock, price, lead, invoice request, bid, follow-up, buyer updates | sales.chat |
| Mei | Invoice supervisor | Checks and prices invoices, approves or rejects, final PDF, mark as sent | invoice.review |
| Ren | Accounts | Reads payment slips, records payments, fills costing | payment.record |
| Aoi | Operations | Units, the six document folders, shipping progress | ops.units, ops.documents |
| Kaito | Auction desk | Answers enquiries, handles orders, settles after the sale | auction.enquiry, auction.order |
| Yuki | CRM desk | Imported leads, contact messages | crm.leads, crm.contact |
| Hana | Website desk | Website orders, car listings | website.order, website.listing |
| Tomo | Chief of staff (the owner's delegate) | Clears the approval queue inside a mandate, signs a ledger, writes the daily report | chief.approvals |

## The flow, with no person in it

1. A buyer writes. Sora quotes and, on a yes, asks for the invoice.
2. Mei checks it against a rubric. Inside her limit she approves, adds the final PDF and marks it sent. Sora tells the buyer.
3. The buyer sends a bank slip, in chat or on the invoice page. Ren reads the picture, checks it, records the payment. Sora thanks the buyer.
4. Aoi makes the unit, Ren fills the costing, and the shipping stages move as signals arrive. Documents are read, checked against the chassis, and filed in the right folder. Sora tells the buyer each step.
5. Tomo clears what is above a worker's limit, and passes only what is above his own mandate to the owner, with his opinion.

## Requirements

- **FR-1** Each FTE has its own account, its own tools and its own record of runs. It cannot call another's tools; the server checks.
- **FR-2** Every action has an audit row saying which FTE did it. Authority decisions (invoice, payment, approval) go in a signed, chained ledger anyone can verify.
- **FR-3** Autonomy is per task, per FTE, and the owner can change it on a screen: L0 manual (the FTE stays out, people use the same screens as before), L1 (money tasks: it proposes, a person approves), L3 or L4 (it acts; L3 stops at its limits).
- **FR-4** Limits are enforced on the server, inside the tools. No prompt can pass them.
- **FR-5** A worker that fails, or runs out of its daily tokens, does not lose work: the owner is told.
- **FR-6** Nothing is asked of the owner that Tomo may decide. What reaches the owner comes with Tomo's opinion. If the owner does not answer in time, the safe default applies and is recorded.
- **FR-7** The owner can overrule a decision; Tomo reads his overrules before deciding again.
- **FR-8** Work happens in the open: each FTE writes what it did in the workforce room.
- **FR-9** A daily report: what each FTE did, misses, tokens, what needs a look.
- **FR-10** All manual screens keep working, unchanged.
- **FR-11** A buyer can send a bank slip from the invoice page (website and app) or in the chat, and a demo can print a sample slip.
- **FR-12** A website order with no known port waits: the sales FTE asks the buyer, and hands it back to the website desk with the answer.
- **FR-13** A buyer can pay a website order online: PayPal with the company's keys, or, in demo mode without keys, a stand-in page that moves no money and says so. The website desk then makes the invoice, and the payment goes on it by itself once the provider has confirmed it.
- **FR-14** Anyone in the console can watch one whole sale run: a scripted buyer and outside world, and the real FTEs. It does not touch the demo clock.

## Not in scope

- Talking on a voice or video call. A call rings a person: the book's escalation exit.
- Real bank and shipping-line feeds. The demo simulates them on the demo clock and says so on screen.
- Hiring new FTEs automatically (the book's self-expanding workforce).

## Acceptance

- A test runs a full sale from chat to delivered with the demo clock, and the audit shows no human actor.
- A slip with a wrong account, a repeat, or a wrong amount is not recorded.
- An invoice above Mei's limit reaches Tomo, above Tomo's reaches the owner.
- At L0 for all tasks the flow waits for people, as the real system does.
- Every older test suite still passes with the workforce switched off.
