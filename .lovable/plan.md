## Goal

A user can only start a recording after two conditions are met:
1. **Signed in**
2. **Has at least one paired worker** (via `npx @ishaan_gpt/smoothrecord-worker pair` or the install script)

On the landing page, anyone trying to submit a URL is bounced to `/auth?next=/app` before the job is ever sent.

## Changes

### 1. Landing page (`src/routes/index.tsx`)
- The hero URL input currently either fakes a demo or hits the public proxy. Change its submit handler:
  - If not signed in (check `supabase.auth.getUser()` on click) → `navigate({ to: "/auth", search: { next: "/app?url=<encoded>" } })`.
  - If signed in → `navigate({ to: "/app", search: { url } })` so the dashboard picks it up.
- Update the CTA copy near the input to hint "Sign in to record" for signed-out visitors (subtle, no full re-auth check on mount — resolve on submit to avoid layout flash).

### 2. Dashboard (`src/routes/_authenticated/app.tsx`)
- On mount, read `?url=` from search params and prefill the "New recording" URL field.
- Add a **worker readiness gate** in the "New recording" tab:
  - Call `listMyWorkers` server fn (already exists in `src/lib/workers.functions.ts`) via `useQuery`.
  - If zero paired workers → replace the submit button with a locked state:
    - Headline: "Pair a worker to start recording"
    - Two options, tabbed: **npx (recommended)** shows `npx @ishaan_gpt/smoothrecord-worker pair`; **Install script** shows the `curl … | bash` / `iwr … | iex` one-liners.
    - Short helper: "Your computer runs the recorder. Nothing is uploaded from us."
    - "I've paired — refresh" button that re-runs the workers query.
  - If ≥1 paired worker → normal submit works; show a small "Recording on: <workerName>" chip.
- Same gate applies to the HTML / Zip / Repo tabs (all routes go through the same worker) — one shared gate at the top of the tab area, not per-tab.

### 3. Server enforcement (defense in depth)
`src/lib/jobs.functions.ts` `startJob` and `src/routes/api/public/v1/record.ts` both call `submitToWorker`. Update `src/lib/worker.server.ts`:
- Today it falls back to the shared env-configured worker when the user has none paired. **Change the fallback**: if the caller has no paired active worker, throw `Error("no_paired_worker")` with a friendly message ("Pair a worker at /app before recording.").
- Dashboard and REST both surface this cleanly. The MCP `record_website` tool already reuses `submitToWorker` so it inherits the same rule.
- Keep the shared env worker only for internal smoke tests — gate it behind an explicit `allowSharedWorker: true` flag used nowhere in user paths.

### 4. Auth route (`src/routes/auth.tsx`)
- Already respects `next` search param — verify it accepts `/app?url=…` (URL-encoded) and passes it through after successful sign-in / sign-up. Small tweak if needed: after `signIn` success, `navigate({ to: next })` with the raw string rather than `{ to: "/app" }`.

## Out of scope
- No changes to the pairing flow, worker binary, or MCP tools beyond the shared `submitToWorker` guard.
- No new tables or migrations.
- No UI redesign — reuse existing dashboard/landing styling.

## Acceptance
- Signed-out visitor pastes a URL on `/` → lands on `/auth`, then on `/app` with the URL prefilled.
- Signed-in user with zero workers on `/app` → sees pairing instructions, submit button hidden.
- Signed-in user with a paired worker → normal recording flow.
- REST `POST /api/public/v1/record` with a valid API key but no paired worker → 400 with `no_paired_worker` message.
