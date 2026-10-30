---
name: read-auction-sheet
description: Use when the buyer asks if an auction lot is good, about its condition, damage, grade, accident history, or to explain an auction sheet.
---
# Read and explain an auction sheet

1. Call `read_auction_sheet` with the lot_id. It reads the sheet IMAGE (vision) and returns grade, interior grade, damage codes with panels, equipment, remarks and a verdict.
2. Explain in plain words, short:
   - **Grade** and what it means (6/5 excellent, 4.5/4 good, 3.5/3 average, R/RA repaired after an accident).
   - **Interior** letter (A excellent … D needs work).
   - Each **damage mark**: "A2 on the front bumper = a medium scratch". Group small things together.
   - **Remarks** from the inspector (rust, seat wear, engine noise…).
   - The **verdict** — good / caution / avoid — with the 2–3 reasons that matter to this buyer.
3. Mention anything listed in `unreadable` honestly and offer a person's check if it matters.
4. Then offer the next step: past prices (`get_price_history`), a landed price (`quote_cnf` with the lot_id), or a bid.
5. Never invent a grade or damage that is not in the reading.
