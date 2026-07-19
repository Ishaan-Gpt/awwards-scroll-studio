import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Beta oauth namespace — thin local typing.
type OAuthAuthDetails = {
  client?: { name?: string };
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResult = { data?: OAuthAuthDetails; error?: { message: string } | null };
type SupabaseOAuth = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

function oauth(): SupabaseOAuth {
  // Runtime path exists on @supabase/supabase-js beta; typed narrowly here.
  return (supabase.auth as unknown as { oauth: SupabaseOAuth }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Authorize — SmoothRecord" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-8 text-foreground">
      <div>Could not load this authorization request: {String((error as Error)?.message ?? error)}</div>
    </main>
  ),
});

function Consent() {
  const { authorization_id } = Route.useSearch();
  const [details, setDetails] = useState<OAuthAuthDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await oauth().getAuthorizationDetails(authorization_id);
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) { window.location.href = immediate; return; }
      setDetails(data ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authorization_id]);

  async function decide(approve: boolean) {
    setBusy(true); setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("Authorization server returned no redirect."); return; }
    window.location.href = target;
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</main>;
  }

  const clientName = details?.client?.name ?? "an application";

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <div className="font-display text-3xl mb-2">
          Connect <span className="italic text-acid">{clientName}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {clientName} will be able to use SmoothRecord as you — record websites, list your jobs, and download the results.
        </p>
        <ul className="text-sm space-y-2 mb-6">
          <li className="flex gap-2"><span className="text-acid">•</span> Share your basic profile</li>
          <li className="flex gap-2"><span className="text-acid">•</span> Start and read recording jobs on your account</li>
        </ul>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => decide(true)} disabled={busy}
            className="flex-1 h-11 rounded-lg bg-acid text-background font-medium disabled:opacity-50"
          >Approve</button>
          <button
            onClick={() => decide(false)} disabled={busy}
            className="flex-1 h-11 rounded-lg border border-border text-foreground disabled:opacity-50"
          >Cancel</button>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          You can revoke access at any time from your dashboard.
        </p>
      </div>
    </main>
  );
}
