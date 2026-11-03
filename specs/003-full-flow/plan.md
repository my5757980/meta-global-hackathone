# 003 plan

Order: CRM, customer account, auction desk data model, auction buyer pages, auction desk pages, website, chat, app. Each block ends with its own test script, then a commit.

## Data (migration 0007)
- leads: duplicate_attempt_by, duplicate_attempt_at
- units: cover_file_id
- unit_financials: currency, cost_usd
- auction_lots: sale_time, engine_hp, model_grade, feed
- auction_bids: bid_no, over_bid_jpy, message; default state "placed" (old "active" rows become "placed")
- auction_enquiries: default state "new"
- web_orders: country, city, port, pay_percent, pay_now_usd, paid_usd
- users: avatar_url already exists; chat_visible already exists, now used
- vehicles: spec_rows (jsonb)
- chassis_lookup: demo table for the production-year lookup
- feed_state: one row per demo feed

## Decisions
- "Payment received" is computed, not stored, so a deleted payment cannot leave it stale.
- A unit's cover: chosen file, else its first picture. Deleting the cover falls back by itself.
- Bid amount: any positive number. The auction desk judges it. Settlement counts placed, under review and accepted bids; rejected bids never win.
- Demo feed is a timer inside the server, off during evals and tests that need a fixed lot count (DEMO_FEED=off or paused).
- Language picker: uses the browser-side Google widget only when the visitor picks a language, nothing loads before that.

## FTE paths
- Kaito (auction): review_bid, list_bids_to_review, plus a reflex on auction.bid.placed.
- Yuki (CRM): reassign_lead, plus a note on every duplicate attempt.
- Aoi (operations): cover is automatic.
- Hana (website): reads the new checkout fields in review_web_order.

## Tests
QA scripts stay out of the repo. Each block gets a script that signs in as each role and checks the screens and the API.
