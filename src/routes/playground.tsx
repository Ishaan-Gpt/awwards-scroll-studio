import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2, Play, Link as LinkIcon, Code2, Archive, GitBranch } from "lucide-react";

export const Route = createFileRoute("/playground")({
  validateSearch: (s: Record<string, unknown>) => ({
    url: typeof s.url === "string" ? s.url : "",
  }),
  component: Playground,
});

type Tab = "url" | "html" | "zip" | "repo";
type JobState = "idle" | "queued" | "running" | "succeeded" | "failed";

function Playground() {
  const { url: initialUrl } = Route.useSearch();
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState(initialUrl);
  const [html, setHtml] = useState("<!doctype html>\n<html><body style='font-family:system-ui;padding:4rem'>\n  <h1>hello</h1>\n</body></html>");
  const [zipUrl, setZipUrl] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [preset, setPreset] = useState<"editorial" | "cinematic">("editorial");
  const [width, setWidth] = useState(1440);
  const [height, setHeight] = useState(900);
  const [fps, setFps] = useState(60);

  const [state, setState] = useState<JobState>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mp4, setMp4] = useState<string | null>(null);

  useEffect(() => {
    if (initialUrl) setTab("url");
  }, [initialUrl]);

  async function submit() {
    setError(null);
    setMp4(null);
    setState("queued");
    const input =
      tab === "url" ? { type: "url", url } :
      tab === "html" ? { type: "html", html } :
      tab === "zip" ? { type: "zip", zipUrl } :
      { type: "repo", gitUrl };
    try {
      const res = await fetch("/api/public/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, options: { preset, width, height, fps } }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setJobId(body.jobId);
      setState("running");
      // Optimistic: server will return mp4Url when done. For now, poll.
      poll(body.jobId);
    } catch (e) {
      setState("failed");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function poll(id: string) {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const res = await fetch(`/api/public/record/${id}`);
        const body = await res.json();
        if (body.status === "succeeded" && body.mp4Url) {
          setMp4(body.mp4Url);
          setState("succeeded");
          return;
        }
        if (body.status === "failed") {
          setError(body.error || "Recording failed");
          setState("failed");
          return;
        }
      } catch { /* keep polling */ }
    }
    setState("failed");
    setError("Timed out after 5 minutes.");
  }

  return (
    <div className="min-h-screen">
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/60 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> back
          </Link>
          <div className="font-display text-xl">Playground</div>
          <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground">docs →</Link>
        </div>
      </header>

      <div className="pt-28 px-6 md:px-12 pb-24">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-6xl md:text-8xl leading-[0.9] mb-4">
            Record something <span className="italic text-acid">beautiful</span>.
          </h1>
          <p className="text-muted-foreground max-w-2xl mb-12">
            Pick an input, tune the pass, get an mp4. Anonymous runs are demo-quality; sign up for full length + your own storage.
          </p>

          <div className="grid lg:grid-cols-[1.4fr,1fr] gap-8">
            {/* LEFT — inputs */}
            <div className="border border-border rounded-3xl bg-surface/40 overflow-hidden">
              <div className="flex border-b border-border">
                {([
                  ["url", LinkIcon, "URL"],
                  ["html", Code2, "HTML"],
                  ["zip", Archive, "Zip"],
                  ["repo", GitBranch, "Repo"],
                ] as const).map(([k, Icon, label]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`flex-1 px-4 py-4 text-sm inline-flex items-center justify-center gap-2 transition-colors ${
                      tab === k ? "bg-background text-acid" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>

              <div className="p-6 md:p-8 min-h-[360px]">
                {tab === "url" && (
                  <Field label="Public URL">
                    <input value={url} onChange={(e) => setUrl(e.target.value)}
                      type="url" placeholder="https://linear.app"
                      className="w-full bg-transparent border border-border rounded-xl px-4 py-3 font-mono text-sm outline-none focus:border-acid" />
                  </Field>
                )}
                {tab === "html" && (
                  <Field label="Raw HTML document">
                    <textarea value={html} onChange={(e) => setHtml(e.target.value)}
                      rows={14}
                      className="w-full bg-transparent border border-border rounded-xl px-4 py-3 font-mono text-xs outline-none focus:border-acid resize-y" />
                  </Field>
                )}
                {tab === "zip" && (
                  <Field label="URL of a .zip containing your built site (index.html at root or in dist/)">
                    <input value={zipUrl} onChange={(e) => setZipUrl(e.target.value)}
                      type="url" placeholder="https://.../site.zip"
                      className="w-full bg-transparent border border-border rounded-xl px-4 py-3 font-mono text-sm outline-none focus:border-acid" />
                  </Field>
                )}
                {tab === "repo" && (
                  <Field label="Git repository URL (public — shallow clone + auto-detect build)">
                    <input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)}
                      type="url" placeholder="https://github.com/user/repo"
                      className="w-full bg-transparent border border-border rounded-xl px-4 py-3 font-mono text-sm outline-none focus:border-acid" />
                  </Field>
                )}
              </div>
            </div>

            {/* RIGHT — options */}
            <div className="border border-border rounded-3xl bg-surface/40 p-6 md:p-8 space-y-6">
              <div>
                <Label>Preset</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["editorial", "cinematic"] as const).map((p) => (
                    <button key={p} onClick={() => setPreset(p)}
                      className={`px-4 py-3 rounded-xl text-sm border transition ${
                        preset === p ? "border-acid text-acid" : "border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Width">
                  <input type="number" value={width} onChange={(e) => setWidth(+e.target.value)}
                    className="w-full bg-transparent border border-border rounded-lg px-3 py-2 font-mono text-sm outline-none focus:border-acid" />
                </Field>
                <Field label="Height">
                  <input type="number" value={height} onChange={(e) => setHeight(+e.target.value)}
                    className="w-full bg-transparent border border-border rounded-lg px-3 py-2 font-mono text-sm outline-none focus:border-acid" />
                </Field>
                <Field label="FPS">
                  <input type="number" value={fps} onChange={(e) => setFps(+e.target.value)}
                    className="w-full bg-transparent border border-border rounded-lg px-3 py-2 font-mono text-sm outline-none focus:border-acid" />
                </Field>
              </div>

              <button
                onClick={submit}
                disabled={state === "queued" || state === "running"}
                className="w-full group inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-acid text-background font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {state === "queued" || state === "running" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Recording…</>
                ) : (
                  <><Play className="w-4 h-4 fill-current" /> Record</>
                )}
              </button>

              <div className="text-xs font-mono text-muted-foreground border-t border-border pt-4 space-y-1">
                <div>state: <span className="text-foreground">{state}</span></div>
                {jobId && <div>job: <span className="text-foreground">{jobId}</span></div>}
                {error && <div className="text-red-400">error: {error}</div>}
              </div>
            </div>
          </div>

          {/* RESULT */}
          {(state === "running" || state === "succeeded") && (
            <div className="mt-12 border border-border rounded-3xl overflow-hidden bg-surface/40">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <div className="font-display text-2xl">Output</div>
                {mp4 && (
                  <a href={mp4} download className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-foreground text-background text-sm">
                    <Download className="w-4 h-4" /> Download .mp4
                  </a>
                )}
              </div>
              <div className="aspect-video bg-black grid place-items-center">
                {mp4 ? (
                  <video src={mp4} controls autoPlay muted loop className="w-full h-full" />
                ) : (
                  <div className="text-muted-foreground text-sm inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Chromium is choreographing the scroll…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">{children}</div>;
}
