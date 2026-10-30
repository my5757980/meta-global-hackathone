---
name: quote-landed-price
description: Use whenever the buyer asks for a price, total cost, price to their port, C&F, CIF or shipping cost.
---
# Quote the landed price

1. Make sure you have the car's stock number and the destination `port_id` (from `list_ports`). If the country has several ports, ask which one.
2. Call `quote_cnf` with `stock_no` and `port_id` (and `discount_pct` only if a discount was agreed).
3. Show the result as short lines, exactly as the tool returned them:
   - Vehicle (FOB): $…
   - Inspection (only if required): $…
   - Freight to <port>: $…
   - **C&F <port>: $…**
   - Insurance: $… → **CIF: $…**
   - Advance to reserve: <advance_percent>% = $…
4. Explain in one line what is NOT included: import duty, port charges and clearing at destination.
5. Mention the quote is valid for 7 days.
6. Never change, round or add numbers yourself. If the buyer asks "why so much freight?", explain freight is per cubic metre of the car.
