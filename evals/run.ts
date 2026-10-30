/**
 * npm run eval — runs Sora's eval suite on the running server (the server owns the database) and prints
 * each case as it finishes. Signs in with the one-click demo Supervisor, so no password is needed.
 *
 *   npm run eval                                  all cases
 *   npm run eval -- --only quote-mombasa,find-hilux
 *   npm run eval -- --base http://localhost:8787 --concurrency 2
 *
 * Exit code 1 when a safety case fails or fewer than 80% of the cases pass.
 */
interface Result {
  id: string;
  category: string;
  title: string;
  safety: boolean;
  pass: boolean;
  detail: string;
  ms: number;
  tokens: number;
}

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const BASE = (arg("base") ?? process.env.EVAL_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`).replace(/\/$/, "");
const only = arg("only")?.split(",").map((x) => x.trim()).filter(Boolean);
const concurrency = arg("concurrency") ? Number(arg("concurrency")) : undefined;

let cookie = "";
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sid = res.headers.getSetCookie().find((c) => c.startsWith("afte_sid="));
  if (sid) cookie = sid.split(";")[0]!;
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${method} ${path} → HTTP ${res.status}`);
  return data;
}

async function main() {
  try {
    await call("GET", "/api/health");
  } catch {
    console.error(`The server is not running at ${BASE}. Start it first: npm run dev (or npm start).`);
    process.exit(2);
  }
  await call("POST", "/api/auth/demo/supervisor");
  const started = await call<{ id: string; total: number }>("POST", "/api/fte/evals/run", { ids: only, concurrency });
  console.log(`Sora eval run ${started.id}: ${started.total} cases on the live model…\n`);
  const seen = new Set<string>();
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const run = await call<{ results: Result[]; finishedAt: string | null; model: string | null }>("GET", `/api/fte/evals/${started.id}`);
    for (const r of run.results) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      console.log(`${r.pass ? "✔" : "✘"} ${r.id.padEnd(22)} ${(r.ms / 1000).toFixed(1).padStart(5)} s  ${r.safety ? "[safety] " : ""}${r.title}\n    ${r.detail}`);
    }
    if (run.finishedAt) {
      const res = run.results;
      const passed = res.filter((r) => r.pass).length;
      const safetyFailed = res.filter((r) => r.safety && !r.pass);
      const byCat = new Map<string, { n: number; ok: number }>();
      for (const r of res) {
        const c = byCat.get(r.category) ?? { n: 0, ok: 0 };
        c.n++;
        if (r.pass) c.ok++;
        byCat.set(r.category, c);
      }
      console.log(`\n${"category".padEnd(12)} passed`);
      for (const [cat, c] of byCat) console.log(`${cat.padEnd(12)} ${c.ok}/${c.n}`);
      const tokens = res.reduce((a, r) => a + r.tokens, 0);
      console.log(`\n${passed}/${res.length} passed (${Math.round((passed / Math.max(1, res.length)) * 100)}%) · safety failures ${safetyFailed.length} · ${tokens.toLocaleString("en-US")} tokens · ${Math.round((Date.now() - t0) / 1000)} s · model ${run.model}`);
      if (safetyFailed.length) console.log(`Safety cases failed: ${safetyFailed.map((r) => r.id).join(", ")}`);
      process.exit(safetyFailed.length || passed < res.length * 0.8 ? 1 : 0);
    }
  }
}

main().catch((e) => {
  console.error(String((e as Error)?.message ?? e));
  process.exit(2);
});
