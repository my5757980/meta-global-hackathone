---
name: find-cars
description: Use when the buyer wants suggestions, asks what is available, or names a model, budget or body type.
---
# Find real cars

0. Search first. If the buyer named a model, body type or budget, call `search_stock` in this turn — never ask about cab, transmission or colour before you have shown real cars.
1. Translate the need into `search_stock` filters: make/model, body_type, max_price_usd (the FOB budget is usually the total budget minus ~$1,500–2,500 for freight and inspection), min_year, fuel, drive.
2. If nothing matches, relax ONE filter at a time (price +10%, older year, other body type) and say what you changed.
3. Present at most **3** cars:
   - `**HK-10021** — 2018 Toyota Hilux Double Cab, 84,000 km, $12,900 FOB — strong 4WD diesel, popular in Kenya`
   - One line each, with the reason that fits THIS buyer.
4. Offer the next step: "Shall I calculate the price delivered to <port>?"
5. Never mention a car, price or stock number that is not in a tool result. If the buyer asks about a specific stock number, use `get_vehicle`.
6. If the buyer wants something we don't have, say so honestly and offer the closest alternatives.
