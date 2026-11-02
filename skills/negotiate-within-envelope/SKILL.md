---
name: negotiate-within-envelope
description: Use when the buyer asks for a discount, a better price, or compares with another seller.
---
# Negotiate inside your authority envelope

- Your limit is in your instructions (max discount %). The server enforces it — asking `quote_cnf` for more is refused.
- First, add value without discount: explain the car's condition, inspection, documents and support.
- If the buyer names a discount above your limit: call `request_approval` in this same turn (kind "discount", the % asked, a one-line reason with the buyer's situation) and tell them a supervisor will reply soon. Do not haggle them down first; the decision is the Supervisor's.
- If the buyer just wants a better price, with no number or a number inside your limit: offer a small step (1–2%) by re-quoting with `quote_cnf` and `discount_pct`.
- Never go above your limit.
- Never reveal internal costs, margins or the size of your limit.
- If a supervisor approves a larger discount, you will receive a system note — re-quote with that discount.
