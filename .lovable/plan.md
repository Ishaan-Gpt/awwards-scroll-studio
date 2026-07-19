
# SmoothRecord

A connector for your prompt-library site that turns any website (URL, raw HTML, built-bundle zip, or git repo) into a premium Awwwards-style smooth-scroll `.mp4` — exposed over both **MCP** (for AI clients like Claude/ChatGPT/Cursor) and **public REST** (for your app's fetch calls).

## Architecture

Two pieces, deployed separately:

```text
 ┌────────────────────────────┐          ┌──────────────────────────────┐
 │  Lovable app (this repo)   │          │  Recorder worker (Node+PW)   │
 │  ─ MCP server /mcp         │──HTTPS──▶│  /jobs  POST create job      │
 │  ─ REST /api/public/record │          │  /jobs/:id  GET status       │
 │  ─ Landing + docs + demo   │          │  Playwright + ffmpeg render  │
 │  ─ Jobs table (Cloud DB)   │          │  Uploads mp4 to R2/S3        │
 └────────────────────────────┘          └──────────────────────────────┘
```

The Lovable app never renders video itself (Cloudflare Workers can't run Chromium/ffmpeg). It's the control plane, catalog, and public API. The worker is a small Node service you host (Fly.io / Railway / Render / any VPS — Dockerfile included) that does the actual recording.

## Scope of this plan

I will build:

1. **The Lovable app** — brand, landing, docs, live demo playground, MCP server, REST endpoints, job store.
2. **The recorder worker** — full source in `/worker` (Node + Playwright + ffmpeg + Fastify), Dockerfile, README with one-command deploys for Fly/Railway.
3. **The glue** — signed job dispatch from the Lovable app to the worker, polling + webhook completion, signed download URLs.

## 1. Recorder worker (`/worker` in repo, deployed separately)

Node 20 + Fastify + Playwright (Chromium) + ffmpeg (via `fluent-ffmpeg`) + `@ffmpeg-installer/ffmpeg`.

**Endpoints**
- `POST /jobs` — create job. Body: `{ input, options, callbackUrl, callbackSecret }`.
- `GET /jobs/:id` — status + result URL.
- Auth: shared `WORKER_TOKEN` (Bearer) between app and worker.

**Inputs supported**
- `{ type: "url", url }` — navigate directly.
- `{ type: "html", html }` — write to temp dir, serve via local static server on random port, navigate to it.
- `{ type: "zip", zipUrl }` — download, unzip, detect `index.html`, serve statically, navigate.
- `{ type: "repo", gitUrl, branch?, buildCmd?, outputDir? }` — `git clone` (shallow), auto-detect (`package.json` → run `bun install` + build script → serve `dist`/`out`/`build`), then navigate. Framework auto-detect: Vite, Next static export, CRA, Astro, plain HTML.

Works for SSR/CSR/HTML equally — everything is loaded in a real Chromium, so hydration, streaming, and client routing all just work.

**Awwwards-style scroll engine (the important part)**

Not a linear scroll. A choreographed pass:

1. Load page, wait for `networkidle` + all `<img>`/`<video>` decoded + `document.fonts.ready` + a 600 ms settle.
2. Force any `scroll-behavior: smooth` off and disable `prefers-reduced-motion` so site animations play.
3. Detect "sections": elements matching `section, [data-section], main > *, header, footer` with computed height ≥ 40% viewport. Also detect headings (`h1,h2`) and hero media.
4. Build a keyframe timeline of `scrollY` positions with **variable-duration segments**:
   - Fast glide between neighbouring sections (`~800 px/s`, eased `cubic-bezier(.22,.61,.36,1)`).
   - Short **hold** (600–900 ms) at each section top and at every detected heading/hero image so on-scroll animations complete.
   - Slight **ease-in / ease-out** on each segment (no linear motion — that's what makes it feel premium).
   - Optional **micro-parallax breath** during holds (±6 px sinusoidal) so nothing is frozen.
5. Total duration is derived, not fixed — capped at `maxDurationSec` (default 45).
6. Record via Playwright's built-in `recordVideo` (WebM), then transcode to H.264 MP4 with ffmpeg at the requested fps/resolution, `-crf 18 -preset slow -pix_fmt yuv420p +faststart`. Also emit an optional poster JPG from the first frame.

**Options (defaults = "Medium editorial" preset you picked)**
```ts
{
  preset: "editorial" | "cinematic" | "custom",  // default "editorial"
  width: 1440, height: 900,                       // viewport / video size
  deviceScaleFactor: 2,                           // retina crispness
  fps: 60,
  maxDurationSec: 30,
  scrollSpeedPxPerSec: 800,
  sectionHoldMs: 700,
  headingHoldMs: 400,
  easing: "cubic-bezier(.22,.61,.36,1)",
  waitForSelector?: string,                       // e.g. ".hero-loaded"
  extraWaitMs?: number,
  hideSelectors?: string[],                       // kill cookie banners
  darkMode?: boolean,
  reducedMotion: false,
  loop?: boolean,                                 // ping-pong for hero loops
  format: "mp4",
  audio: false                                    // silent by default
}
```

Presets `cinematic` (slower, longer holds) and `editorial` (default) map to the same option shape.

**Output**: MP4 uploaded to object storage (Cloudflare R2 or S3 — configured via worker env). Job record stores signed URL valid 7 days. Worker POSTs `callbackUrl` on completion.

## 2. Lovable app (this repo)

### Cloud + schema

Enable Lovable Cloud. One migration adds:

- `record_jobs` — `id uuid pk`, `owner_id`, `status` (queued|running|succeeded|failed), `input jsonb`, `options jsonb`, `result_url text`, `poster_url text`, `duration_sec`, `error text`, `created_at`, `updated_at`.
- `api_keys` — `id`, `owner_id`, `key_hash`, `name`, `last_used_at` (for REST auth from external apps).
- `user_roles` + `has_role()` (standard pattern) — used to gate the dashboard.
- RLS: owner-scoped; explicit `GRANT`s per rules.

### Server functions (`src/lib/record.functions.ts`)
- `createRecordJob({ input, options })` — auth required, inserts row, calls worker `POST /jobs`, returns `{ jobId, statusUrl }`.
- `getRecordJob({ id })` — polling for the UI.
- `listMyJobs()` — dashboard.

### Public REST (`src/routes/api/public/…`) — for calling from your other apps
- `POST /api/public/record` — Bearer `sr_...` API key. Body = `{ input, options, callbackUrl? }`. Returns `{ jobId }`.
- `GET /api/public/record/:id` — status + `resultUrl` when done.
- `POST /api/public/record/callback` — HMAC-signed webhook the worker calls on completion (verifies `x-smoothrecord-signature`, updates job row).

Input validation with Zod on every endpoint. No PII returned. Rate-limit note surfaced in docs (not enforced in code — flagged as future work).

### MCP server (`/mcp`) via `@lovable.dev/mcp-js`

OAuth-protected (Supabase OAuth 2.1 issuer) so each caller acts as their own user and jobs are scoped by RLS. Tools:

- `record_url` — `{ url, preset?, options? }`
- `record_html` — `{ html, options? }`
- `record_zip` — `{ zipUrl, options? }`
- `record_repo` — `{ gitUrl, branch?, buildCmd?, outputDir?, options? }`
- `get_job` — `{ jobId }` → status + mp4 URL
- `list_recent_jobs` — last 20 for the caller

Each tool returns a compact JSON payload including `jobId`, `statusUrl`, and (when done) `mp4Url` + `posterUrl`. Handlers stay fast — they dispatch and return; recording happens in the worker. A `wait_for_job` tool is intentionally omitted (MCP timeout risk); callers poll `get_job`.

### UI (the Awwwards-tier front door)

Because you're the judge — the site itself has to earn the pitch. Direction:

- Editorial dark theme (deep near-black `#0B0B0C`, warm off-white `#F4F1EA`, single acid accent `#C6FF3D`). One display serif (Instrument Serif) + one grotesk (Space Grotesk). No purple gradients.
- **Landing** (`/`): oversized wordmark "SmoothRecord", one-line pitch, an inline autoplaying muted `<video>` of a real recording of a well-known Awwwards site as proof, and a single input field ("Paste a URL — see it record"). Runs a demo job for anonymous users (rate-limited via IP).
- **Playground** (`/playground`): the four input methods as tabs (URL / HTML / Zip / Repo), option panel (preset, viewport, fps, holds), live job status, inline video preview, download button.
- **Dashboard** (`/_authenticated/dashboard`): list of jobs, re-run, delete, API keys management, MCP connection instructions with copy-paste snippets for Claude/ChatGPT/Cursor.
- **Docs** (`/docs`): REST reference, MCP reference, options table, deployment guide for the worker (Fly/Railway one-liners).
- **Auth** (`/auth`): Supabase email + Google.

Head metadata + og:image done properly per project rules (real title/description, hero-image og for landing).

## 3. Secrets

Added via `add_secret` after landing/docs exist:
- `WORKER_BASE_URL` (e.g. `https://smoothrecord-worker.fly.dev`)
- `WORKER_TOKEN` (generated — shared bearer)
- `CALLBACK_SIGNING_SECRET` (generated — HMAC for worker→app callbacks)

Worker-side env (documented in worker README, not stored in Lovable): `WORKER_TOKEN`, `CALLBACK_SIGNING_SECRET`, `R2_*` or `S3_*` bucket creds.

## 4. Build order

1. Cloud enable + migrations (`record_jobs`, `api_keys`, `user_roles`) with grants + RLS.
2. Worker source in `/worker` + Dockerfile + README (Fly/Railway deploy commands).
3. Server functions + REST endpoints + HMAC callback.
4. Auth pages + `_authenticated` gate.
5. MCP setup: install `@lovable.dev/mcp-js`, add tools, wire OAuth 2.1 with Supabase, consent route.
6. Landing / Playground / Dashboard / Docs UI.
7. Verify: publish, dispatch a demo `record_url` end-to-end against a deployed worker, check MP4 downloads and MCP tool call from Claude Desktop.

## Technical notes / risks

- Recording browsers can't run in Lovable's Worker runtime — that's why the worker is external. Non-negotiable.
- Sites that block headless Chromium (some Cloudflare-protected pages) may fail; worker sends a realistic UA and stealth patches, but not a promise.
- Repo builds run untrusted user code — worker runs each job in an ephemeral container with no network egress to the internal network and a hard 90s build timeout. Documented as "trusted repos only" in v1.
- Total MP4 size at 60fps/1440p ~30s ≈ 15–30 MB — fine for direct embed.
- Rate-limiting and per-user quotas are v1.1 (called out in docs; not enforced in code).

## Out of scope for v1

- Voiceover / music track (audio flag exists but off by default).
- Multi-page recording (crawl + stitch).
- Mobile viewport preset toggle in UI (available via `options`, not first-class).
- In-app payments / plans.
