# Quickstart (target for judges)

```bash
git clone <repo> && cd autofte
cp .env.example .env          # put your Baseten key (Muse Spark Open) in BASETEN_API_KEY
npm install
npm run setup                 # migrations + demo data into the embedded Postgres (PGlite), renders auction sheets
npm run dev                   # http://localhost:5173 (web) · API on :8787
```

- Sign in with the **demo buttons** on `/login`: Customer, Agent, Supervisor, Manager, Admin. No passwords are needed.
- Use a real Postgres instead: set `DATABASE_URL=postgres://...` (or `docker compose up -d db`), then
  `npm run setup`.
- Production build: `npm run build && npm start`. One process serves the API, the MCP server and the built site.
- Tests: `npm test`. Sora evals (live model): `npm run eval`.

## Five-minute tour
1. Open `/` and use the chat button. Ask Sora: "I need a Toyota Hilux under $14,000 to Mombasa".
2. Ask "Is lot 1234 good?" (auction sheet reading), then "What is the price to Mombasa?", then "Ok, I'll take it".
3. Sign in as **Supervisor**, open CRM → Invoices → the pending request → **Approve**. The buyer's chat gets the
   invoice.
4. Sign in as **Manager**, open the FTE Console to see the activity, audit trail, metrics and eval pass rate.
