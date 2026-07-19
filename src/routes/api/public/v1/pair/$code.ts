// Worker polls this to learn the pairing outcome.
// GET  → { status, workerId?, expiresAt }
// PATCH → worker updates its tunnel URL after cloudflared starts.
//         Body: { workerUrl: string, workerToken: string }  (token proves ownership)
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { decryptWorkerToken } from "@/lib/worker-crypto.server";

export const Route = createFileRoute("/api/public/v1/pair/$code")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("worker_pairings")
          .select("code, status, worker_id, expires_at, worker_url")
          .eq("code", params.code)
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!data) return Response.json({ error: "not_found" }, { status: 404 });

        let status = data.status;
        if (status === "pending" && new Date(data.expires_at) < new Date()) {
          status = "expired";
          await supabaseAdmin.from("worker_pairings").update({ status: "expired" }).eq("code", params.code);
        }

        return Response.json({
          status,
          workerId: data.worker_id,
          hasUrl: Boolean(data.worker_url),
          expiresAt: data.expires_at,
        }, { headers: { "Access-Control-Allow-Origin": "*" } });
      },
      PATCH: async ({ params, request }) => {
        let json: unknown;
        try { json = await request.json(); }
        catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        const parsed = z.object({
          workerUrl: z.string().url(),
          workerToken: z.string().min(16).max(200),
        }).safeParse(json);
        if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("worker_pairings")
          .select("worker_token_ciphertext, status")
          .eq("code", params.code)
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!row) return Response.json({ error: "not_found" }, { status: 404 });
        if (row.status !== "pending") return Response.json({ error: `already_${row.status}` }, { status: 409 });

        // Verify the worker is who it says it is.
        let expected: string;
        try { expected = decryptWorkerToken(row.worker_token_ciphertext); }
        catch { return Response.json({ error: "corrupt_token" }, { status: 500 }); }
        if (expected !== parsed.data.workerToken) {
          return Response.json({ error: "token_mismatch" }, { status: 401 });
        }

        const { error: upErr } = await supabaseAdmin
          .from("worker_pairings")
          .update({ worker_url: parsed.data.workerUrl })
          .eq("code", params.code);
        if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

        return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
      },
    },
  },
});
