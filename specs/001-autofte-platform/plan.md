# Implementation Plan: AutoFTE — an auto-export platform run by a Digital FTE

**Branch**: `001-autofte-platform` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-autofte-platform/spec.md`

## Summary

AutoFTE is one TypeScript platform: website + customer portal + CRM + auction portal + live chat + admin + FTE
Console, with an Expo app. Sora, the Digital FTE, does the sales agent's job on Meta's **Muse Spark Open** (Baseten,
OpenAI-compatible: tool calling, vision and audio were verified live on 30 Oct). Sora acts only through scoped tools
served by the platform's own **MCP server**. It loads its know-how from **Skills** (`SKILL.md`) and writes an
**audit row per action**. It asks a human for **approval** before committing money or the company.

The data lives in **Postgres via Drizzle**, embedded **PGlite** by default so a judge needs no database install.
An event loop (the "nervous system") lets Sora work proactively.

Build order follows the spec priorities: the P1 vertical slice first (website → chat → Sora → CRM approval →
customer portal), then the auction, chat depth, proactive work and console, then the app, website admin and
breadth.

## Technical Context

**Language/Version**: TypeScript (Node 24 LTS runtime on the dev laptop; Node ≥ 20 supported), ES2023 target.

**Primary Dependencies**:
- **Server**: Express 5, zod 4, `openai` SDK (pointed at Baseten/Fireworks), `@modelcontextprotocol/sdk` (MCP server +
  client, streamable HTTP), drizzle-orm with `@electric-sql/pglite` and `pg`, bcryptjs, cookie-parser, exceljs,
  pdfkit, archiver, `@resvg/resvg-js` (renders our generated auction sheets to PNG), tsx (dev runner).
- **Web**: React 19, Vite, Tailwind CSS v4, React Router, TanStack Query, lucide-react.
- **Mobile**: Expo (React Native).

**Storage**: PostgreSQL. PGlite (in-process, data dir `.data/pglite`) by default; any Postgres via `DATABASE_URL`.
Files (photos, documents, receipts, chat media, generated sheets) live under `.data/files` and are served only
through access-checked routes.

**Testing**: vitest for unit + integration (services run on a throwaway PGlite in memory), the eval runner for
Sora (live model), and Playwright scripts for the responsive and e2e checks.

**Target Platform**: any OS with Node ≥ 20 (judges); a modern browser; Android 8+ for the app.

**Project Type**: web (server + web SPA) + mobile, npm workspaces in one repo.

**Performance Goals**:
- Sora's first reply: p50 ≤ 15 s, p90 ≤ 30 s. The live test measured 1–3 s per model call at `low`/`medium` effort.
- Page API calls: < 300 ms for typical lists on demo data.
- Chat delivery: ~2 s.

**Constraints**:
- **Laptop**: 4 GB RAM. Dev runs one Node process + Vite; no Docker in the dev loop.
- **Meta-only runtime models**: nothing else runs at runtime.
- **Keys**: only in `.env`.
- **Data**: no real data.

**Scale/Scope (demo data)**:
- ~120 stock vehicles, ~3,000 auction lots over 12 sale days and 12 halls, ~20,000 past results
- ~400 leads, ~60 invoices, ~25 customers, 8 staff + Sora
- ~70 screens

## Constitution Check

| Principle | How the plan meets it | Status |
|---|---|---|
| I Spec-driven | spec → this plan → tasks.md → implement. PHRs in `history/prompts/` | PASS |
| II FTE is the product | Skills folder, MCP-scoped tools (no SQL tool), audit row in the same transaction, approvals for commitments, escalation | PASS |
| III Meta-only runtime | Only Muse Spark Open (Baseten primary, Fireworks fallback). Voice = audio input to Muse. TTS = browser `speechSynthesis`. No embeddings model: search is SQL/full-text + Muse reasoning | PASS |
| IV Integrity | New repo, new code. Generated demo data. Own generated sheets/illustrations. Licensed photos credited. No names or logos of real companies | PASS |
| V Fidelity | Feature lists taken from the company's real flow (spec US3–US9) | PASS |
| VI Responsive | Mobile-first Tailwind. Responsive check script at 7 widths before closing UI tasks | PASS |
| VII Verifiable | vitest on money/permission/approval paths. Eval suite ≥ 30 cases with stored runs | PASS |
| VIII Judge-runnable | `npm install && npm run setup && npm run dev`, embedded DB, demo sign-in buttons, `.env.example` | PASS |

## Research decisions (see research.md for detail)

- **R1 Model**:
  - Muse Spark Open via Baseten `meta-models/muse-spark-open-1026` is the primary; Fireworks is the fallback.
  - Use `reasoning_effort` `low` for chat turns and `medium` for sheet reading and quotes.
  - Retry once, then fall back to the other provider, then put the thread in the human queue.
- **R2 Tool calling**: OpenAI-style `tools`/`tool_calls` work on Muse Spark Open (verified 30 Oct: correct args, 1–3 s per
  call).
- **R3 Audio**:
  - Muse accepts `audio_url` (WAV/MP3/FLAC/OGG/M4A, ≤ 5 min, ≤ 25 MB), including base64 `data:` URLs.
  - The browser records PCM through an AudioWorklet and encodes 16 kHz mono WAV. This avoids webm, which is not
    supported.
- **R4 Vision**: images go as `image_url` (base64 data URL from our file store; Baseten rejects localhost URLs).
- **R5 MCP**:
  - The tool registry is defined once (zod) and served by an MCP server at `/mcp` (streamable HTTP, bearer token).
  - The agent uses an MCP client over HTTP to the same process. External MCP clients can use an admin-issued
    token.
- **R6 DB**: Drizzle pg-core schema, with one migration set for both PGlite and node-postgres. Migrations run on boot.
  Demo seed runs when the DB is empty, and also on "Reset demo data".
- **R7 Realtime**: Server-Sent Events per signed-in session (`/api/stream`). Writes go over plain POSTs. WebRTC call
  signalling goes over SSE + POST, with STUN by default and TURN optional (`TURN_URL/USER/PASS`).
- **R8 Auth**:
  - An httpOnly signed session cookie backed by a sessions table, and bcrypt for passwords.
  - Roles + permissions are tables, enforced by `requirePerm()` on every route.
  - Demo sign-in is offered when `DEMO_MODE=true`.
- **R9 Pricing**: `pricing.ts` is a pure function, unit-tested to the cent. Its inputs are the vehicle cost basis, FX,
  margin %, inspection (by country), freight (port $/m³ × vehicle m³ or flat RoRo), insurance %, and a discount
  inside the envelope.
- **R10 Auction sheets**: our own SVG template filled from lot data (grade, interior grade, mileage, damage codes on a
  car diagram, notes), rendered once to PNG with resvg and cached. Sora reads the PNG with vision.
- **R11 Photos**: stage 1 uses our own SVG illustrations per body type and colour. Stage 2 (if time) adds curated
  CC-licensed photos of common export models, credited on `/credits` and in the README.
- **R12 Proactive work**:
  - The `events` table is the outbox.
  - A scheduler ticks every 15 s (on a demo clock that an Admin can advance) and dispatches events to Sora's
    handlers.
  - Handlers respect the envelope (per-buyer daily cap, working hours).

## Architecture

```
Browser (website · portal · CRM · auction · chat desk · admin · FTE console)      Expo app (website + chat)
          │  REST /api/*   SSE /api/stream   WebRTC (peer to peer, signalling via API)       │ same REST/SSE
          ▼                                                                                   ▼
┌──────────────────────────── apps/server (one Node process) ─────────────────────────────────────┐
│ Express routes ─ auth/roles ─ services (leads, invoices, payments, units, pricing, auction,      │
│ chat, website, reports, files)  ─ notifications/SSE hub ─ scheduler (events → Sora)             │
│                                                                                                  │
│  Sora runtime: agent loop ──MCP client──► /mcp MCP server ──► tool registry ──► services         │
│      │   ▲ skills/*.md (load_skill)            (bearer token, zod-validated, envelope-checked,   │
│      ▼   │                                       audit row in the same transaction)             │
│  model.ts → Baseten Muse Spark Open (fallback Fireworks)                                         │
└───────────────────────────────┬──────────────────────────────────────────────────────────────────┘
                                ▼
            Postgres (PGlite embedded by default │ DATABASE_URL) + .data/files
```

### Sora's loop (per trigger)
1. **Trigger**: a buyer message in a thread whose holder is Sora, or a scheduled event (follow-up, payment,
   progress, new match), or an approval decision.
2. **Context**:
   - the system prompt: persona, hard rules, envelope summary, skill index (name + description)
   - the thread's running summary plus the last 20 messages
   - the trigger payload
3. **Loop** (≤ 8 steps):
   - call the model with the MCP tool list
   - for each `tool_call`, call MCP `tools/call`, append the result, repeat
   - on the final text, post it as Sora's message
4. **Persist**: an `fte_runs` row (trigger, steps, tokens, latency, status, reasoning excerpt). Each tool call has
   already written its own `fte_actions` audit row inside the service transaction.
5. **Failure**: retry → fallback provider → hand the thread to the human queue with a note.

### Tool registry (MCP), all scoped to the acting principal (Sora) and audited
- **Reading**:
  - `search_stock`, `get_vehicle`
  - `search_auction_lots`, `get_auction_lot`, `read_auction_sheet` (vision, cached per lot)
  - `get_price_history` (statistics)
  - `list_ports`
  - `get_customer_record`
- **Selling**:
  - `quote_cnf` (pure pricing; the quote is stored with an id)
  - `find_or_create_lead`, `add_lead_note`
  - `request_invoice` (from quote ids)
  - `place_bid`: inside the envelope it runs; beyond it, an approval is created
  - `apply_discount`: inside the envelope it applies; beyond it, an approval is created
- **Conversation and follow-up**: `request_approval`, `handover_to_human`, `save_buyer_request` (saved search),
  `schedule_follow_up`, `send_customer_update`.
- **Know-how**: `load_skill`.

### Envelope (Supervisor-editable, stored in `fte_envelope`)
- **Discounts and bids**: max discount % (default 3) and max bid per lot in JPY (default ¥1,500,000).
- **Messaging limits**: proactive messages per buyer per day (default 2), and working hours for proactive messages
  in the buyer's time zone (default 09–20).
- **Always-escalate topics**: complaint, refund, legal, payment dispute.
- **Approval required**: the invoice request always goes to the Supervisor, as in the company's real rule.

## Project Structure

### Documentation (this feature)
```
specs/001-autofte-platform/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md
├── contracts/api.md     # REST + MCP tool contracts
└── tasks.md             # /sp.tasks output
```

### Source Code (repository root)
```
package.json                 # npm workspaces: apps/*, packages/*
.env.example  README.md  LICENSE (MIT)
apps/
  server/
    src/index.ts             # boot: env, db+migrate, seed-if-empty, express, mcp, scheduler
    src/env.ts  src/db/{schema/*.ts, client.ts, migrate.ts}  drizzle/ (SQL migrations)
    src/auth/                # sessions, demo sign-in, permissions middleware
    src/services/            # pricing, leads, invoices, payments, units, reports, excel, pdf, zip,
                             # website, auction, chat, calls, notifications, files, audit, sse
    src/routes/              # public, account, crm, auction, chat, admin, fte, files, stream
    src/fte/                 # agent.ts model.ts mcp-server.ts mcp-client.ts tools/*.ts skills.ts
                             # envelope.ts scheduler.ts sheets.ts prompts.ts
    src/seed/                # demo data generator (deterministic, seeded RNG)
    test/                    # vitest: pricing, invoice workflow, permissions, approvals, audit
  web/
    src/main.tsx router.tsx  src/lib/{api,auth,sse,format}.ts  src/ui/*   # design system
    src/site/  src/account/  src/crm/  src/auction/  src/chat/  src/admin/  src/fte/
  mobile/                    # Expo app (US8)
packages/
  shared/                    # zod schemas, enums, types shared by server/web/mobile
skills/                      # Sora's SKILL.md folders
evals/                       # cases/*.json + run.ts → results stored in DB + evals/results/*.json
scripts/                     # responsive-check.ts, secret-scan.ts, render-sheets.ts
```

**Structure Decision**: one server process (light on RAM; one port) serving the API, `/mcp`, SSE and, in
production, the built SPA. One SPA with route areas (`/`, `/account`, `/crm`, `/auction`, `/chat`, `/admin`, `/fte`).
A shared package keeps zod contracts identical on server, web and app.

## Delivery phases (time-boxed; deadline Thu 5 Nov 07:00 PKT)

| Day | Phase | Exit check (working demo) |
|---|---|---|
| Fri 30 Oct | Setup, DB, auth/demo sign-in, design system, website shop + vehicle page, chat widget, Sora loop + core tools, CRM invoice approval | buyer → Sora → invoice request → Supervisor approves → buyer messaged |
| Sat 31 Oct | CRM complete (leads, invoices multi-vehicle, payments, units, docs, costing, reports, users, notifications, staff chat), customer portal | full CRM chain + My Invoices |
| Sun 1 Nov | Auction portal + admin + RBAC, sheets + `read_auction_sheet`, bids/envelope | Sora reads a sheet and bids within the envelope |
| Mon 2 Nov | Chat depth (media, voice → Sora, groups, calls, desk, take-over), scheduler events, FTE Console, evals ≥ 30 | proactive follow-up + eval pass rate shown |
| Tue 3 Nov | Website full sections + admin CMS, responsive sweep, Expo app, README + clean-clone setup test, optional hosting | judge setup ≤ 5 commands |
| Wed 4 Nov | APK, polish, video, submission, X post | submitted before 21:00 ET |

## Risks
1. **Scope vs time**. Mitigation: the strict P1→P3 order. Each day ends demoable. Breadth is cut before depth of the
   P1 loop.
2. **Model latency or availability on demo day**. Mitigation:
   - `low` effort for chat
   - the fallback provider
   - a recorded video as the primary artefact
   - the eval run stored for reference
3. **4 GB laptop**. Mitigation: one Node process + Vite, PGlite, no Docker or Gradle until the app phase. The APK is
   built last, with the low-memory settings.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| MCP server in-process + MCP client | Book-standard Worker architecture; scoped tools reusable by external agents; judges score tooling depth | Direct function calls hide the trust boundary and lose the "connector" story |
| PGlite + pg dual driver | Zero-install for judges and real Postgres for hosting | SQLite would break the "Postgres system of record" design and differ from production |
