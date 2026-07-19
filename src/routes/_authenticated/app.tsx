import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listMyJobs, startJob, deleteMyJob, getMyJob } from "@/lib/jobs.functions";
import { listApiKeys, createApiKey, revokeApiKey } from "@/lib/keys.functions";
import { listMyWorkers, deleteMyWorker } from "@/lib/workers.functions";
import { Loader2, Play, Trash2, Copy, ExternalLink, Plus, Key, Terminal, LogOut, Video, Sparkles, Monitor, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dashboard — SmoothRecord" },
      { name: "description", content: "Your SmoothRecord recordings, API keys, and MCP connection." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

type Tab = "record" | "jobs" | "workers" | "keys" | "mcp";

function Dashboard() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>((search.tab as Tab) ?? "record");
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="font-display text-2xl">
            Smooth<span className="italic text-acid">Record</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground hidden sm:block">{email}</span>
            <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {([
            ["record", "New recording", Sparkles],
            ["jobs", "My jobs", Video],
            ["workers", "Workers", Monitor],
            ["keys", "API keys", Key],
            ["mcp", "MCP", Terminal],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id} onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
                tab === id ? "border-acid text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {tab === "record" && <RecordTab onDone={() => setTab("jobs")} />}
        {tab === "jobs" && <JobsTab />}
        {tab === "workers" && <WorkersTab />}
        {tab === "keys" && <KeysTab />}
        {tab === "mcp" && <McpTab />}
      </main>
    </div>
  );
}

function RecordTab({ onDone }: { onDone: () => void }) {
  const start = useServerFn(startJob);
  const [kind, setKind] = useState<"url" | "html">("url");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("<!doctype html><html><body style='font-family:system-ui;padding:4rem'><h1>hello</h1></body></html>");
  const [preset, setPreset] = useState<"editorial" | "cinematic" | "lite">("lite");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const input = kind === "url" ? { type: "url" as const, url } : { type: "html" as const, html };
      await start({ data: { input, options: { preset } } });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl">
      <h1 className="font-display text-5xl mb-2">New recording</h1>
      <p className="text-muted-foreground mb-8">Point us at a URL or paste raw HTML. We handle the rest.</p>

      <div className="inline-flex rounded-lg border border-border p-1 mb-5">
        {(["url", "html"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`px-4 py-1.5 text-sm rounded-md ${kind === k ? "bg-acid text-background" : "text-muted-foreground"}`}>
            {k.toUpperCase()}
          </button>
        ))}
      </div>

      {kind === "url" ? (
        <input
          type="url" required placeholder="https://your-site.com"
          value={url} onChange={(e) => setUrl(e.target.value)}
          className="w-full h-12 rounded-lg bg-secondary border border-border px-4 outline-none focus:border-acid"
        />
      ) : (
        <textarea
          required rows={10} value={html} onChange={(e) => setHtml(e.target.value)}
          className="w-full rounded-lg bg-secondary border border-border p-4 font-mono text-sm outline-none focus:border-acid"
        />
      )}

      <div className="mt-5 flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Preset</label>
        <select value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)}
          className="h-10 rounded-lg bg-secondary border border-border px-3 text-sm">
          <option value="lite">Lite — fast, 720p</option>
          <option value="editorial">Editorial — 60fps, moderate</option>
          <option value="cinematic">Cinematic — 60fps, slow luxurious</option>
        </select>
      </div>

      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

      <button type="submit" disabled={busy}
        className="mt-6 h-12 px-6 rounded-lg bg-acid text-background font-medium flex items-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        Start recording
      </button>
    </form>
  );
}

