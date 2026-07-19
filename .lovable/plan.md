
# SmoothRecord v0.2 — "Real product" stage

Turning the working prototype into something real users can sign up for, use, integrate, and connect to AI clients (ChatGPT, Claude) via MCP.

## What ships in this stage

1. **Lovable Cloud on** — database + auth + secrets, no external accounts.
2. **Auth** — Email/password + Sign in with Google. `/auth` public route, protected `/app/*` behind `_authenticated`.
3. **Per-user data** — jobs and API keys persisted per account, with RLS.
4. **Dashboard** (`/app`) — recent renders, thumbnails, mp4 downloads, re-run, delete.
5. **API keys** (`/app/keys`) — user-generated `sk_smr_...` keys. REST endpoints accept `Authorization: Bearer sk_smr_...` and attribute usage to that user.
6. **REST API hardening** — `/api/public/v1/record` + `/api/public/v1/record/:id` (versioned), per-key rate limiting, quota, input size caps.
7. **MCP server** (`/api/public/mcp`) — OAuth-authorized via managed Cloud Auth so ChatGPT/Claude/Codex users can connect and call `record_website`, `get_job`, `list_jobs`.
8. **Consent route** `/.lovable/oauth/consent` for the managed OAuth server.
9. **Landing polish** — pricing tier stub (Free / Pro — "coming soon", no Stripe yet), CTA to sign up, updated docs with keys + MCP setup.
10. **Publish** — set final title/description/OG, publish, hand you the live URL.

Payments are intentionally out of scope for this stage — say the word and I add Stripe next.

## Data model

```text
profiles              (id → auth.users, display_name, avatar_url, created_at)
user_roles            (user_id, role: 'admin'|'user')  -- separate table, has_role() SECURITY DEFINER
api_keys              (id, user_id, name, key_prefix, key_hash, last_used_at, created_at, revoked_at)
jobs                  (id, user_id, worker_job_id, status, input jsonb, options jsonb,
                       mp4_url, poster_url, duration_sec, error, created_at, updated_at)
usage_daily           (user_id, day, jobs_started, seconds_rendered)  -- for quota
mcp_oauth_clients     (managed by Cloud Auth — nothing for us to model)
```

RLS: every table scoped by `auth.uid()`. `api_keys.key_hash` is `sha256(key)`; raw key shown once at creation. `jobs.user_id` populated from either the session (dashboard) or the API key owner (REST/MCP).

## Request flow

```text
Dashboard  ──► createServerFn (requireSupabaseAuth) ──► insert job row ──► worker
REST       ──► /api/public/v1/record  (Bearer sk_smr_*) ──► lookup key ──► insert job row ──► worker
MCP        ──► /api/public/mcp (OAuth bearer) ──► tools call record_website ──► insert job row ──► worker
Worker     ──► callback /api/public/v1/worker-callback (HMAC) ──► update job row
```

Polling stays but callback makes the dashboard update instantly.

## Routes

```text
/                              landing (public, polished)
/pricing                       Free / Pro stub (public)
/docs                          updated: keys, REST v1, MCP setup (public)
/auth                          sign in / sign up (public, Google + email)
/.lovable/oauth/consent        managed Cloud Auth consent (public)
/app                           dashboard: recent jobs (protected)
/app/new                       playground moved here (protected)
/app/keys                      API keys manager (protected)
/app/mcp                       "Connect to ChatGPT/Claude" instructions + URL (protected)
/api/public/v1/record          POST — start job (Bearer sk_smr_* OR OAuth)
/api/public/v1/record/:id      GET  — status
/api/public/v1/worker-callback POST — HMAC-verified worker → us
/api/public/mcp                MCP server (OAuth-protected resource)
/.well-known/oauth-protected-resource
```

## MCP tools exposed

- `record_website({ url | html, preset?, options? }) → { jobId, statusUrl }`
- `get_job({ jobId }) → { status, mp4Url?, posterUrl?, error? }`
- `list_jobs({ limit? }) → Job[]`
- `wait_for_job({ jobId, timeoutSec? }) → final job` (long-poll wrapper, ≤60s)

## Rate limits & quotas (defaults — easy to change)

- Free: 5 jobs/day, max 30s render, 720p, 1 concurrent.
- Pro (stub, not billable yet): 200 jobs/day, 60s, 1080p, 3 concurrent.
- Per-IP unauthenticated: 3/hour on `/api/public/v1/record` without a key.

## Steps

1. Enable Lovable Cloud.
2. Migration: tables + RLS + `has_role()` + trigger to create profile row on signup + grants.
3. `configure_social_auth` for Google, enable HIBP password check.
4. Managed OAuth server + consent route (`src/routes/[.]lovable.oauth.consent.tsx`).
5. Server fns: `createApiKey`, `revokeApiKey`, `listApiKeys`, `listMyJobs`, `getMyJob`, `startJob` (dashboard path).
6. REST v1 routes with Bearer-key auth + rate limiting.
7. MCP route using `@ai-sdk/mcp` server style, OAuth-validated bearer.
8. Worker: add `callback_url` + HMAC signature; frontend switches to callback-first, poll as fallback.
9. Rebuild UI: `/auth`, `/app`, `/app/keys`, `/app/new`, `/app/mcp`, refreshed landing + docs, pricing stub.
10. Head metadata + OG on every route.
11. Publish.

## What I need from you (in one go if possible)

- Confirm Cloud + Google sign-in is fine (default choice).
- A short **tagline** for the landing hero (one line, e.g. *"Awwwards-grade scroll videos of any website, in one API call."*). I'll write one if you skip.
- Do you want **profiles** (display name/avatar) — or is email-only fine? Default: yes, minimal profile.
- Anything you want branded differently (logo text, accent color) — otherwise I keep the editorial-dark / acid-green look.

Reply "go" (with any of the above) and I'll build the whole thing straight through.
