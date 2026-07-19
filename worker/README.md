# SmoothRecord Worker

Node + Fastify + Playwright + ffmpeg. Records any website as a premium
Awwwards-style smooth-scroll `.mp4`.

## Deploy

### Fly.io
```bash
cd worker
fly launch --no-deploy      # accept defaults, no db
fly secrets set WORKER_TOKEN=$(openssl rand -hex 32)
fly deploy
```

### Railway / Render / any Docker host
```bash
docker build -t smoothrecord-worker .
docker run -p 8080:8080 \
  -e WORKER_TOKEN=<same-as-lovable-app> \
  -e PUBLIC_BASE_URL=https://your-worker.example.com \
  smoothrecord-worker
```

Then on the Lovable app, set:
- `WORKER_BASE_URL` → `https://your-worker.example.com`
- `WORKER_TOKEN` → same value as above

## Env

| var | required | what |
| --- | --- | --- |
| `WORKER_TOKEN` | ✅ | Bearer token shared with the caller |
| `PORT` | | default `8080` |
| `PUBLIC_BASE_URL` | | prefix used when returning `mp4Url` (defaults to the request host) |
| `JOB_TTL_MS` | | default `86_400_000` (24h) — how long finished jobs are kept |

Storage is local (`/tmp/smoothrecord/jobs/<id>/out.mp4`). Swap in R2/S3 upload
in `src/storage.js` if you want durable hosting; the current build serves
finished files directly from the worker at `/files/<id>/out.mp4`.

## Endpoints

- `POST /jobs` — body `{ input, options }`. Returns `{ jobId }`.
- `GET  /jobs/:id` — `{ status, mp4Url?, posterUrl?, durationSec?, error? }`.
- `GET  /files/:id/out.mp4` — the finished file.
- `GET  /healthz` — liveness.

All except `/healthz` and `/files/*` require `Authorization: Bearer $WORKER_TOKEN`.
