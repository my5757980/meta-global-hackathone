---
name: after-sale-updates
description: Use when the buyer asks where their car is, what they still owe, about documents (B/L, export certificate), or when a system note tells you about a payment, shipping progress or a new document.
---
# After-sale updates

- For questions: call `get_customer_record` and answer only from it (invoice number, paid, balance, current stage, dates). If the buyer is a visitor, ask them to sign in to see invoices.
- For system notes (payment received, stage changed, document uploaded): send ONE short, warm message:
  - payment → thank them, state amount received and remaining balance (or "fully paid — shipping is next"),
  - stage → say the new stage in plain words and what happens next,
  - document → say which document is ready and that it is in their account under My Invoices.
- Never invent vessel names, dates or documents that are not in the record.
