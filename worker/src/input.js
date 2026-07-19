import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import unzipper from "unzipper";

/**
 * Normalize any input to a URL the browser can visit.
 * Returns { url, cleanup? }.
 */
export async function prepareInput(input, workDir) {
  await fs.mkdir(workDir, { recursive: true });
  if (input.type === "url") return { url: input.url };
  if (input.type === "html") return serveDirWithHtml(input.html, workDir);
  if (input.type === "zip") {
    const dir = await downloadAndUnzip(input.zipUrl, workDir);
    return serveDir(await resolveWebRoot(dir));
  }
  if (input.type === "repo") {
    const cloneDir = path.join(workDir, "repo");
    await gitClone(input.gitUrl, cloneDir, input.branch);
    const buildRoot = await buildRepo(cloneDir, input.buildCmd, input.outputDir);
    return serveDir(buildRoot);
  }
  throw new Error(`Unknown input type`);
}

async function serveDirWithHtml(html, workDir) {
  const dir = path.join(workDir, "html");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), html);
  return serveDir(dir);
}

async function serveDir(dir) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      let filePath = path.join(dir, url);
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat?.isDirectory() || url === "/") filePath = path.join(filePath, "index.html");
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    cleanup: () => new Promise((r) => server.close(() => r())),
  };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

async function downloadAndUnzip(zipUrl, workDir) {
  const zipPath = path.join(workDir, "site.zip");
  const res = await fetch(zipUrl);
  if (!res.ok) throw new Error(`Failed to download zip: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), (await import("node:fs")).createWriteStream(zipPath));
  const outDir = path.join(workDir, "unzipped");
  await fs.mkdir(outDir, { recursive: true });
  await new Promise((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: outDir }))
      .on("close", resolve)
      .on("error", reject);
  });
  return outDir;
}

async function resolveWebRoot(dir) {
  // Prefer dist/ or out/ if it contains index.html; otherwise find nearest index.html.
  for (const candidate of ["dist", "out", "build", "public", "."]) {
    const p = path.join(dir, candidate);
    try {
      await fs.access(path.join(p, "index.html"));
      return p;
    } catch {}
  }
  // Fall back: walk and find first index.html.
  const found = await findIndex(dir);
  if (found) return path.dirname(found);
  return dir;
}

async function findIndex(dir, depth = 0) {
  if (depth > 4) return null;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.isFile() && e.name === "index.html") return path.join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
      const r = await findIndex(path.join(dir, e.name), depth + 1);
      if (r) return r;
    }
  }
  return null;
}

async function gitClone(url, dir, branch) {
  const args = ["clone", "--depth", "1"];
  if (branch) args.push("--branch", branch);
  args.push(url, dir);
  await run("git", args, { timeout: 60_000 });
}

async function buildRepo(dir, buildCmd, outputDir) {
  const pkgPath = path.join(dir, "package.json");
  let pkg = null;
  try { pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")); } catch {}
  if (!pkg) {
    // No package.json — treat as plain static site.
    return await resolveWebRoot(dir);
  }
  await run("npm", ["install", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: dir, timeout: 180_000 });
  const cmd = buildCmd || (pkg.scripts?.build ? "npm run build" : null);
  if (cmd) {
    const [c, ...rest] = cmd.split(" ");
    await run(c, rest, { cwd: dir, timeout: 240_000 });
  }
  if (outputDir) return path.join(dir, outputDir);
  return await resolveWebRoot(dir);
}

function run(cmd, args, { cwd, timeout = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit" });
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} timed out`));
    }, timeout);
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("exit", (code) => {
      clearTimeout(t);
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`));
    });
  });
}
