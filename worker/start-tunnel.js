import { spawn, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const TOKEN = (process.env.WORKER_TOKEN || crypto.randomBytes(16).toString("hex")).trim();

// 1. Locate or download cloudflared binary
function getCloudflaredPath() {
  try {
    execSync("cloudflared --version", { stdio: "ignore" });
    return "cloudflared";
  } catch {}

  const isWin = os.platform() === "win32";
  const binName = isWin ? "cloudflared.exe" : "cloudflared";
  const localBin = path.join(__dirname, binName);

  if (fs.existsSync(localBin)) {
    return localBin;
  }

  return null;
}

function downloadCloudflared() {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    const arch = os.arch();
    let file = "";

    if (platform === "win32") {
      file = "cloudflared-windows-amd64.exe";
    } else if (platform === "darwin") {
      file = arch === "arm64" ? "cloudflared-darwin-arm64.tgz" : "cloudflared-darwin-amd64.tgz";
    } else if (platform === "linux") {
      file = arch === "arm64" ? "cloudflared-linux-arm64" : "cloudflared-linux-amd64";
    } else {
      return reject(new Error(`Unsupported platform: ${platform}`));
    }

    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${file}`;
    const targetName = platform === "win32" ? "cloudflared.exe" : "cloudflared";
    const targetPath = path.join(__dirname, targetName);

    console.log(`[SmoothRecord] Downloading cloudflared for ${platform}-${arch}...`);

    const download = (downloadUrl) => {
      https.get(downloadUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return download(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download cloudflared: HTTP ${res.statusCode}`));
        }

        const fileStream = fs.createWriteStream(targetPath);
        res.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close(() => {
            if (platform !== "win32") {
              fs.chmodSync(targetPath, 0o755);
            }
            console.log("[SmoothRecord] cloudflared downloaded successfully.");
            resolve(targetPath);
          });
        });
      }).on("error", reject);
    };

    download(url);
  });
}

async function main() {
  console.log("\n===================================================================");
  console.log("  🚀 SmoothRecord Open-Source Worker & Cloudflare Tunnel Launcher");
  console.log("===================================================================\n");

  let cloudflaredBin = getCloudflaredPath();
  if (!cloudflaredBin) {
    try {
      cloudflaredBin = await downloadCloudflared();
    } catch (err) {
      console.error("[SmoothRecord] Error downloading cloudflared:", err.message);
      process.exit(1);
    }
  }

  console.log("[SmoothRecord] Starting Cloudflare Tunnel...");

  const tunnelProc = spawn(cloudflaredBin, ["tunnel", "--url", `http://localhost:${PORT}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let publicUrl = null;

  const parseUrl = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !publicUrl) {
      publicUrl = match[0];
      bootWorker(publicUrl);
    }
  };

  tunnelProc.stdout.on("data", parseUrl);
  tunnelProc.stderr.on("data", parseUrl);

  tunnelProc.on("exit", (code) => {
    console.error(`[SmoothRecord] Cloudflare Tunnel exited with code ${code}`);
    process.exit(code || 1);
  });
}

function bootWorker(publicUrl) {
  console.log("\n===================================================================");
  console.log("  🟢 WORKER READY & TUNNEL CONNECTED!");
  console.log("===================================================================");
  console.log(`  [1] Public Tunnel URL : ${publicUrl}`);
  console.log(`  [2] Worker Token     : ${TOKEN}`);
  console.log(`  [3] Local Port       : ${PORT}`);
  console.log("-------------------------------------------------------------------");
  console.log("  📋 SET THESE SECRETS IN YOUR LOVABLE APP / WEB UI:");
  console.log(`  WORKER_BASE_URL = ${publicUrl}`);
  console.log(`  WORKER_TOKEN    = ${TOKEN}`);
  console.log("===================================================================\n");

  const serverProc = spawn("node", ["src/server.js"], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(PORT),
      WORKER_TOKEN: TOKEN,
      PUBLIC_BASE_URL: publicUrl,
    },
    stdio: "inherit",
  });

  serverProc.on("exit", (code) => {
    console.error(`[SmoothRecord] Worker server exited with code ${code}`);
    process.exit(code || 1);
  });
}

main();
