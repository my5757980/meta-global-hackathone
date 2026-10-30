# Research — AutoFTE (30 Oct 2026)

## R1–R4 Muse Spark Open on Baseten (verified live)
- **Endpoint**: `https://inference.baseten.co/v1`, model `meta-models/muse-spark-open-1026`. The hackathon id is
  `-1026`, not the docs' plain slug.
- **Tool calling**: OpenAI `tools` + `tool_choice:auto`. The model returned
  `search_stock{"make":"Toyota","model":"Hilux","max_price_usd":14000}` with `finish_reason=tool_calls`. Turn 2 used
  the tool result correctly. Latency per call was 3.2 s / 1.1 s at `low` and 1.3 s / 2.0 s at `medium`.
  ~700 prompt tokens with one tool.
- **Reasoning**: the model always reasons. `reasoning_effort` low|medium|high|xhigh (default xhigh: too slow for
  chat). Reasoning text is returned in `reasoning_content`.
- **Audio**:
  - Send it as content part `{type:"audio_url", audio_url:{url}}` in WAV/MP3/FLAC/OGG/M4A, 8–48 kHz.
  - Limits: ≤ 4 files, 25 MB and 5 min each; 100 MiB request body.
  - `data:` URLs are accepted. Localhost/internal URLs are rejected, so local files go as base64.
  - Chrome's MediaRecorder default (webm/opus) is not in the list. Decision: record PCM in the browser and encode WAV
    (16 kHz mono ≈ 32 KB/s).
- **Vision**: `image_url` with a base64 data URL (same rule: no localhost URLs).

## R5 MCP
`@modelcontextprotocol/sdk` (1.32): `McpServer` + `StreamableHTTPServerTransport` mounted in Express at `/mcp`, and
`Client` + `StreamableHTTPClientTransport` for Sora. Tool input schemas are zod and shared with the services.
Authentication is `Authorization: Bearer <token>`, hashed in `mcp_tokens`. Sora's token is generated at boot and kept
in memory only.

## R6 Database
drizzle-orm 0.45 supports `drizzle-orm/pglite` and `drizzle-orm/node-postgres` with one pg-core schema. drizzle-kit
generates SQL migrations; the drizzle migrator runs on boot for either driver. PGlite 0.5 runs on Windows and Linux
without native builds.

## R7–R12
See plan.md (realtime via SSE, cookie sessions + bcrypt, pure pricing function, generated auction sheets via resvg,
SVG illustrations first then credited CC photos, outbox + scheduler for proactive work).

## Hackathon rules that shape the design (30 Oct re-scan)
- **Coding tools**: any are allowed; Muse Code is optional.
- **Runtime models**: every model the project calls at runtime must be a Meta model. Browser speechSynthesis is OK.
- **Repo**: a fresh public repo with only event work, and the video opens with what pre-existed.
- **Judging**: judges must run the full demo from the repo's setup instructions (`.env.example`, no keys). A hosted
  version is optional. A login-gated app needs a no-credential demo path.
