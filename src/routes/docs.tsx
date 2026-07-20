import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs — SmoothRecord" },
      { name: "description", content: "REST + MCP reference for SmoothRecord. Endpoints, tools, options, and worker deployment." },
    ],
  }),
  component: Docs,
});

function Docs() {
  return (
    <div className="min-h-screen">
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/60 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> back
          </Link>
          <div className="font-display text-xl">Docs</div>
          <Link to="/playground" className="text-sm text-muted-foreground hover:text-foreground">playground →</Link>
        </div>
      </header>

      <div className="pt-28 pb-24 px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-display text-6xl md:text-8xl leading-[0.9] mb-6">
            The <span className="italic text-acid">handbook</span>.
          </h1>
          <p className="text-lg text-muted-foreground mb-16">
            SmoothRecord has two surfaces: an MCP server for AI assistants and a public REST API for everything else. Both hit the same recorder worker.
          </p>

          <Section n="01" title="Deploy the worker">
            <p>The recorder is a small Node service (Fastify + Playwright + ffmpeg) that lives in <code>/worker</code>. It needs a real machine — deploy it once.</p>
            <Code lang="bash">{`# Fly.io
cd worker && fly launch --no-deploy && fly deploy

# Railway
railway up

# Docker anywhere
docker build -t smoothrecord-worker . && docker run -p 8080:8080 \\
  -e WORKER_TOKEN=<random> \\
  -e S3_ENDPOINT=... -e S3_BUCKET=... -e S3_KEY=... -e S3_SECRET=... \\
  smoothrecord-worker`}</Code>
            <p>Then set two secrets on this app:</p>
            <ul>
              <li><code>WORKER_BASE_URL</code> — the deployed worker URL</li>
              <li><code>WORKER_TOKEN</code> — same bearer as the worker env</li>
            </ul>
          </Section>

          <Section n="02" title="REST · POST /api/public/record">
            <Code lang="bash">{`curl -X POST https://your.smoothrecord.app/api/public/record \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": { "type": "url", "url": "https://linear.app" },
    "options": {
      "preset": "editorial",
      "width": 1440, "height": 900, "fps": 60,
      "maxDurationSec": 30
    }
  }'`}</Code>
            <p>Response:</p>
            <Code lang="json">{`{ "jobId": "job_01H...", "statusUrl": "/api/public/record/job_01H..." }`}</Code>
            <p>Poll status:</p>
            <Code lang="bash">{`curl https://your.smoothrecord.app/api/public/record/job_01H...
# -> { "status": "succeeded", "mp4Url": "https://...", "posterUrl": "...", "durationSec": 24 }`}</Code>
          </Section>

          <Section n="03" title="Inputs">
            <table className="w-full text-sm my-4">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">type</th><th className="py-2 pr-4">shape</th><th>notes</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                <tr className="border-b border-border/50"><td className="py-3 pr-4 text-acid">url</td><td>{`{ url: string }`}</td><td>SSR, CSR, static — anything a browser can load.</td></tr>
                <tr className="border-b border-border/50"><td className="py-3 pr-4 text-acid">html</td><td>{`{ html: string }`}</td><td>Served locally on a random port, then recorded.</td></tr>
                <tr className="border-b border-border/50"><td className="py-3 pr-4 text-acid">zip</td><td>{`{ zipUrl: string }`}</td><td>Downloaded, unzipped, served. Looks for <code>index.html</code>.</td></tr>
                <tr><td className="py-3 pr-4 text-acid">repo</td><td>{`{ gitUrl, branch?, buildCmd?, outputDir? }`}</td><td>Shallow clone; auto-detects Vite/Next/Astro/CRA.</td></tr>
              </tbody>
            </table>
          </Section>

          <Section n="04" title="Options">
            <Code lang="ts">{`{
  preset: "editorial" | "cinematic" | "custom",   // default "editorial"
  width: number,          // default 1440
  height: number,         // default 900
  deviceScaleFactor: number, // default 2
  fps: number,            // default 60
  maxDurationSec: number, // default 30
  scrollSpeedPxPerSec: number, // default 800 (editorial)
  sectionHoldMs: number,  // default 700
  headingHoldMs: number,  // default 400
  easing: string,         // CSS cubic-bezier
  waitForSelector?: string,
  extraWaitMs?: number,
  hideSelectors?: string[], // kills cookie banners etc.
  darkMode?: boolean,
  format: "mp4",

  // Composite pass — opt-in, off by default (raw viewport output otherwise).
  composite?: boolean,
  deviceFrame?: "macbook" | "safari" | "iphone" | "none", // default "macbook"
  backdrop?: "gradient-mesh" | "dark-studio" | "cyberpunk" | "clean-white",
  aspectRatio?: "16:9" | "9:16" | "1:1",

  // Narration — free, local OS TTS (no API key, no network call). If
  // voiceoverText is omitted, a script is auto-built from the page's
  // title/description/headings.
  voiceover?: boolean,
  voiceoverVoice?: string,   // OS-installed voice name, e.g. "Microsoft Zira"
  voiceoverText?: string,
}`}</Code>
          </Section>

          <Section n="05" title="Steps · click-flows">
            <p>Beyond passive scrolling, pass a <code>steps</code> array to click, type, and navigate through a real flow — login, signup, checkout — before the auto-scroll pass runs. Same page, one continuous recording.</p>
            <Code lang="bash">{`curl -X POST https://your.smoothrecord.app/api/public/record \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": { "type": "url", "url": "https://linear.app/signup" },
    "steps": [
      { "action": "fill", "selector": "input[name=email]", "value": "demo@smoothrecord.app" },
      { "action": "click", "selector": "button[type=submit]" },
      { "action": "waitFor", "selector": "#dashboard", "ms": 8000 }
    ],
    "options": { "preset": "editorial" }
  }'`}</Code>
            <table className="w-full text-sm my-4">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">action</th><th className="py-2 pr-4">fields</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                <tr className="border-b border-border/50"><td className="py-3 pr-4 text-acid">click / hover</td><td>{`{ selector }`}</td></tr>
                <tr className="border-b border-border/50"><td className="py-3 pr-4 text-acid">fill</td><td>{`{ selector, value }`}</td></tr>
                <tr className="border-b border-border/50"><td className="py-3 pr-4 text-acid">press</td><td>{`{ selector?, value: key }`}</td></tr>
                <tr className="border-b border-border/50"><td className="py-3 pr-4 text-acid">waitFor</td><td>{`{ selector, ms? }`}</td></tr>
                <tr className="border-b border-border/50"><td className="py-3 pr-4 text-acid">wait</td><td>{`{ ms }`}</td></tr>
                <tr className="border-b border-border/50"><td className="py-3 pr-4 text-acid">goto</td><td>{`{ value: url }`}</td></tr>
                <tr><td className="py-3 pr-4 text-acid">scrollTo</td><td>{`{ selector? | value: y }`}</td></tr>
              </tbody>
            </table>
          </Section>

          <Section n="06" title="MCP tools">
            <p>Add SmoothRecord to any MCP-capable client:</p>
            <Code lang="json">{`{
  "mcpServers": {
    "smoothrecord": { "url": "https://your.smoothrecord.app/mcp" }
  }
}`}</Code>
            <p>Tools exposed:</p>
            <ul>
              <li><code>record_url</code> — <span className="text-muted-foreground">record a public URL</span></li>
              <li><code>record_html</code> — <span className="text-muted-foreground">record a raw HTML document</span></li>
              <li><code>record_zip</code> — <span className="text-muted-foreground">record a zipped built site</span></li>
              <li><code>record_repo</code> — <span className="text-muted-foreground">clone + build + record a repo</span></li>
              <li><code>get_job</code> — <span className="text-muted-foreground">poll status + mp4 URL</span></li>
              <li><code>list_recent_jobs</code> — <span className="text-muted-foreground">last 20 of yours</span></li>
            </ul>
            <p className="text-sm text-muted-foreground">MCP support ships in v0.2 once auth is wired — the REST + worker layer is live in v0.1.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="py-10 border-t border-border">
      <div className="flex items-baseline gap-6 mb-6">
        <span className="font-mono text-xs text-muted-foreground">{n}</span>
        <h2 className="font-display text-4xl">{title}</h2>
      </div>
      <div className="prose-invert space-y-4 text-foreground/85 [&_code]:font-mono [&_code]:text-acid [&_code]:text-sm [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}

function Code({ children, lang }: { children: string; lang: string }) {
  return (
    <div className="my-4 border border-border rounded-xl overflow-hidden bg-surface/60">
      <div className="px-4 py-2 border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{lang}</div>
      <pre className="p-4 text-xs font-mono overflow-x-auto leading-relaxed"><code>{children}</code></pre>
    </div>
  );
}
