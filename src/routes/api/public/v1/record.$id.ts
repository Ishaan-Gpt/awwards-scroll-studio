import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey } from "@/lib/api-key-auth.server";
import { fetchWorkerJob } from "@/lib/worker.server";

export const Route = createFileRoute("/api/public/v1/record/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        let owner;
        try { owner = await authenticateApiKey(request); }
        catch (e) { if (e instanceof Response) return e; throw e; }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("jobs")
          .select("id, status, mp4_url, poster_url, duration_sec, error, created_at, updated_at, worker_job_id")
          .eq("id", params.id)
          .eq("user_id", owner.userId)
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!row) return Response.json({ error: "Not found" }, { status: 404 });

        // Refresh from worker if still running.
        if ((row.status === "queued" || row.status === "running") && row.worker_job_id) {
          try {
            const wj = await fetchWorkerJob(row.worker_job_id, owner.userId);
            if (wj.status !== row.status) {
              await supabaseAdmin.from("jobs").update({
                status: wj.status,
                mp4_url: wj.mp4Url ?? null,
                poster_url: wj.posterUrl ?? null,
                duration_sec: wj.durationSec ?? null,
                error: wj.error ?? null,
              }).eq("id", row.id);
              Object.assign(row, {
                status: wj.status, mp4_url: wj.mp4Url, poster_url: wj.posterUrl,
                duration_sec: wj.durationSec, error: wj.error,
              });
            }
          } catch { /* ignore transient */ }
        }

        return Response.json({
          jobId: row.id,
          status: row.status,
          mp4Url: row.mp4_url,
          posterUrl: row.poster_url,
          durationSec: row.duration_sec,
          error: row.error,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }, { headers: { "Access-Control-Allow-Origin": "*" } });
      },
    },
  },
});
