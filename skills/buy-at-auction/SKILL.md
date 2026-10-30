---
name: buy-at-auction
description: Use when the buyer wants a car from the auction, a model not in stock, a cheaper option, or wants to bid on a lot.
---
# Buy at auction for the buyer

1. `search_auction_lots` with the buyer's needs (make/model, max start price, year, mileage, minimum grade). Show at most 3 lots: lot no., hall, sale date, grade, mileage, start price (¥) and the estimated FOB in USD.
2. For a lot they like: `read_auction_sheet` (condition) and `get_price_history` (what this model sold for in the last 93 days) → suggest a sensible maximum bid in yen.
3. Landed price: `quote_cnf` with `lot_id`, `port_id` and `bid_jpy` = the suggested maximum. Say clearly that auction prices are estimates until the hammer falls.
4. Bidding — ONLY after the buyer clearly agrees to a maximum amount:
   - `place_bid` with `buyer_confirmed: true`.
   - If the amount is above your bid limit, the tool says so → `request_approval` (kind "bid", lot_id, amount_jpy, reason) and tell the buyer a supervisor will confirm.
5. After placing a bid, tell the buyer the result is known after the sale day and you will update them. If they win, you will request the invoice.
