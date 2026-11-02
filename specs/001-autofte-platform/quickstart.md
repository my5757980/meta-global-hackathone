# Quickstart (target for judges)

```bash
git clone <repo> && cd autofte
cp .env.example .env          # put your Baseten key (Muse Spark Open) in BASETEN_API_KEY
npm install
npm run setup                 # migrations + demo data into the embedded Postgres (PGlite), renders auction sheets
npm run dev                   # http://localhost:5173 (web) · API on :8787
```

- Sign in with the **demo buttons** on `/login`: Customer, Agent, Supervisor, Manager, Admin. No passwords are needed.
- Use your own Postgres instead: set `DATABASE_URL=postgres://...`, then `npm run setup`.
- Production build: `npm run build && npm start`. One process serves the API, the MCP server and the built site.
- Tests: `npm test`. Sora evals (live model): `npm run eval`.

## Five-minute tour
1. Open `/` and use the chat button. Ask Sora: "I need a Toyota Hilux under $30,000, shipped to Mombasa".
2. Say "OK, I'll take the second one" and give a company name and phone. As a customer, open Auction, pick a lot and press
   *Ask Sora to read the sheet*.
3. Sign in as **Supervisor**, open CRM → Invoices → the pending request → **Approve**. The buyer's chat gets the
   invoice.
4. Sign in as **Manager**, open the FTE Console to see the activity, audit trail, metrics and eval pass rate.