function JobsTab() {
  const list = useServerFn(listMyJobs);
  const get = useServerFn(getMyJob);
  const del = useServerFn(deleteMyJob);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["my-jobs"],
    queryFn: () => list(),
    refetchInterval: (query) => {
      const d = query.state.data as { status: string }[] | undefined;
      return d?.some((j) => j.status === "queued" || j.status === "running") ? 3000 : false;
    },
  });

  // Refresh any active job from worker on each tick.
  useEffect(() => {
    if (!q.data) return;
    q.data.forEach(async (j) => {
      if (j.status === "queued" || j.status === "running") {
        try { await get({ data: { id: j.id } }); } catch { /* ignore */ }
      }
    });
  }, [q.data, get]);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-jobs"] }),
  });

  return (
    <div>
      <h1 className="font-display text-5xl mb-6">My recordings</h1>
      {q.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {q.data?.length === 0 && (
        <div className="border border-dashed border-border rounded-2xl p-16 text-center text-muted-foreground">
          No recordings yet.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {q.data?.map((j) => (
          <div key={j.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="aspect-video bg-secondary flex items-center justify-center">
              {j.poster_url ? (
                <img src={j.poster_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="text-xs text-muted-foreground uppercase tracking-widest">
                  {j.status}
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded ${
                  j.status === "succeeded" ? "bg-acid/20 text-acid" :
                  j.status === "failed" ? "bg-destructive/20 text-destructive" :
                  "bg-secondary text-muted-foreground"
                }`}>{j.status}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(j.created_at).toLocaleString()}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {(j.input as { url?: string; type?: string }).url ?? (j.input as { type?: string }).type}
              </div>
              {j.error && <div className="mt-2 text-xs text-destructive line-clamp-2">{j.error}</div>}
              <div className="mt-3 flex gap-2">
                {j.mp4_url && (
                  <a href={j.mp4_url} download className="flex-1 text-xs h-8 rounded-md bg-acid text-background font-medium flex items-center justify-center gap-1">
                    <ExternalLink className="w-3 h-3" /> Download MP4
                  </a>
                )}
                <button onClick={() => delMut.mutate(j.id)} className="h-8 w-8 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeysTab() {
  const list = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["api-keys"], queryFn: () => list() });
  const [name, setName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: (row) => {
      setFreshKey(row.key);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-5xl mb-2">API keys</h1>
      <p className="text-muted-foreground mb-8">Use these to call SmoothRecord from your own code, agents, or automations.</p>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMut.mutate(name.trim()); }} className="flex gap-2">
          <input
            placeholder="Key name (e.g. Production, Zapier)"
            value={name} onChange={(e) => setName(e.target.value)}
            className="flex-1 h-11 rounded-lg bg-secondary border border-border px-3 text-sm outline-none focus:border-acid"
          />
          <button type="submit" disabled={createMut.isPending || !name.trim()}
            className="h-11 px-4 rounded-lg bg-acid text-background font-medium flex items-center gap-2 disabled:opacity-50">
            <Plus className="w-4 h-4" /> Create key
          </button>
        </form>
        {freshKey && (
          <div className="mt-4 p-4 rounded-lg bg-acid/10 border border-acid/30">
            <div className="text-xs uppercase tracking-widest text-acid mb-2">Copy this key now — you won't see it again</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs break-all text-foreground">{freshKey}</code>
              <button onClick={() => navigator.clipboard.writeText(freshKey)} className="p-2 hover:bg-acid/20 rounded">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        {q.data?.length === 0 && <div className="p-6 text-sm text-muted-foreground">No keys yet.</div>}
        {q.data?.map((k) => (
          <div key={k.id} className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{k.name}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">
                {k.key_prefix}••••••••{k.revoked_at && <span className="ml-2 text-destructive uppercase">revoked</span>}
              </div>
            </div>
            <div className="text-xs text-muted-foreground hidden sm:block">
              {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : "Never used"}
            </div>
            {!k.revoked_at && (
              <button onClick={() => revokeMut.mutate(k.id)} className="text-xs text-muted-foreground hover:text-destructive">
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function McpTab() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const mcpUrl = `${origin}/mcp`;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-5xl mb-2">Connect to AI clients</h1>
      <p className="text-muted-foreground mb-8">
        SmoothRecord ships an OAuth-secured MCP server. Add this URL to ChatGPT, Claude, Codex, or Cursor and record websites from inside your chat.
      </p>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">MCP endpoint</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-sm break-all">{mcpUrl}</code>
          <button onClick={() => navigator.clipboard.writeText(mcpUrl)} className="p-2 hover:bg-secondary rounded">
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4 text-sm">
        <h3 className="font-display text-2xl">How to connect</h3>
        <ol className="space-y-3 list-decimal list-inside text-muted-foreground">
          <li>In your AI client, add a new MCP server.</li>
          <li>Paste the URL above.</li>
          <li>The client will open SmoothRecord to ask for your approval — sign in and approve.</li>
          <li>Ask your assistant: <em className="text-foreground not-italic">"record a smooth-scroll video of https://linear.app"</em>.</li>
        </ol>
        <div className="pt-3 border-t border-border">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Tools exposed</div>
          <ul className="space-y-1 font-mono text-xs">
            <li><span className="text-acid">record_website</span> — start a new recording</li>
            <li><span className="text-acid">get_job</span> — check status / get MP4 URL</li>
            <li><span className="text-acid">list_jobs</span> — recent recordings</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function WorkersTab() {
  const list = useServerFn(listMyWorkers);
  const del = useServerFn(deleteMyWorker);
  const qc = useQueryClient();
  const [origin, setOrigin] = useState("");
  const [os, setOs] = useState<"mac" | "win">("mac");

  useEffect(() => {
    setOrigin(window.location.origin);
    if (typeof navigator !== "undefined" && /Win/i.test(navigator.platform)) setOs("win");
  }, []);

  const q = useQuery({
    queryKey: ["my-workers"],
    queryFn: () => list(),
    refetchInterval: 5000,
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-workers"] }),
  });

  const macCmd = `curl -fsSL ${origin}/install.sh | sh`;
  const winCmd = `iwr -useb ${origin}/install.ps1 | iex`;
  const cmd = os === "mac" ? macCmd : winCmd;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-5xl mb-2">Your workers</h1>
      <p className="text-muted-foreground mb-8">
        Recordings run on <em className="text-foreground not-italic">your own computer</em> for privacy and unlimited render time.
        Install a worker once, keep it running, record anything.
      </p>

      <div className="rounded-2xl border border-border bg-card p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="text-xs uppercase tracking-widest text-acid">Install in one command</div>
          <div className="flex-1" />
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["mac", "win"] as const).map((o) => (
              <button key={o} onClick={() => setOs(o)}
                className={`px-3 py-1 text-xs rounded ${os === o ? "bg-acid text-background" : "text-muted-foreground"}`}>
                {o === "mac" ? "macOS / Linux" : "Windows"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-secondary border border-border p-3 font-mono text-xs">
          <code className="flex-1 break-all">{cmd}</code>
          <button onClick={() => navigator.clipboard.writeText(cmd)} className="p-1.5 hover:bg-background rounded">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
        <ol className="mt-5 space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Paste the command into {os === "mac" ? "Terminal" : "PowerShell"} and press Enter.</li>
          <li>The installer downloads the worker + tunnel, prints a pairing link, and starts running.</li>
          <li>Click the link, confirm "Pair this worker" — your dashboard flips to <span className="text-acid">online</span>.</li>
          <li>Leave the terminal open while you use SmoothRecord. Ctrl-C to stop anytime.</li>
        </ol>
        <div className="mt-5 pt-4 border-t border-border text-xs text-muted-foreground">
          Requires Node.js 20+. The installer will guide you to install it if missing. Signed one-click apps are coming.
        </div>
      </div>

      <h2 className="font-display text-2xl mb-3">Paired workers</h2>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.data?.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          No workers paired yet. Run the command above to add one.
        </div>
      )}
      <div className="space-y-2">
        {q.data?.map((w) => (
          <div key={w.id} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <div className={`w-2.5 h-2.5 rounded-full ${w.status === "online" ? "bg-acid" : "bg-destructive"}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{w.name}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">{w.worker_url}</div>
              {w.last_error && <div className="text-xs text-destructive mt-1 truncate">{w.last_error}</div>}
            </div>
            <div className="text-xs text-muted-foreground hidden sm:block">
              Last seen {new Date(w.last_seen_at).toLocaleTimeString()}
            </div>
            <button onClick={() => delMut.mutate(w.id)} className="p-2 rounded-md text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
