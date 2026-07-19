import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workers")
      .select("id, name, worker_url, status, last_seen_at, last_error, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteMyWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workers")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(4).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("worker_pairings")
      .select("code, worker_name, worker_url, status, expires_at, created_at")
      .eq("code", data.code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Pairing code not found");
    return row;
  });

export const confirmPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: z.string().min(4).max(64), name: z.string().trim().min(1).max(80).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pairing, error: pErr } = await supabaseAdmin
      .from("worker_pairings")
      .select("*")
      .eq("code", data.code)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!pairing) throw new Error("Pairing code not found");
    if (pairing.status !== "pending") throw new Error(`Pairing already ${pairing.status}`);
    if (new Date(pairing.expires_at) < new Date()) throw new Error("Pairing code expired");
    if (!pairing.worker_url) throw new Error("Worker hasn't reported its URL yet — wait a few seconds");

    // Create the worker row
    const { data: worker, error: wErr } = await supabaseAdmin
      .from("workers")
      .insert({
        user_id: context.userId,
        name: data.name ?? pairing.worker_name,
        worker_url: pairing.worker_url,
        worker_token_ciphertext: pairing.worker_token_ciphertext,
        status: "online",
      })
      .select("id, name, worker_url")
      .single();
    if (wErr) throw new Error(wErr.message);

    // Mark pairing as confirmed and link it to the worker
    const { error: upErr } = await supabaseAdmin
      .from("worker_pairings")
      .update({
        user_id: context.userId,
        worker_id: worker.id,
        status: "confirmed",
        claimed_at: new Date().toISOString(),
      })
      .eq("code", data.code);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, worker };
  });

export const denyPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(4).max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("worker_pairings")
      .update({ status: "denied", user_id: context.userId, claimed_at: new Date().toISOString() })
      .eq("code", data.code)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
