// The worker (running on a user's machine) calls this to get a pairing code.
// Body: { workerName?: string, workerToken: string, workerUrl?: string }
// Returns: { code, confirmUrl, pollUrl, expiresAt }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { encryptWorkerToken } from "@/lib/worker-crypto.server";

const Body = z.object({
  workerName: z.string().trim().min(1).max(80).optional(),
  workerToken: z.string().min(16).max(200),
  workerUrl: z.string().url().optional(),
});

// Human-friendly code like "PANDA-7X9K"
const WORDS = ["PANDA", "TIGER", "OTTER", "EAGLE", "WHALE", "LEMUR", "ORCA", "LYNX", "SWAN", "FALCON"];
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  let n = "";
  for (let i = 0; i < 4; i++) n += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return `${w}-${n}`;
}

export const Route = createFileRoute("/api/public/v1/pair/start")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        let json: unknown;
        try { json = await request.json(); }
        catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        const parsed = Body.safeParse(json);
        if (!parsed.success) return Response.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Try up to 5 times to avoid unlikely code collisions.
        let code = generateCode();
        for (let i = 0; i < 5; i++) {
          const { error } = await supabaseAdmin.from("worker_pairings").insert({
            code,
            worker_name: parsed.data.workerName ?? "My Computer",
            worker_token_ciphertext: encryptWorkerToken(parsed.data.workerToken),
            worker_url: parsed.data.workerUrl ?? null,
          });
          if (!error) break;
          if (i === 4) return Response.json({ error: error.message }, { status: 500 });
          code = generateCode();
        }

        const origin = new URL(request.url).origin;
        return Response.json({
          code,
          confirmUrl: `${origin}/pair?code=${encodeURIComponent(code)}`,
          pollUrl: `${origin}/api/public/v1/pair/${encodeURIComponent(code)}`,
          expiresInSec: 900,
        }, { headers: { "Access-Control-Allow-Origin": "*" } });
      },
    },
  },
});
