import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "record_website",
  title: "Record website",
  description: "Start a smooth-scroll SmoothRecord video of a public URL or raw HTML string. Returns a jobId — poll with get_job.",
  inputSchema: {
    url: z.string().url().optional().describe("Public URL to record. Provide this OR html."),
    html: z.string().min(20).max(1_000_000).optional().describe("Raw HTML string to render and record. Provide this OR url."),
    preset: z.enum(["editorial", "cinematic", "lite"]).optional().describe("Scroll pacing preset. Default: editorial."),
  },
  annotations: { readOnlyHint: false, openWorldHint: true },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    if (!input.url && !input.html) {
      return { content: [{ type: "text", text: "Provide either `url` or `html`." }], isError: true };
    }

    const { submitToWorker } = await import("@/lib/worker.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const jobInput = input.url
      ? { type: "url" as const, url: input.url }
      : { type: "html" as const, html: input.html! };
    const preset = input.preset ?? "editorial";

    try {
      const { workerJobId } = await submitToWorker({ input: jobInput, preset });
      const { data, error } = await supabaseAdmin
        .from("jobs")
        .insert({
          user_id: ctx.getUserId()!,
          worker_job_id: workerJobId,
          status: "queued",
          source: "mcp",
          input: jobInput,
          options: { preset },
          preset,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      return {
        content: [{ type: "text", text: `Recording started. Job ID: ${data.id}. Call get_job to check status.` }],
        structuredContent: { jobId: data.id, status: "queued" },
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed to start: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      };
    }
  },
});
