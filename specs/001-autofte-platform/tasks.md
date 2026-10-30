# Tasks: AutoFTE

**Input**: spec.md, plan.md, data-model.md, research.md, quickstart.md
**Format**: `[ID] [P?] [Story] Description`. `[P]` means the task can run in parallel (different files, no
dependency).
**Order**: by phase. P1 (US1–US4) first, then P2, then P3. Every phase ends with a runnable demo.

## Phase 1: Setup
- [ ] T001 Root `package.json` with npm workspaces (`apps/*`, `packages/*`) and scripts:
  - `dev` (server + web)
  - `setup` (migrate + seed + sheets)
  - `build`, `start`
  - `test`, `eval`
  - `typecheck`, `lint:secrets`
- [ ] T002 [P] `apps/server` skeleton: tsconfig, tsx dev runner, `src/env.ts` (zod-validated env), `.env.example`
- [ ] T003 [P] `apps/web` skeleton: Vite + React + Tailwind v4 + React Router + TanStack Query, with a proxy to the API
- [ ] T004 [P] `packages/shared` with zod enums and types (statuses, roles, permissions list, folders, stages)
- [ ] T005 [P] LICENSE (MIT), README stub ("Built with Muse Spark Open", what was built during the event), `.gitignore`
- [ ] T006 [P] `scripts/secret-scan.ts`: fails if a key-shaped string or `.env` is staged

## Phase 2: Foundational (blocks all stories)
- [ ] T010 Drizzle schema for all tables in data-model.md (`apps/server/src/db/schema/*.ts`)
- [ ] T011 DB client factory: PGlite (`.data/pglite`) or node-postgres via `DATABASE_URL`. Migrations generated + run
  on boot.
- [ ] T012 Seed framework (deterministic RNG). Demo seed:
  - roles + permissions, staff (admin, manager, supervisor, 2 agents, accounts) + Sora, customers
  - countries + ports (≥ 150 countries, main ports, demo freight)
  - brands/models, ~120 stock vehicles
  - website content (home sections, pages, blog, FAQ, services, testimonials, partners, locations)
  - settings (site, pricing policy, envelope)
- [ ] T013 Auth:
  - sessions (cookie), bcrypt, `/api/auth/*` (login, logout, me, register, forgot/reset with a recovery path)
  - demo sign-in `/api/auth/demo/:role` (DEMO_MODE)
  - `requireAuth`, `requirePerm` middleware
- [ ] T014 Audit service (`audit()` inside a transaction), notifications service, SSE hub `/api/stream` (per user
  channels)
- [ ] T015 Files service: store under `.data/files`, access-checked serving `/api/files/:id`, upload (multipart)
- [ ] T016 [P] Web design system:
  - tokens from site settings (brand colours)
  - components: Button, Input, Select, Textarea, Card, Badge, Table, Modal, Drawer, Tabs, Toast, Skeleton, Empty,
    Pagination, Avatar, Stat
- [ ] T017 [P] Web shells:
  - public site layout (header, mega menu, footer)
  - staff layout (sidebar by role, top bar with CRM/Auction/Website/FTE buttons, bell)
  - auth pages with demo sign-in buttons
- [ ] T018 Pricing engine `services/pricing.ts`. Unit tests to the cent, covering discount, inspection, freight per
  port, insurance and FX.

## Phase 3: US1 + US2 — Sora sells, the Supervisor approves (P1, the MVP)
- [ ] T020 [US1] Model client `fte/model.ts`:
  - Baseten primary, Fireworks fallback, retries, timeouts, effort per task
  - token/latency capture
- [ ] T021 [US1] Tool registry (zod), part 1:
  - `search_stock`, `get_vehicle`, `list_ports`, `quote_cnf`
  - `find_or_create_lead`, `add_lead_note`, `request_invoice`
  - `handover_to_human`, `load_skill`

  Each tool: server-side envelope/role checks + an audit row in the same transaction.
- [ ] T022 [US1] MCP server at `/mcp` (streamable HTTP, bearer auth) exposing the registry. MCP client for Sora.
- [ ] T023 [US1] Skills folder: write `SKILL.md` for qualify-buyer, find-cars, quote-landed-price,
  close-and-request-invoice, negotiate-within-envelope, escalate-to-human. Write the loader and index.
- [ ] T024 [US1] Agent loop `fte/agent.ts`:
  - context build (persona, rules, envelope, skills index, summary + last 20 messages)
  - a tool loop of ≤ 8 steps
  - post the reply, write `fte_runs`, keep a running summary, fail over to the human queue
- [ ] T025 [US1] Chat core API:
  - conversations, members, messages
  - visitor entry (name + email + phone, cookie, same e-mail continues)
  - customer entry
  - SSE delivery
  - Sora is triggered when the holder is fte
