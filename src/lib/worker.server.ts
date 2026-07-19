// Server-only helper for talking to the SmoothRecord recorder worker.
// Filename ends in .server.ts, so the client-bundle guard rejects any browser import.

export interface WorkerJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  mp4Url?: string | null;
  posterUrl?: string | null;
  durationSec?: number | null;
  error?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

function base(): string {
  const raw = process.env.WORKER_BASE_URL;
  if (!raw) throw new Error("WORKER_BASE_URL is not configured");
  return raw.replace(/\/$/, "");
}

function token(): string {
  const t = process.env.WORKER_TOKEN;
  if (!t) throw new Error("WORKER_TOKEN is not configured");
  return t;
}

export async function submitToWorker(payload: {
  input: unknown;
  options?: unknown;
  preset?: string;
}): Promise<{ workerJobId: string }> {
  const body: Record<string, unknown> = { input: payload.input };
  if (payload.options) body.options = payload.options;
  if (payload.preset) body.preset = payload.preset;

  const res = await fetch(`${base()}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Worker rejected job [${res.status}]: ${text.slice(0, 400)}`);
  const parsed = text ? JSON.parse(text) : {};
  const id = parsed.jobId ?? parsed.id;
  if (!id) throw new Error("Worker did not return a job id");
  return { workerJobId: id };
}

export async function fetchWorkerJob(workerJobId: string): Promise<WorkerJob> {
  const res = await fetch(`${base()}/jobs/${encodeURIComponent(workerJobId)}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Worker status [${res.status}]: ${text.slice(0, 400)}`);
  return JSON.parse(text) as WorkerJob;
}
