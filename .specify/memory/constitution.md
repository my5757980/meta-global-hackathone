<!--
Sync Impact Report
- Version: 0.0.0 (template) → 1.0.0 (first ratification)
- Principles added: I–VIII (all new)
- Sections added: Technology Stack & Constraints, Development Workflow & Quality Gates, Governance
- Templates: plan/spec/tasks templates unchanged (generic); no follow-up TODOs
-->

# AutoFTE Constitution

AutoFTE is a complete operating platform for a used-car export company (public website, CRM, auction portal,
live chat, mobile app) whose daily sales work is done by a **Digital FTE**: an AI employee built on Meta's
open-weight model, supervised by humans. It is built for the Meta Global AI Developer Hackathon (deadline
Wed 4 Nov 2026, 9:00 PM ET = Thu 5 Nov 07:00 PKT).

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)
Every feature goes constitution → spec → plan → tasks → implement. Code is written only against an approved
task. A Prompt History Record is written for every owner prompt under `history/prompts/`. When the context
fills up, work resumes from the PHR trail and the specs, never from scratch.

### II. The Digital FTE Is the Product
The AI employee is the centre of the system, not a chatbot bolted on. It follows the Agent Factory method:
- **Skills**: each capability is a `SKILL.md` folder loaded on demand.
- **System of record**: the platform's Postgres database is the single source of truth. The FTE never invents
  stock, prices or statuses.
- **Scoped tools over MCP**: every business read/write goes through named tools with typed inputs.
  There is no free-form SQL tool.
- **Audit**: every meaningful FTE action writes an audit row in the same transaction as the action.
- **Authority envelope**: anything that commits money or the company (invoice, discount beyond policy, bid,
  refund) pauses for a named human's approval.
- **Escalation at the edges**: unusual, angry or out-of-policy cases go to a human with a written summary.

### III. Meta Models Only at Runtime
Every AI model the product calls at runtime is a Meta model: Muse Spark Open on Baseten (primary) or on
Fireworks (fallback). No non-Meta model may run inside the product (LLM, vision, speech-to-text or
embeddings). Browser speech synthesis is allowed for spoken output because it is not a model call. The UI and
README say "Built with Muse Spark Open". Coding tools are free to choose. Meta Model API and Muse Code are not
used (unavailable in Pakistan).

### IV. Hackathon Integrity
- **Fresh work only**: the repository holds only work written during the event (from 26 Oct 2026).
- **No copied code**: no code, history, logos, data or purchased templates are copied from the company's
  existing systems.
- **Demo data only**: all data is generated demo data. No real customers, no real auction-supplier data, no
  supplier names.
- **Clear rights**: every image or asset is our own or carries a licence that allows this use.
- **Honest demo**: the demo shows only what was built here. The video opens with one line on what existed
  before: "the business flow, run by hand".

### V. Real-Business Fidelity
The flows mirror a working Japanese used-car export business: lead → invoice → payment → unit → documents →
shipping, plus live auctions, bids, past prices, live chat with calls, and a customer app. A feature is
"done" only when its real-world rule is kept, for example: an agent requests an invoice, a supervisor
approves it.

### VI. Professional, Responsive UI
Every screen works from 320 px to 2560 px with no sideways scroll, no clipped text and no overlaps. On phones,
tap targets are at least 28 px. The design is clean, consistent and branded with the demo brand only.

### VII. Verifiable Behaviour
- **FTE evals**: the FTE has an eval suite (inputs with expected tool calls and outcomes) that runs with one
  command and reports a pass rate.
- **Tests**: money, permission and approval paths have automated tests.
- **No unproven claims**: nothing is called done without being run. Failures are reported as failures.

### VIII. Judge-Runnable and Secure
- **One setup**: judges run the full demo from the README in a few commands. Postgres is embedded (PGlite) by
  default, and a real Postgres is available via `DATABASE_URL` or docker compose.
- **Keys**: keys live only in `.env` (git-ignored). `.env.example` documents them.
- **Demo sign-in**: one-click demo role sign-in, with no credentials in the repo, README or video.
- **Server-side checks**: passwords are hashed and roles are checked on the server for every action.

## Technology Stack & Constraints
- **Language**: TypeScript end to end, managed as npm workspaces in one public repo.
- **Web**: React 19, Vite, Tailwind CSS v4 and React Router. One app with five areas: Website, Customer
  Portal, CRM, Auction, Chat Desk. It also has the FTE Console and Admin.
- **API**: Node.js with Express and Zod validation. Live updates use Server-Sent Events. The MCP server
  (`@modelcontextprotocol/sdk`, streamable HTTP) exposes the FTE's business tools.
- **Database**: PostgreSQL through Drizzle ORM; PGlite by default, node-postgres when `DATABASE_URL` is set.
- **AI**: an OpenAI-compatible client pointed at Baseten `meta-models/muse-spark-open-1026` (text, vision,
  audio input, tool calling), with the reasoning effort chosen per task.
- **Mobile**: Expo React Native app covering the website frontend and chat. It has no CRM and no auction.
- **Hardware limit**: the dev laptop has 4 GB RAM, so the stack must stay light. No heavy build steps are
  allowed in the dev loop.

## Development Workflow & Quality Gates
- **Priority order**: the FTE end-to-end slice first (website → chat → FTE → CRM approval). Then the auction,
  then the app, then breadth. Every day ends with a working demo.
- **Small steps**: each task is small, testable and committed on its own.
- **Gates before a commit**:
  - type-check passes
  - the related tests and evals pass
  - no secret is staged (secret scan)
- **Mandatory checks**: a responsive check runs at the standard widths before any UI task is closed.
- **Releases**: the public GitHub repo carries an MIT licence, a README with setup and architecture, and a
  "what was built during the event" section.

## Governance
This constitution overrides other practices for this repository. An amendment needs the owner's approval, a
version bump (semantic) and a note in the Sync Impact Report. Every plan has a "Constitution Check" against
principles I–VIII. Any added complexity must be justified in the plan.

**Version**: 1.0.0 | **Ratified**: 2026-10-30 | **Last Amended**: 2026-10-30