- [ ] T026 [US1] Web chat widget:
  - round button, panel, full-window page
  - visitor form, message list (cards for vehicles/quotes)
  - composer, typing/working indicator
  - "Ask Sora about this car" entry
- [ ] T027 [US2] CRM invoices minimum:
  - list + detail
  - Supervisor approve / reject (note) / edit prices / mark sent
  - lead status sync
  - notifications
- [ ] T028 [US2] Approval feedback: on approve/reject an event fires and Sora messages the buyer (invoice summary +
  printable link + bank details / polite rejection)
- [ ] T029 [US1] Integration test: the scripted conversation ends with lead invoice_requested + pending invoice +
  audit rows. Then approving leads to the buyer being messaged (model stubbed).
- [ ] T030 [US1] Live smoke run against Muse Spark Open on demo data. Record timings.

## Phase 4: US3 — Website & customer portal (P1)
- [ ] T040 [US3] Public API: home sections, vehicles search (filters/sort/suggest), vehicle detail + related, pages,
  blog, FAQ, services, partners, locations, contact form
- [ ] T041 [US3] Home page with all sections (US3-1), responsive
- [ ] T042 [US3] Shop page:
  - filters, sort, pagination
  - search suggestions
  - vehicle cards with illustration/photos
- [ ] T043 [US3] Vehicle page:
  - gallery + full-screen viewer, video, specs
  - price/discount, related cars
  - cart, wishlist, Ask Sora
- [ ] T044 [US3] Cart, wishlist, checkout (order request) + account orders
- [ ] T045 [US3] Info pages: About, Services, Partners, Blog list/article, Locations, Bank Details, Contact, FAQ, 404
- [ ] T046 [US3] Auth pages: register, login, forgot/reset; profile edit + password
- [ ] T047 [US3] My Invoices:
  - invoices, vehicles, payments, balance
  - documents by folder, invoice PDF
  - progress timeline
  - no internal figures
- [ ] T048 [US3] CRM-customer → website account sync + link rules + one-time passwords (admin)
- [ ] T049 [P] [US3] SVG car illustration generator (body type × colour) used for stock images

## Phase 5: US4 — CRM complete (P1)
- [ ] T050 [US4] Leads:
  - create (country → ports), list (own vs all), filters, search, per-agent counts
  - duplicates
  - notes thread
  - status changes per matrix
- [ ] T051 [US4] Lead Excel upload (template download, validation, duplicate check, notify Supervisor once) +
  transfer all leads between agents
- [ ] T052 [US4] Invoice request form:
  - multi-vehicle cards (≤ 50, running totals)
  - optional pricing
  - duplicate guard
- [ ] T053 [US4] Invoice documents: printable view, PDF (pdfkit) and Excel (exceljs) in the demo brand layout,
  amount in words. Final-PDF upload.
- [ ] T054 [US4] Payments section: record, receipt upload, totals/balance. An event fires so Sora sends the
  thank-you + balance.
- [ ] T055 [US4] Units: "Add Unit k of N" pre-filled, specs, 6 document folders with upload, ZIP download
  foldered per chassis
- [ ] T056 [US4] Unit costing: yen lines → cost → profit, with the blank-FX guard
- [ ] T057 [US4] Vehicle progress tracking (staff update + customer timeline). An event notifies Sora.
- [ ] T058 [US4] Reports (period presets + range, per-agent, drill-down, Excel export) + Manager backup workbook
- [ ] T059 [US4] Users admin:
  - create, role, activate/deactivate, reset password
  - recovery key
- [ ] T060 [US4] Notifications bell UI + staff floating chat (role-pair rules, unread, last seen)
- [ ] T061 [US4] Permission tests: the matrix holds on the server for each role

## Phase 6: US5 — Auction portal (P2)
- [ ] T070 [US5] Demo auction data:
  - 12 halls, 12 sale days, ~3,000 lots with damage/equipment
  - ~20,000 past results
- [ ] T071 [US5] Auction sheet SVG template → PNG (resvg), cached. Lot photo set from the illustrations.
- [ ] T072 [US5] Client API + pages:
  - welcome flow (maker → model → list)
  - list with facets that narrow + counts
  - lot / multi-lot / chassis search
  - Back removes exactly one filter (URL state)
- [ ] T073 [US5] Lot page:
  - photos + viewer, sheet, spec
  - price history panel
  - bid box, enquiry
  - download ZIP (photos + sheet + spec PDF)
  - archive hidden from customers
- [ ] T074 [US5] Bids (ownership visibility, refuse on concluded lots, results after sale), orders (ORD-),
  enquiries (INQ-), client dashboard
