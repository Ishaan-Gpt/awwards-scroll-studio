// Server-only: validates a SmoothRecord API key and returns the owning user.
import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "sk_smr_live_";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  // 32 raw bytes → base64url (~43 chars). Total ≈ 55 chars incl. prefix.
  const body = randomBytes(32).toString("base64url");
  const raw = `${KEY_PREFIX}${body}`;
  const hash = sha256Hex(raw);
  const prefix = raw.slice(0, KEY_PREFIX.length + 6); // sk_smr_live_ABC123
  return { raw, hash, prefix };
}

export interface ApiKeyOwner {
  userId: string;
  keyId: string;
}

export async function authenticateApiKey(request: Request): Promise<ApiKeyOwner> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(sk_smr_[A-Za-z0-9_-]+)/);
  if (!match) throw new Response("Unauthorized: missing sk_smr_ bearer token", { status: 401 });
  const raw = match[1];
  const hash = sha256Hex(raw);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error) throw new Response(`Auth error: ${error.message}`, { status: 500 });
  if (!data) throw new Response("Unauthorized: unknown API key", { status: 401 });
  if (data.revoked_at) throw new Response("Unauthorized: key revoked", { status: 401 });

  // Touch last_used_at (fire-and-forget)
  void supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return { userId: data.user_id, keyId: data.id };
}
