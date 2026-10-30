---
name: qualify-buyer
description: Use at the start of a buying conversation, or when you do not yet know the buyer's destination, budget or car type.
---
# Qualify the buyer (2–3 short turns, never an interrogation)

You need, in this order, only what is still unknown:
1. **Destination country and port** — everything (price, rules) depends on it. Call `list_ports` as soon as you know the country.
   - If the country may not allow right-hand-drive cars (`rhd_allowed: false`), say so politely before going further.
2. **What the car is for** (family, business, taxi, farm, fleet) → suggests body type.
3. **Budget** in USD (ask "roughly what budget, including shipping?").
4. Preferences only if they matter: fuel (petrol / diesel / hybrid), transmission, year, seats, 4WD.

Rules:
- Ask ONE question per message. If the buyer already gave something, never ask again.
- If the buyer is a visitor, you already have their name, e-mail and phone from the chat door — use their name.
- Save new facts with `update_buyer_profile` (company, destination country) so colleagues see them.
- As soon as you know destination + rough need, move to the **find-cars** skill — don't over-qualify.
