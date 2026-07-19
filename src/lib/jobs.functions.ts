import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RecordBodySchema } from "./record-schemas";

const DEFAULT_MAX_JOBS_PER_DAY = 50;

async function enforceQuota(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabaseAdmin
    .from("usage_daily")
    .select("jobs_started, max_jobs_per_day")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();
  const cap = usage?.max_jobs_per_day ?? DEFAULT_MAX_JOBS_PER_DAY;
  const started = usage?.jobs_started ?? 0;
  if (started >= cap) {
    throw new Error(`Daily quota reached (${started}/${cap} recordings today). Try again tomorrow.`);
  }
  await supabaseAdmin.from("usage_daily").upsert(
    { user_id: userId, day: today, jobs_started: started + 1, max_jobs_per_day: cap },
    { onConflict: "user_id,day" },
  );
}

export const listMyJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("jobs")
      .select("id, status, source, input, preset, mp4_url, poster_url, duration_sec, error, created_at, updated_at, worker_job_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");

    if ((row.status === "queued" || row.status === "running") && row.worker_job_id) {
      const { fetchWorkerJob } = await import("./worker.server");
      try {
        const wj = await fetchWorkerJob(row.worker_job_id, context.userId);
        if (wj.status !== row.status || wj.mp4Url !== row.mp4_url) {
          const { data: updated } = await context.supabase
            .from("jobs")
            .update({
              status: wj.status,
              mp4_url: wj.mp4Url ?? null,
              poster_url: wj.posterUrl ?? null,
              duration_sec: wj.durationSec ?? null,
              error: wj.error ?? null,
            })
            .eq("id", data.id)
            .eq("user_id", context.userId)
            .select("*")
            .maybeSingle();
          return updated ?? row;
        }
      } catch { /* ignore */ }
    }
    return row;
  });

export const startJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RecordBodySchema.parse(input))
  .handler(async ({ data, context }) => {
    await enforceQuota(context.userId);
    const { submitToWorker } = await import("./worker.server");
    const preset = data.options?.preset ?? "editorial";
    const { workerJobId } = await submitToWorker({
      input: data.input,
      options: data.options,
      preset,
      userId: context.userId,
    });
    const { data: row, error } = await context.supabase
      .from("jobs")
      .insert({
        user_id: context.userId,
        worker_job_id: workerJobId,
        status: "queued",
        source: "dashboard",
        input: data.input,
        options: data.options ?? {},
        preset,
      })
      .select("id, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMyJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("jobs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
