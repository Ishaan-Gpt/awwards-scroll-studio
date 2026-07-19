import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_job",
  title: "Get recording job",
  description: "Get the current status of a SmoothRecord job. When status is `succeeded`, `mp4Url` is a downloadable MP4.",
  inputSchema: {
    jobId: z.string().uuid().describe("The job ID returned by record_website."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  handler: async ({ jobId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWorkerJob } = await import("@/lib/worker.server");

    const { data: row, error } = await supabaseAdmin
      .from("jobs")
      .select("id, status, mp4_url, poster_url, duration_sec, error, worker_job_id")
      .eq("id", jobId)
      .eq("user_id", ctx.getUserId()!)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!row) return { content: [{ type: "text", text: "Job not found." }], isError: true };

    if ((row.status === "queued" || row.status === "running") && row.worker_job_id) {
      try {
        const wj = await fetchWorkerJob(row.worker_job_id);
        if (wj.status !== row.status) {
          await supabaseAdmin.from("jobs").update({
            status: wj.status, mp4_url: wj.mp4Url ?? null, poster_url: wj.posterUrl ?? null,
            duration_sec: wj.durationSec ?? null, error: wj.error ?? null,
          }).eq("id", row.id);
          Object.assign(row, { status: wj.status, mp4_url: wj.mp4Url, poster_url: wj.posterUrl,
            duration_sec: wj.durationSec, error: wj.error });
        }
      } catch { /* ignore */ }
    }

    const summary = row.status === "succeeded"
      ? `Ready. MP4: ${row.mp4_url}`
      : row.status === "failed"
      ? `Failed: ${row.error ?? "unknown error"}`
      : `Status: ${row.status}`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        jobId: row.id, status: row.status, mp4Url: row.mp4_url,
        posterUrl: row.poster_url, durationSec: row.duration_sec, error: row.error,
      },
    };
  },
});
