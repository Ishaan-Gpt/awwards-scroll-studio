// Windows PowerShell one-command installer.
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT = `# SmoothRecord — Windows installer
$ErrorActionPreference = "Stop"
$AppUrl = if ($env:SMOOTHRECORD_APP) { $env:SMOOTHRECORD_APP } else { "https://smoothrecord.lovable.app" }
$InstallDir = if ($env:SMOOTHRECORD_HOME) { $env:SMOOTHRECORD_HOME } else { "$env:USERPROFILE\\.smoothrecord" }

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  SmoothRecord — installing worker on this PC" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# --- winget check ---
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error "winget not found. Update Windows 10/11 App Installer from the Microsoft Store, then re-run."
    exit 1
}

# --- Node.js 20+ ---
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

# --- cloudflared ---
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "→ Installing cloudflared..." -ForegroundColor Yellow
    winget install --silent --accept-source-agreements --accept-package-agreements Cloudflare.cloudflared
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# --- worker source ---
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Set-Location $InstallDir
if (-not (Test-Path "package.json")) {
    Write-Host "→ Downloading worker..." -ForegroundColor Yellow
    $tar = Join-Path $InstallDir "worker.tar.gz"
    Invoke-WebRequest -Uri "$AppUrl/download/smoothrecord-worker.tar.gz" -OutFile $tar
    tar -xzf $tar --strip-components=1
    Remove-Item $tar
}
Write-Host "→ Installing worker dependencies (fetching Chromium, ~1 min)..." -ForegroundColor Yellow
npm install --omit=dev

Write-Host ""
Write-Host "✓ Setup complete. Starting pairing..." -ForegroundColor Green
Write-Host ""
$env:SMOOTHRECORD_APP = $AppUrl
node src/pair.js
`;

export const Route = createFileRoute("/install.ps1")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SCRIPT, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        }),
    },
  },
});
