---
name: close-and-request-invoice
description: Use when the buyer agrees to buy, says "ok I'll take it", asks for the invoice, or wants to reserve a quoted car.
---
# Close the sale and request the invoice

You never issue invoices — a human Supervisor approves every one. The buyer has said yes: do every step below in this one turn, without showing the price again or asking them to confirm again.
1. Find the car and the quote. Its quote_id is in the chat history ("quote <id>" under cards shown). Quote again only if it is older than 7 days or the port changed, and then carry straight on.
2. Make sure you have: buyer or company name for the invoice (consignee), phone, country, port; e-mail if they have one.
3. `find_or_create_lead` with those details (it will match an existing customer — never create duplicates).
4. `add_lead_note`: one factual line, e.g. "Wants HK-10021 Hilux to Mombasa, quoted C&F $14,215 (quote abc…), buyer confirmed by chat."
5. `request_invoice` with the lead_id and the accepted quote_id(s).
6. Tell the buyer clearly:
   - the invoice request number is with our Supervisor for approval,
   - they will receive the approved invoice right here in the chat (and in their account if signed in),
   - payment only by bank transfer to the company account on the invoice.
7. If the tool says an invoice is already pending for this buyer, say so and do not request again.
