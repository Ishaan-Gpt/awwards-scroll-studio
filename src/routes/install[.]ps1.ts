// Windows PowerShell one-command installer.
// Same dual-path logic as install.sh (WORKER_NPM_PACKAGE preferred, WORKER_TARBALL_URL fallback).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/install.ps1")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const appUrl = new URL(request.url).origin;
        const npmPkg = process.env.WORKER_NPM_PACKAGE ?? "";
        const tarUrl = process.env.WORKER_TARBALL_URL ?? "";

        const SCRIPT = `# SmoothRecord — Windows installer
$ErrorActionPreference = "Stop"
$AppUrl = if ($env:SMOOTHRECORD_APP) { $env:SMOOTHRECORD_APP } else { "${appUrl}" }
$InstallDir = if ($env:SMOOTHRECORD_HOME) { $env:SMOOTHRECORD_HOME } else { "$env:USERPROFILE\\.smoothrecord" }
$NpmPkg = "${npmPkg}"
$TarUrl = "${tarUrl}"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  SmoothRecord — installing worker" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error "winget not found. Update Windows 10/11 App Installer from the Microsoft Store, then re-run."
    exit 1
}

$needNode = $true
if (Get-Command node -ErrorAction SilentlyContinue) {
    $v = (node -v).TrimStart('v').Split('.')[0]
    if ([int]$v -ge 20) { $needNode = $false }
}
if ($needNode) {
    Write-Host "→ Installing Node.js LTS..." -ForegroundColor Yellow
    winget install --silent --accept-source-agreements --accept-package-agreements OpenJS.NodeJS.LTS
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "→ Installing cloudflared..." -ForegroundColor Yellow
    winget install --silent --accept-source-agreements --accept-package-agreements Cloudflare.cloudflared
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

$env:SMOOTHRECORD_APP = $AppUrl

if ($NpmPkg -ne "") {
    Write-Host "→ Launching $NpmPkg via npx..." -ForegroundColor Yellow
    npx --yes $NpmPkg pair
} elseif ($TarUrl -ne "") {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Set-Location $InstallDir
    if (-not (Test-Path "package.json")) {
        Write-Host "→ Downloading worker source..." -ForegroundColor Yellow
        $tar = Join-Path $InstallDir "worker.tar.gz"
        Invoke-WebRequest -Uri $TarUrl -OutFile $tar
        tar -xzf $tar --strip-components=1
        Remove-Item $tar
    }
    Write-Host "→ Installing dependencies (Chromium ~1 min)..." -ForegroundColor Yellow
    npm install --omit=dev
    Write-Host ""; Write-Host "✓ Ready. Starting pairing..." -ForegroundColor Green; Write-Host ""
    node src/pair.js
} else {
    Write-Error "This app is not fully configured yet — no worker source URL set. Contact the app owner."
    exit 1
}
`;
        return new Response(SCRIPT, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=60",
          },
        });
      },
    },
  },
});
