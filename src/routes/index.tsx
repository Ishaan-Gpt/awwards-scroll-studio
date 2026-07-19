import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUpRight, Play, Zap, Film, Github, Terminal, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const [url, setUrl] = useState("");
  const heroRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Nav />

      {/* HERO */}
      <section ref={heroRef} className="relative pt-40 pb-32 px-6 md:px-12">
        <div
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] rounded-full breathe"
          style={{
            background: "radial-gradient(closest-side, oklch(0.92 0.24 128 / 0.10), transparent 70%)",
            transform: `translate(-50%, ${scrollY * -0.15}px)`,
          }}
        />
        <div className="relative max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
            <span className="w-2 h-2 rounded-full bg-acid animate-pulse" />
            <span>v0.1 · MCP + REST connector</span>
          </div>

          <h1 className="font-display text-[14vw] md:text-[9vw] leading-[0.85] tracking-tight">
            <span className="block">Smooth<span className="italic text-acid">Record</span></span>
            <span className="block text-muted-foreground">the internet,</span>
            <span className="block">frame by frame.</span>
          </h1>

          <div className="mt-16 grid md:grid-cols-[1.2fr,1fr] gap-12 items-end">
            <p className="text-xl md:text-2xl leading-snug max-w-2xl text-foreground/85">
              A premium Awwwards-style scroll-through video of any website —
              URL, raw HTML, a built bundle, or a git repo — returned as a
              downloadable <span className="font-mono text-acid">.mp4</span> you can drop straight into your product.
            </p>

            <UrlBar url={url} setUrl={setUrl} />
          </div>
        </div>
      </section>

      <Marquee />
      <ShowcaseFrame />
      <Features />
      <HowItWorks />
      <ConnectorSurfaces />
      <FinalCTA />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/60 border-b border-border/50">
      <div className="max-w-7xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
        <Link to="/" className="font-display text-2xl tracking-tight">
          Smooth<span className="italic text-acid">Record</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <Link to="/app" className="hover:text-foreground transition">Dashboard</Link>
          <Link to="/docs" className="hover:text-foreground transition">Docs</Link>
          <a href="#connectors" className="hover:text-foreground transition">Connectors</a>
        </nav>
        <Link
          to="/app"
          className="group inline-flex items-center gap-2 px-4 py-2 rounded-full bg-acid text-background text-sm font-medium hover:pl-5 transition-all"
        >
          Try it <ArrowUpRight className="w-4 h-4 group-hover:rotate-45 transition-transform" />
        </Link>
      </div>
    </header>
  );
}

function UrlBar({ url, setUrl }: { url: string; setUrl: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="w-full"
      onSubmit={async (e) => {
        e.preventDefault();
        const q = url.trim();
        if (!q) return;
        setBusy(true);
        const { data } = await supabase.auth.getSession();
        const target = `/app?url=${encodeURIComponent(q)}`;
        if (data.session) {
          window.location.href = target;
        } else {
          window.location.href = `/auth?next=${encodeURIComponent(target)}`;
        }
      }}
    >
      <label className="block text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Paste a URL → sign in → record on your machine
      </label>
      <div className="flex items-stretch gap-2 border border-border rounded-2xl p-2 bg-surface/60 backdrop-blur-sm focus-within:border-acid transition-colors">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          type="url"
          placeholder="https://linear.app"
          className="flex-1 bg-transparent px-4 py-3 outline-none placeholder:text-muted-foreground/60 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="group inline-flex items-center gap-2 px-6 rounded-xl bg-foreground text-background font-medium hover:bg-acid transition-colors disabled:opacity-60"
        >
          {busy ? "…" : <>Record <Play className="w-4 h-4 fill-current" /></>}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground font-mono">Runs on your paired worker · 60fps · unlimited length</p>
    </form>
  );
}

