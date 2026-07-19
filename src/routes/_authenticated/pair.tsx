import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { getMyPairing, confirmPairing, denyPairing } from "@/lib/workers.functions";
import { CheckCircle2, XCircle, Loader2, Monitor } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pair")({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === "string" ? s.code : "",
  }),
  head: () => ({ meta: [{ title: "Pair worker — SmoothRecord" }, { name: "robots", content: "noindex" }] }),
  component: PairPage,
});

function PairPage() {
  const { code } = Route.useSearch();
  const nav = useNavigate();
  const getPairing = useServerFn(getMyPairing);
  const confirmFn = useServerFn(confirmPairing);
  const denyFn = useServerFn(denyPairing);
  const [name, setName] = useState("");

  const q = useQuery({
    queryKey: ["pairing", code],
    queryFn: () => getPairing({ data: { code } }),
    enabled: !!code,
    refetchInterval: (query) => {
      const d = query.state.data as { status: string; worker_url: string | null } | undefined;
      if (!d) return 1500;
      if (d.status !== "pending") return false;
      return d.worker_url ? false : 1500;
    },
  });

  const confirmMut = useMutation({
    mutationFn: () => confirmFn({ data: { code, name: name || undefined } }),
    onSuccess: () => nav({ to: "/app", search: { tab: "workers" } as never }),
  });
  const denyMut = useMutation({
    mutationFn: () => denyFn({ data: { code } }),
    onSuccess: () => nav({ to: "/app" }),
  });

  if (!code) return <Centered><p>Missing pairing code.</p></Centered>;

  return (
    <Centered>
      <div className="max-w-md w-full">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-acid/10 mb-4">
            <Monitor className="w-8 h-8 text-acid" />
          </div>
          <h1 className="font-display text-4xl mb-2">Pair this worker?</h1>
          <p className="text-muted-foreground text-sm">
            A recording worker running on your computer wants to connect to your SmoothRecord account.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 mb-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Pairing code</div>
          <div className="font-mono text-2xl text-acid mb-6">{code}</div>

          {q.isLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Looking up…</p>}
          {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

          {q.data && (
            <>
              {q.data.status !== "pending" ? (
                <p className="text-sm text-muted-foreground">This code is <span className="text-foreground uppercase">{q.data.status}</span> — nothing to do here.</p>
              ) : !q.data.worker_url ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Waiting for your worker to report its address…
                </p>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="text-xs uppercase tracking-widest text-muted-foreground">Worker name</label>
                    <input
                      value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="My MacBook"
                      className="w-full mt-1 h-11 rounded-lg bg-secondary border border-border px-3 text-sm outline-none focus:border-acid"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmMut.mutate()}
                      disabled={confirmMut.isPending}
                      className="flex-1 h-11 rounded-lg bg-acid text-background font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {confirmMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Confirm
                    </button>
                    <button
                      onClick={() => denyMut.mutate()}
                      disabled={denyMut.isPending}
                      className="h-11 px-4 rounded-lg border border-border text-muted-foreground hover:text-destructive flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" /> Deny
                    </button>
                  </div>
                  {confirmMut.error && <p className="mt-3 text-sm text-destructive">{(confirmMut.error as Error).message}</p>}
                </>
              )}
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Only confirm if you just ran the installer on your own computer. If this wasn't you, click Deny.
        </p>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-12">{children}</div>;
}
