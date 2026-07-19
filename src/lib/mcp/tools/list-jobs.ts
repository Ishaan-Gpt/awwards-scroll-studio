import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_jobs",
  title: "List recent recordings",
  description: "List the caller's most recent SmoothRecord jobs.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Max rows to return. Default 10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("jobs")
      .select("id, status, mp4_url, input, created_at")
      .eq("user_id", ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `${data?.length ?? 0} recent jobs.` }],
      structuredContent: { jobs: data ?? [] },
    };
  },
});
