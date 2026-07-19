// Server-only helper for talking to a SmoothRecord recorder worker.
// Filename ends in .server.ts, so the client-bundle guard rejects any browser import.
//
// Routing:
// 1. If a userId is provided AND that user has a `workers` row, use their worker
//    URL + decrypted token (per-user, running on their own machine).
// 2. Else fall back to WORKER_BASE_URL + WORKER_TOKEN env (shared demo worker).

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

interface WorkerEndpoint { baseUrl: string; token: string; workerId?: string }

async function resolveEndpoint(userId?: string): Promise<WorkerEndpoint> {
  if (userId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("workers")
      .select("id, worker_url, worker_token_ciphertext")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const { decryptWorkerToken } = await import("./worker-crypto.server");
      return {
        baseUrl: data.worker_url.replace(/\/$/, ""),
        token: decryptWorkerToken(data.worker_token_ciphertext),
        workerId: data.id,
      };
    }
  }
  const base = process.env.WORKER_BASE_URL;
  const token = process.env.WORKER_TOKEN;
  if (!base || !token) throw new Error("No worker paired. Install one in the Workers tab.");
  return { baseUrl: base.replace(/\/$/, ""), token };
}

async function markWorkerHealth(workerId: string, ok: boolean, err?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("workers")
    .update({
      status: ok ? "online" : "error",
      last_seen_at: new Date().toISOString(),
      last_error: ok ? null : (err ?? null),
    })
    .eq("id", workerId);
}

export async function submitToWorker(payload: {
  input: unknown;
  options?: unknown;
  preset?: string;
  userId?: string;
}): Promise<{ workerJobId: string; workerId?: string }> {
  const ep = await resolveEndpoint(payload.userId);
  const body: Record<string, unknown> = { input: payload.input };
  if (payload.options) body.options = payload.options;
  if (payload.preset) body.preset = payload.preset;

  try {
    const res = await fetch(`${ep.baseUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ep.token}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Worker rejected job [${res.status}]: ${text.slice(0, 400)}`);
    const parsed = text ? JSON.parse(text) : {};
    const id = parsed.jobId ?? parsed.id;
    if (!id) throw new Error("Worker did not return a job id");
    if (ep.workerId) void markWorkerHealth(ep.workerId, true);
    return { workerJobId: id, workerId: ep.workerId };
  } catch (e) {
    if (ep.workerId) void markWorkerHealth(ep.workerId, false, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function fetchWorkerJob(workerJobId: string, userId?: string): Promise<WorkerJob> {
  const ep = await resolveEndpoint(userId);
  const res = await fetch(`${ep.baseUrl}/jobs/${encodeURIComponent(workerJobId)}`, {
    headers: { Authorization: `Bearer ${ep.token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Worker status [${res.status}]: ${text.slice(0, 400)}`);
  return JSON.parse(text) as WorkerJob;
}