- [ ] T075 [US5] Statistics list + filters + detail page, unsold = high bid, 93-day window
- [ ] T076 [US5] Auction admin:
  - overview with charts
  - vehicles, clients, orders, enquiries reply, bids + export
  - roles & permissions editor, staff CRUD
  - feed-health signal
- [ ] T077 [US5] Sora tools:
  - `search_auction_lots`, `get_auction_lot`, `read_auction_sheet` (vision, cached), `get_price_history`
  - `place_bid` (envelope / approval)
  - skill read-auction-sheet

## Phase 7: US6 — Chat depth (P2)
- [ ] T080 [US6] Media:
  - pictures (multi, client-side resize ≤ 1600 px, swipe gallery)
  - voice notes (WAV recorder; Sora understands them via audio input)
  - access-checked media
- [ ] T081 [US6] Ticks (sent/delivered/read), presence (green dots, ping from every page), unread counts, pop-ups,
  desktop notifications
- [ ] T082 [US6] Staff desk:
  - my conversations, see-everything drill-down
  - take over / hand back to Sora with the summary
- [ ] T083 [US6] Staff groups: create, rename, add/remove, leave
- [ ] T084 [US6] Voice/video calls:
  - WebRTC with signalling via API + SSE
  - ringing 45 s, answer/decline/busy/missed, mute/camera
  - call line in the thread

## Phase 8: US7 — Proactive Sora + FTE Console + evals (P2)
- [ ] T090 [US7] Scheduler + demo clock. Event handlers:
  - quote follow-up, unpaid advance reminder
  - payment thank-you, progress/document update
  - new-match alert from buyer_requests

  The envelope caps apply.
- [ ] T091 [US7] Tools `save_buyer_request`, `schedule_follow_up`, `send_customer_update`, `apply_discount`,
  `request_approval`. Approvals queue API.
- [ ] T092 [US7] FTE Console:
  - live activity, runs with tool calls + reasoning excerpt, audit trail per conversation
  - approvals queue, envelope editor
  - metrics, eval runs
- [ ] T093 [US7] Eval suite: ≥ 30 cases (qualification, grounding, sheet, quote maths, envelope, injection,
  escalation, Urdu). `npm run eval` stores the run. Console shows the pass rate.
- [ ] T094 [US7] Audit-coverage check: every mutating tool has exactly one audit row per call (test)

## Phase 9: US9 — Website admin (P3)
- [ ] T100 [US9] Admin CRUD: vehicles (all fields, images, video, SEO, home sections), brands/models, orders,
  customers (+ CRM record, progress)
- [ ] T101 [US9] Admin CRUD for content: blog, services, pages, FAQ, testimonials, partners, locations, contact
  messages, home sections
- [ ] T102 [US9] Roles & permissions editor (shared with the auction admin), administrators, site settings
  (white-label)
- [ ] T103 [US9] Agent customer scoping (own customers unless `website.customers.view_all`)

## Phase 10: US8 — Expo app (P3)
- [ ] T110 [US8] Expo app skeleton: tabs Home · Shop · Chat · Cart · Menu, theme from settings, API client + token
  auth
- [ ] T111 [US8] Screens:
  - Home, Shop + Filters, Vehicle (+ gallery), Wishlist, Cart, Checkout
  - Auth, Profile, My Invoices
  - Company pages, Contact, Blog
- [ ] T112 [US8] Chat screens (list + conversation, pictures, voice notes, Sora) + calls if time
- [ ] T113 [US8] Release APK (low-memory build settings) attached to a GitHub release

## Phase 11: Polish & submission
- [ ] T120 Responsive check script (7 widths × all pages). Fix every fault.
- [ ] T121 README:
  - setup, architecture diagram, how Sora works (skills/MCP/audit/approvals)
  - Meta model usage
  - credits, built-during-event statement
- [ ] T122 Clean-clone setup test (≤ 5 commands) on a fresh folder
- [ ] T123 Public GitHub repo + push. Optional hosted demo.
- [ ] T124 Demo video script (3 min, opens with the pre-existing line) + recording
- [ ] T125 Submission form texts (description, Meta usage, why Meta models) + X post for Most Viral

## Dependencies
- Phase 1 → Phase 2 → everything else.
- US1/US2 (Phase 3) depend on chat core (T025) and CRM invoices (T027).
- US3 My Invoices (T047) depends on the CRM tables (T010) and payments (T054); it can show seeded data before T054.
- US5 Sora tools (T077) depend on T070–T073.
- US7 depends on US1 tools + events.
- US8 depends on the public API (T040) + chat API (T025).

## MVP checkpoint (end of Phase 3)
A visitor talks to Sora on the website → gets real cars + an exact C&F quote → Sora requests an invoice → the
Supervisor approves in the CRM → the buyer gets the invoice in chat. All of it is audited.
