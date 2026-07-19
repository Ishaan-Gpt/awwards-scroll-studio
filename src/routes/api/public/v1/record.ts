import { createFileRoute } from "@tanstack/react-router";
import { RecordBodySchema } from "@/lib/record-schemas";
import { authenticateApiKey } from "@/lib/api-key-auth.server";
import { submitToWorker } from "@/lib/worker.server";

export const Route = createFileRoute("/api/public/v1/record")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }),
      POST: async ({ request }) => {
        let owner;
        try {
          owner = await authenticateApiKey(request);
        } catch (e) {
          if (e instanceof Response) return e;
          throw e;
        }

        let json: unknown;
        try { json = await request.json(); }
        catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

        const parsed = RecordBodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
        }

        const preset = parsed.data.options?.preset ?? "editorial";
        let workerJobId: string;
        try {
          ({ workerJobId } = await submitToWorker({
            input: parsed.data.input,
            options: parsed.data.options,
            preset,
          }));
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "Worker error" }, { status: 502 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("jobs")
          .insert({
            user_id: owner.userId,
            worker_job_id: workerJobId,
            status: "queued",
            source: "rest",
            input: parsed.data.input,
            options: parsed.data.options ?? {},
            preset,
          })
          .select("id, created_at")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({
          jobId: row.id,
          statusUrl: `/api/public/v1/record/${row.id}`,
        }, { headers: { "Access-Control-Allow-Origin": "*" } });
      },
    },
  },
});
