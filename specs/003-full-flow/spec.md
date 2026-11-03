# 003: The whole flow, screen for screen

**Owner's words:** "koi aik feature miss nahii, sab flow same, demo data, full FTE: website, CRM, auction, chat, app."

The reference flow is a used-car export business: website, CRM, auction portal, chat, phone app. This spec lists what AutoFTE lacked after a code-against-code comparison. Everything here runs on fictional demo data. Nothing is copied: same jobs, our own code, words and pictures.

## Rules
- Each item works for a person with the right to do it AND, wherever it is routine work, for a Digital FTE.
- Money and limits stay on the server. A bid or a payment is never decided by the model alone.
- A person's button stays for exceptions.

## Functional requirements

### CRM
- FR-1 A person adding a phone or e-mail that another agent already owns is refused with the owner's name and date; the attempt is flagged on the lead; Supervisors are told; the CRM desk notes it.
- FR-2 One lead can be reassigned; its invoices and units follow; the new owner is told. The CRM desk can do it too.
- FR-3 Leads list: rows per page, first and last page.
- FR-4 Dashboard: Lead pipeline, Total customers, Total invoices, Pending invoices.
- FR-5 Invoices list: five counts (total, pending, approved, sent, payment received), month filter, search by agent, customer, agent, vehicle, chassis, status and date columns. "Payment received" shows once a sent invoice is paid in full.
- FR-6 Invoice page: remove the final PDF before sending, view unit per vehicle, salesperson shown, payments table with selling price, received, rate, yen, recorded by, receipt; delete a payment (recorded in history).
- FR-7 Units list: cover picture, search by make, model, year, chassis, colour; added by; profit; drive, fuel, mileage, location.
- FR-8 Unit page: edit fields, cover (first picture by itself, removable), delete one file, ZIP of one unit, payment summary, costing with a USD-only mode.
- FR-9 Reports: week Monday to Friday, calendar month, pick a date, totals row, units per agent, per-agent drill-down, CSV for all and for one agent.
- FR-10 A team chat button on every staff page.

### The customer's account
- FR-11 Invoice list shows the first picture of the car. States read On hold, Processing, Completed.
- FR-12 A running timeline on the invoice: each payment with its balance, each new document, each shipping stage.
- FR-13 Per vehicle: paid and remaining. Payment history with balance after each. Salesperson. Picture viewer.

### Auction, buyer
- FR-14 Three search boxes (lot numbers, chassis model, chassis number) plus hall.
- FR-15 Several ticks per filter; year, mileage and engine from-to; Reset; hide the search panel.
- FR-16 Table list with every column sortable; time left; per page 20, 50, 100; total as A + B; Live mark.
- FR-17 Lot page: print, previous and next, A B C D shortcuts, sale time, status, engine power, model grade, deadlines, sheet legend, more of this model.
- FR-18 Production-year lookup from a chassis number plus "our stock" of that model (demo table).
- FR-19 Bid: any positive amount, a BID- number, over-bid, charges, approx FOB, message, Terms box required, "time passed" warning that does not stop the bid.
- FR-20 FOB calculator with the company's rates.
- FR-21 Order confirmation screen with Terms box.
- FR-22 Buyer's page: tiles, account panel, bid numbers.
- FR-23 Past prices: 1, 2, 3 months, chassis, lot numbers, year to, colour, summary (sold, average), average per row, CSV for staff; detail page with previous and next, copy info, production lookup, legend.
- FR-24 Tokyo clock and a language picker on auction pages.

### Auction, desk
- FR-25 Bid states placed, under review, accepted, rejected, won, lost. The auction desk FTE reviews each bid: it may move it to accepted or rejected with a note, inside its limits.
- FR-26 Bids screen: pick a day (opens on today), counts per state, note, staff tag.
- FR-27 Excel: only accepted bids of that day, grouped by customer, desk columns first.
- FR-28 Enquiry states new, open, answered, closed. Enquiry page: conversation, client, vehicle, their other enquiries. Reading it moves new to open.
- FR-29 Orders: seven states and counts. Clients: three totals, phone, value, joined, status. Vehicles: picture, chassis search, sold price.
- FR-30 Overview: A + B, past-price count, awaiting review, rings for bids and enquiries, funnel of people, 30-day activity, timeline with Open, one row per customer, desk totals, role reach, per-customer bid flow, order totals. Numbers beside Bids and Enquiries in the menu.
- FR-31 Demo feed: lots keep arriving through the day from two labelled demo feeds; a Data sources screen shows each feed's state and lets staff pause it. The auction desk FTE reports a stopped feed.

### Chat
- FR-32 A tick per staff member: show in the chat or not.
- FR-33 Group ticks.

### Website
- FR-34 Checkout: name, e-mail, phone, country, city, port, payment percent and pay-now amount, 25% minimum up to $3,000, account made at checkout for a guest, pay online, or send for checking; summary with subtotal, pay now, remaining.
- FR-35 Buy now on the car page and in search suggestions.
- FR-36 Currency box in the top bar, brand menu.
- FR-37 Bank page: three accounts, copy buttons, verify-first steps.
- FR-38 Profile picture; remember me; country at sign-up.
- FR-39 Blog search and recent posts.
- FR-40 Admin dashboard: order activity, snapshot, recent orders, latest customers. Admin orders: add, edit, paid, remaining, percent, payment id.
- FR-41 Free name + value specification rows on a car.

### App
- FR-42 The same checkout. Share a car or article. Ask-our-team band.
- FR-43 Staff can sign in: conversations, team, groups, new group, group info.
- FR-44 Notification buttons: reply, mark read, answer, decline. A crash screen that reports.
- FR-45 A download page with version, size and how to install.

## Out of scope
Real auction feeds and their IDs: others' data, the rules bar them. A demo feed takes their place and the page says so.

## Acceptance
Every FR has at least one automated check against the running system. Old suites stay green. A full sale still runs with no person.
