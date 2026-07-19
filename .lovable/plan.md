# Wire up the Render worker

Worker URL: `https://smoothrecord.onrender.com`

## Heads-up on the token

You pasted `WORKER_TOKEN` in plain chat, so treat it as compromised. Plan is to save the current value now to unblock testing, then rotate it right after the smoke test — I'll walk you through the 10-second rotation.

Also, Render Free sleeps after 15 min idle and gives 512 MB RAM. Chromium usually needs more, so the first render after a sleep will take ~40–60 s to warm up and long / heavy pages may OOM. If that bites, I'll add a `lite` preset (960×600, 30fps, 15s cap) that auto-engages when `RENDER=true`.

## Steps (build mode)

1. **Save secrets on the Lovable app**
   - `set_secret` → `WORKER_BASE_URL = https://smoothrecord.onrender.com` (known value, no form).
   - `add_secret` → `WORKER_TOKEN` (secure form; I'll pre-fill guidance so you paste `86d9f9cf9d34e7da043a027e316bf86f` — or better, paste a freshly rotated one, see step 4).

2. **Sanity-check the worker is reachable**
   From the sandbox:
   ```
   curl -s https://smoothrecord.onrender.com/healthz
   ```
   Expect `{"ok":true,"jobs":0}`. If it 502s for ~40 s, that's just Render waking the free instance.

3. **End-to-end smoke test through our API**
   - `POST /api/public/record` with `{ input: { type: "url", url: "https://linear.app" }, options: { preset: "editorial", maxDurationSec: 12 } }` → expect `{ jobId, statusUrl }`.
   - Poll `GET /api/public/record/:id` until `status: "succeeded"` → confirm `mp4Url` downloads and plays.
   - If the job fails with OOM/timeout, retry with `{ preset: "editorial", width: 960, height: 600, deviceScaleFactor: 1, fps: 30, maxDurationSec: 10 }` to confirm the worker itself is healthy, then I'll add the auto `lite` preset to `worker/src/record.js` + `server.js` and you redeploy.

4. **Rotate the exposed token**
   - On your machine: `openssl rand -hex 32` → copy the new value.
   - Render dashboard → your service → **Environment** → edit `WORKER_TOKEN` → paste new value → Save (triggers auto-redeploy, ~2 min).
   - Back here I'll run `update_secret` for `WORKER_TOKEN` so you paste the same new value into the Lovable app.
   - Re-run the smoke test to confirm.

5. **Small UX touch**
   - `src/routes/playground.tsx` currently shows a "Worker not configured" hint when the API returns `worker: "not_configured"`. Once the worker is wired, that hint won't fire — no code change needed, but I'll do one live run from the Playground UI to confirm the video player + download button both work.

## Nothing else changes

- No schema, no auth, no new routes. Only two secrets get written, and one verification pass through the existing `/api/public/record` route.
- If the smoke test surfaces the Render RAM limit, I'll add the `lite`/`RENDER=true` auto-switch as a follow-up (single edit to `worker/src/record.js` + `worker/src/server.js`, then you redeploy on Render).

Approve and I'll execute steps 1–3 immediately, then guide you through 4.
