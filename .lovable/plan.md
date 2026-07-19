# SmoothRecord → production-ready + user-hosted workers

Two parallel tracks. Track A makes the current shared worker safe for real users. Track B lets a non-technical user run their own worker in one paste-into-terminal step — no Git, no Docker, no cloning.

---

## Track A — Production hardening

Things that MUST exist before real users touch it.

1. **Rate limits + quotas**
   - Free tier: N recordings/day/user, M concurrent jobs. Enforced in `startJob` + `record_website` (MCP) + REST `/v1/record` via the existing `usage_daily` table.
   - Per-API-key rate limit (token bucket in Postgres) to stop abuse.
   - 429 with `Retry-After`.

2. **Job lifecycle guarantees**
   - Server-side timeout: any job stuck in `queued`/`running` >5 min → mark `failed`.
   - Background reconcile: cron route `/api/public/cron/reconcile-jobs` that polls the worker for all non-terminal jobs (fixes missed status updates + orphaned jobs).
   - Retry button in dashboard.

3. **Storage & delivery**
   - Right now MP4s live on the worker's disk behind a Cloudflare tunnel. Move finished MP4 + poster to Supabase Storage (`recordings` bucket, per-user folders, signed URLs). The worker uploads on success; the app returns signed URLs. This makes the worker stateless and the video URLs stable/CDN-served.

4. **Observability**
   - `error` column already exists; surface last error in dashboard.
   - Simple `events` table: `job.started / job.succeeded / job.failed / worker.unreachable` for the user's own log view.
   - Health widget on dashboard: green/red based on last `/healthz` from their bound worker.

5. **Security polish**
   - CORS on `/api/public/v1/*` (allow all, but no cookies).
   - Zod-validate every REST input (already done — just double-check `record.$id`).
   - Never echo the API key back after creation (already the case; add a "you won't see this again" modal).
   - Signed URLs on delivered MP4s, 24h expiry.

6. **UX for real users**
   - Landing → "See it in action" MP4 recorded by SmoothRecord itself.
   - Pricing page (even if "free during beta").
   - `/dashboard` shows: today's usage / plan cap / worker health.
   - Empty states + error toasts everywhere.
   - Email on job success (Lovable Cloud emails).

7. **Legal / trust**
   - `/terms`, `/privacy` stubs.
   - Robots on auth routes.
   - Support email in footer.

---

## Track B — "Bring Your Own Worker" for non-tech users

Goal: someone who has never touched a terminal can bind a worker to their SmoothRecord account with **one copy-paste command** and a browser confirm click. No Git, no Docker, no ports, no tunnel URL to paste.

### The user flow

1. In `/app` → **Workers** tab, click **"Run a worker on this computer"**.
2. Modal shows their OS auto-detected and ONE command:
   ```
   curl -fsSL https://smoothrecord.lovable.app/install.sh | sh
   ```
   (Windows: a PowerShell one-liner.)
3. That script:
   - Downloads a prebuilt, signed binary of the worker (Node + Playwright + ffmpeg bundled via `pkg` or a Bun single-file exec) for their OS/arch into `~/.smoothrecord/`.
   - Downloads a prebuilt `cloudflared` binary next to it.
   - Prints a **pairing code** and a URL: `https://smoothrecord.lovable.app/pair?code=ABC-123`.
   - Starts the worker on `127.0.0.1:{random port}` + starts a `cloudflared quick tunnel` and waits.
4. User clicks the URL → already signed into SmoothRecord → sees **"Pair worker ABC-123 to your account?"** → clicks Confirm.
5. Server binds `{user_id → worker_tunnel_url, worker_token}` in a new `workers` table. Worker script polls `/api/public/v1/pair/ABC-123`, receives the token + confirmation, writes them to `~/.smoothrecord/config.json`, and stays running.
6. Dashboard flips to **"Your worker is online ✓"**. All future recordings for that user route to `workerBaseUrl` from their `workers` row instead of the shared env `WORKER_BASE_URL`.

### Why this is safe

- The pairing token is one-time and expires in 10 min.
- The worker's bearer token is generated on the user's machine, never leaves it except through the pairing exchange.
- We store the tunnel URL + token in the `workers` table with RLS `user_id = auth.uid()`. Server code uses `supabaseAdmin` to read it when submitting a job.
- If the tunnel URL changes on restart, the script re-pairs automatically (persists the account binding, not the URL).

### What we build for this

**On the app:**
- New DB tables: `workers` (id, user_id, name, worker_url, worker_token_encrypted, last_seen_at, status), `worker_pairings` (code, user_id NULL, expires_at, claimed_at).
- New server functions: `startPairing`, `confirmPairing`, `listMyWorkers`, `deleteWorker`.
- New public REST endpoints (no auth, code is the secret): `POST /api/public/v1/pair/start`, `POST /api/public/v1/pair/:code/claim`, `GET /api/public/v1/pair/:code`.
- New page: `/app` → **Workers** tab with the install command, status, revoke.
- New page: `/pair?code=…` (authenticated) — confirms + calls `confirmPairing`.
- Router change: `submitToWorker()` looks up the caller's `workers` row first; falls back to shared worker only for admins/demo.

**Distributed to the user:**
- `install.sh` (mac/linux) + `install.ps1` (windows) hosted at `/install.sh` — TanStack public routes we already have infra for.
- Prebuilt worker binaries hosted on GitHub Releases (we build them once via GitHub Actions — no Git for the *user*, we still use our own repo).
- Bundled `cloudflared` from Cloudflare's official releases.
- A tiny supervisor script (`smoothrecord start`, `smoothrecord stop`, `smoothrecord status`) so the user can turn it off later without knowing what a process is.

### Fallback for users who can't/won't install anything

Keep the shared worker (yours, local + tunnel) as a **"Demo mode — 30s max, 3 recordings/day"** so people can try before installing. Real usage requires their own worker (which is also good for your bandwidth bill).

---

## Suggested order

1. **DB migration**: `workers`, `worker_pairings`, quotas on `usage_daily`.
2. Pairing REST + server fns + `/pair` page + Workers tab.
3. Route jobs to per-user worker.
4. Supabase Storage for MP4 delivery.
5. `install.sh` + supervisor script + one prebuilt macOS binary (add Linux/Windows once mac works).
6. Rate limits + timeouts + reconcile cron.
7. Polish: emails, pricing, terms, landing demo video.

---

## Open questions (need your call before I start)

1. **Demo mode on/off?** Keep the shared local worker as a limited try-before-install, or remove it entirely and force BYO from day one?
2. **Binary distribution**: OK to host prebuilt worker binaries on **GitHub Releases** under your account? (Free, fast, standard. Users never see GitHub — the install script just curls the release asset.) Alternative: host them in Supabase Storage.
3. **Which OS first?** macOS + Linux together is easiest (bash script, same binary format story). Windows adds a PowerShell script — do it now or in a follow-up?
4. **Scope for this next batch**: do you want me to ship **all of Track A + B**, or start with **just Track B (BYO worker end-to-end)** since that's the blocker for real users, then do hardening after?

Answer those four and I'll start building.
