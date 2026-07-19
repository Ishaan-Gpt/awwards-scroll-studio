#!/usr/bin/env node
// Runs the SmoothRecord worker + Cloudflare Quick Tunnel + auto-pairs with the
// SmoothRecord control plane so the user never sees ports/tokens/urls.
//
// Usage:
//   SMOOTHRECORD_APP=https://smoothrecord.lovable.app node src/pair.js
//
// Flow:
// 1. Generate a strong random bearer token; export as WORKER_TOKEN.
// 2. Spawn the worker HTTP server on 127.0.0.1:<random>.
// 3. Spawn `cloudflared tunnel --url http://127.0.0.1:<port>` and capture the
//    printed https://*.trycloudflare.com URL.
// 4. POST /api/public/v1/pair/start → get a pairing code + confirm URL.
// 5. PATCH /api/public/v1/pair/:code with the tunnel URL and the token.
// 6. Print the confirm URL big and clear; poll until the user confirms.
// 7. On confirm, keep both processes running until Ctrl-C.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = (process.env.SMOOTHRECORD_APP || "https://smoothrecord.lovable.app").replace(/\/$/, "");
const NAME = process.env.SMOOTHRECORD_WORKER_NAME || `${process.env.USER || "my"}'s Computer`;
const PORT = Number(process.env.PORT || (30000 + Math.floor(Math.random() * 20000)));
const WORKER_TOKEN = randomBytes(24).toString("hex");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function color(code, s) { return `\x1b[${code}m${s}\x1b[0m`; }
const green = (s) => color(32, s);
const bold = (s) => color("1", s);
const dim = (s) => color(2, s);

// ---------- 1. spawn worker ----------
console.log(dim(`[smoothrecord] Starting worker on 127.0.0.1:${PORT} ...`));
const worker = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: { ...process.env, PORT: String(PORT), WORKER_TOKEN, HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
worker.stdout.on("data", (d) => process.stdout.write(dim(`[worker] ${d}`)));
worker.stderr.on("data", (d) => process.stderr.write(dim(`[worker] ${d}`)));

// wait for /healthz
async function waitForWorker() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (r.ok) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("worker did not come up in 30s");
}
await waitForWorker();
console.log(green("[smoothrecord] Worker is up."));

// ---------- 2. spawn cloudflared quick tunnel ----------
console.log(dim("[smoothrecord] Starting Cloudflare tunnel ..."));
const cloudflaredBin = process.env.CLOUDFLARED_BIN || "cloudflared";
const cf = spawn(cloudflaredBin, ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], {
  stdio: ["ignore", "pipe", "pipe"],
});

const tunnelUrl = await new Promise((resolve, reject) => {
  let buf = "";
  const timer = setTimeout(() => reject(new Error("cloudflared did not print a URL in 45s")), 45000);
  const scan = (chunk) => {
    buf += chunk.toString();
    const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) { clearTimeout(timer); resolve(m[0]); }
  };
  cf.stdout.on("data", scan);
  cf.stderr.on("data", scan);
  cf.on("exit", (c) => reject(new Error(`cloudflared exited with code ${c}`)));
});
console.log(green(`[smoothrecord] Tunnel ready: ${tunnelUrl}`));

// ---------- 3. pair with control plane ----------
async function startPairing() {
  const r = await fetch(`${APP}/api/public/v1/pair/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerName: NAME, workerToken: WORKER_TOKEN, workerUrl: tunnelUrl }),
  });
  if (!r.ok) throw new Error(`pair/start failed [${r.status}]: ${await r.text()}`);
  return r.json();
}
const pairing = await startPairing();

console.log("");
console.log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
console.log(bold("  Almost done. Open this link and click ") + bold(green("Confirm")) + bold(":"));
console.log("");
console.log("    " + bold(green(pairing.confirmUrl)));
console.log("");
console.log(bold(`  Pairing code: ${pairing.code}   (expires in 15 min)`));
console.log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
console.log("");

// ---------- 4. poll until confirmed ----------
async function pollStatus() {
  const r = await fetch(pairing.pollUrl);
  if (!r.ok) throw new Error(`poll failed [${r.status}]`);
  return r.json();
}

const startedAt = Date.now();
let confirmed = false;
while (Date.now() - startedAt < 15 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const s = await pollStatus();
    if (s.status === "confirmed") { confirmed = true; break; }
    if (s.status === "denied" || s.status === "expired") {
      console.error(color(31, `[smoothrecord] Pairing ${s.status}. Exiting.`));
      cleanup(1);
    }
  } catch (e) {
    console.error(dim(`[smoothrecord] poll error: ${e.message}`));
  }
}
if (!confirmed) { console.error(color(31, "[smoothrecord] Pairing timed out.")); cleanup(1); }

console.log(green("✓ Paired. Your worker is now online in SmoothRecord."));
console.log(dim("Leave this terminal open. Ctrl-C to stop."));

// ---------- 5. cleanup ----------
function cleanup(code = 0) {
  try { worker.kill(); } catch { /* noop */ }
  try { cf.kill(); } catch { /* noop */ }
  process.exit(code);
}
process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