function Marquee() {
  const items = [
    "SSR", "CSR", "React", "Next", "Vite", "Astro", "Plain HTML",
    "Framer Motion", "GSAP", "Lenis", "Scroll-linked", "60fps", "1440p",
  ];
  const doubled = [...items, ...items];
  return (
    <div className="relative border-y border-border/60 py-6 overflow-hidden">
      <div className="marquee flex gap-12 whitespace-nowrap">
        {doubled.map((t, i) => (
          <span key={i} className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">
            {t} <span className="text-acid ml-12">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ShowcaseFrame() {
  return (
    <section className="px-6 md:px-12 py-24">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-[1fr,2fr] gap-8 md:gap-16 items-start mb-12">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            001 — the output
          </div>
          <h2 className="font-display text-5xl md:text-7xl leading-none">
            A <span className="italic">choreographed</span> scroll.<br />
            Not a linear slide.
          </h2>
        </div>

        <div className="relative rounded-3xl overflow-hidden border border-border bg-surface aspect-[16/10]">
          {/* Fake browser chrome */}
          <div className="absolute inset-x-0 top-0 h-10 bg-background/60 backdrop-blur border-b border-border flex items-center gap-2 px-4 z-10">
            <span className="w-3 h-3 rounded-full bg-muted" />
            <span className="w-3 h-3 rounded-full bg-muted" />
            <span className="w-3 h-3 rounded-full bg-muted" />
            <div className="ml-4 px-3 py-1 rounded-md bg-background/80 text-xs font-mono text-muted-foreground">
              awwwards-site.com
            </div>
          </div>
          <div className="absolute inset-0 pt-10 grid place-items-center">
            <SimulatedScroll />
          </div>
          <div className="absolute bottom-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur border border-border text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            REC · 00:12 · 60fps
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-3 gap-4 font-mono text-xs text-muted-foreground">
          <div className="border border-border rounded-xl p-4">
            <div className="text-acid mb-1">→ SECTION GLIDE</div>
            800px/s · eased cubic-bezier(.22,.61,.36,1)
          </div>
          <div className="border border-border rounded-xl p-4">
            <div className="text-acid mb-1">◉ HOLD</div>
            700ms at sections · 400ms at headings
          </div>
          <div className="border border-border rounded-xl p-4">
            <div className="text-acid mb-1">≈ MICRO BREATH</div>
            ±6px sinusoidal — nothing is frozen
          </div>
        </div>
      </div>
    </section>
  );
}

function SimulatedScroll() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setT(((now - start) / 6000) % 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const y = -t * 800;
  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-x-0 flex flex-col" style={{ transform: `translateY(${y}px)` }}>
        {["Hero", "Work", "About", "Contact"].map((label, i) => (
          <div
            key={i}
            className="h-80 flex items-center justify-center border-b border-border/40"
            style={{ background: i % 2 ? "oklch(0.17 0.006 260)" : "oklch(0.15 0.005 260)" }}
          >
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
                Section 0{i + 1}
              </div>
              <div className="font-display text-6xl">{label}<span className="italic text-acid">.</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Features() {
  const rows = [
    { n: "01", h: "Any input", b: "Public URL, raw HTML, a zip of a built bundle, or a git repo. SSR + CSR + static — Chromium doesn't care." },
    { n: "02", h: "Awwwards-tuned scroll", b: "Section-aware pacing with eased segments and intentional holds so hero reveals and pinned animations complete on camera." },
    { n: "03", h: "Real MP4, not a GIF", b: "H.264, yuv420p, +faststart. Drops straight into <video>, your CMS, or your prompt-library preview." },
    { n: "04", h: "Two front doors", b: "Call it from an AI assistant over MCP or from any app via public REST. Same engine, same output." },
    { n: "05", h: "Own your worker", b: "Recorder ships as a small Docker container. Deploy on Fly, Railway, Render, or a $5 VPS. Your Chromium, your storage." },
  ];
  return (
    <section className="px-6 md:px-12 py-24 border-t border-border/60">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-[1fr,2fr] gap-8 mb-16 items-start">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">002 — why it's different</div>
          <h2 className="font-display text-5xl md:text-7xl leading-none">
            Built for pages that <span className="italic">move</span>.
          </h2>
        </div>
        <div className="divide-y divide-border/60 border-y border-border/60">
          {rows.map((r) => (
            <div key={r.n} className="grid md:grid-cols-[100px,1fr,2fr] gap-4 md:gap-8 py-8 group hover:bg-surface/40 transition-colors px-2 -mx-2 rounded-xl">
              <div className="font-mono text-sm text-muted-foreground">{r.n}</div>
              <div className="font-display text-3xl">{r.h}</div>
              <div className="text-lg text-foreground/75 leading-relaxed max-w-2xl">{r.b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="px-6 md:px-12 py-24 border-t border-border/60">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-[1fr,2fr] gap-8 mb-16 items-start">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">003 — under the hood</div>
          <h2 className="font-display text-5xl md:text-7xl leading-none">
            Three moves. One <span className="italic">crisp</span> mp4.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              icon: Zap,
              t: "1 · Wake the page",
              d: "Chromium loads it, waits for fonts + images + networkidle, disables reduced-motion, kills cookie banners.",
            },
            {
              icon: Sparkles,
              t: "2 · Choreograph the pass",
              d: "Detects sections, headings and hero media. Builds a timeline of eased scroll segments with holds where they matter.",
            },
            {
              icon: Film,
              t: "3 · Encode & ship",
              d: "Records at 60fps, transcodes with ffmpeg to H.264 + faststart, uploads to your bucket, hands you a signed URL.",
            },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="border border-border rounded-2xl p-8 bg-surface/50 hover:border-acid transition-colors group">
              <Icon className="w-6 h-6 text-acid mb-6 group-hover:scale-110 transition-transform" />
              <div className="font-display text-2xl mb-3">{t}</div>
              <div className="text-sm text-foreground/70 leading-relaxed">{d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConnectorSurfaces() {
  return (
    <section id="connectors" className="px-6 md:px-12 py-24 border-t border-border/60">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-[1fr,2fr] gap-8 mb-16 items-start">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">004 — how you call it</div>
          <h2 className="font-display text-5xl md:text-7xl leading-none">
            MCP for agents.<br /><span className="italic">REST</span> for everything else.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <CodeCard title="MCP · from Claude / Cursor / ChatGPT" language="json"
            code={`{
  "mcpServers": {
    "smoothrecord": {
      "url": "https://smoothrecord.app/mcp"
    }
  }
}

// then, in chat:
// "Record https://linear.app in editorial preset"`} />
          <CodeCard title="REST · from your app" language="bash"
            code={`curl -X POST https://smoothrecord.app/api/public/record \\
  -H "Authorization: Bearer $SMOOTHRECORD_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": { "type": "url", "url": "https://linear.app" },
    "options": { "preset": "editorial" }
  }'

# -> { "jobId": "job_01H...", "statusUrl": "..." }`} />
        </div>
      </div>
    </section>
  );
}

function CodeCard({ title, code, language }: { title: string; code: string; language: string }) {
  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-surface/50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal className="w-3.5 h-3.5" />
          <span className="font-mono">{title}</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{language}</span>
      </div>
      <pre className="p-6 text-xs font-mono leading-relaxed overflow-x-auto text-foreground/85"><code>{code}</code></pre>
    </div>
  );
}

function FinalCTA() {
  return (
    <section className="px-6 md:px-12 py-32 border-t border-border/60 relative overflow-hidden">
      <div className="absolute inset-0 breathe" style={{ background: "radial-gradient(ellipse at 50% 100%, oklch(0.92 0.24 128 / 0.12), transparent 60%)" }} />
      <div className="relative max-w-5xl mx-auto text-center">
        <h2 className="font-display text-6xl md:text-9xl leading-[0.9]">
          Ship a video<br /><span className="italic">right now.</span>
        </h2>
        <div className="mt-12 flex items-center justify-center gap-4">
          <Link to="/app" className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-acid text-background font-medium text-lg hover:pl-10 transition-all">
            Open the playground <ArrowUpRight className="w-5 h-5 group-hover:rotate-45 transition-transform" />
          </Link>
          <Link to="/docs" className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-border text-foreground hover:border-acid transition-colors">
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-6 md:px-12 py-12 border-t border-border/60">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-sm text-muted-foreground">
        <div className="font-display text-2xl text-foreground">Smooth<span className="italic text-acid">Record</span></div>
        <div className="flex items-center gap-6 font-mono text-xs uppercase tracking-widest">
          <Link to="/app" className="hover:text-foreground">Dashboard</Link>
          <Link to="/docs" className="hover:text-foreground">Docs</Link>
          <a href="https://github.com" className="hover:text-foreground inline-flex items-center gap-1"><Github className="w-3 h-3" /> Source</a>
        </div>
        <div className="font-mono text-xs">© 2026 · MIT</div>
      </div>
    </footer>
  );
}
