// Windows PowerShell one-command installer.
// Same dual-path logic as install.sh (WORKER_NPM_PACKAGE preferred, WORKER_TARBALL_URL fallback).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/install.ps1")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const appUrl = new URL(request.url).origin;
        const npmPkg = process.env.WORKER_NPM_PACKAGE || "@ishaan_gpt/smoothrecord-worker";
        const tarUrl = process.env.WORKER_TARBALL_URL ?? "";

        const SCRIPT = `# SmoothRecord - Windows installer
$ErrorActionPreference = "Stop"
$AppUrl = if ($env:SMOOTHRECORD_APP) { $env:SMOOTHRECORD_APP } else { "${appUrl}" }
$InstallDir = if ($env:SMOOTHRECORD_HOME) { $env:SMOOTHRECORD_HOME } else { "$env:USERPROFILE\\.smoothrecord" }
$NpmPkg = "${npmPkg}"
$TarUrl = "${tarUrl}"

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + (Get-Location).Path
}

function Resolve-Cloudflared {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $known = @(
        "$env:LOCALAPPDATA\\Microsoft\\WinGet\\Packages\\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\\cloudflared.exe",
        "$env:ProgramFiles\\cloudflared\\cloudflared.exe",
        "$env:ProgramFiles(x86)\\cloudflared\\cloudflared.exe",
        "$env:USERPROFILE\\cloudflared.exe",
        ".\\cloudflared.exe"
    )
    foreach ($p in $known) { if ($p -and (Test-Path $p)) { return (Resolve-Path $p).Path } }
    return $null
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  SmoothRecord - installing worker" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
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
    Write-Host "Installing Node.js LTS..." -ForegroundColor Yellow
    winget install --silent --accept-source-agreements --accept-package-agreements OpenJS.NodeJS.LTS
    Refresh-Path
}

$CloudflaredPath = Resolve-Cloudflared
if (-not $CloudflaredPath) {
    Write-Host "Installing cloudflared..." -ForegroundColor Yellow
    winget install --silent --accept-source-agreements --accept-package-agreements Cloudflare.cloudflared
    Refresh-Path
    $CloudflaredPath = Resolve-Cloudflared
}
if (-not $CloudflaredPath) {
    Write-Error "cloudflared installed, but this PowerShell session cannot find it yet. Close PowerShell, open it again, and re-run this command."
    exit 1
}

$env:SMOOTHRECORD_APP = $AppUrl
$env:CLOUDFLARED_BIN = $CloudflaredPath

if ($NpmPkg -ne "") {
    Write-Host "Launching $NpmPkg via npx..." -ForegroundColor Yellow
    npx --yes --package $NpmPkg smoothrecord-pair
} elseif ($TarUrl -ne "") {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Set-Location $InstallDir
    if (-not (Test-Path "worker/package.json")) {
        Write-Host "Downloading worker source..." -ForegroundColor Yellow
        $tar = Join-Path $InstallDir "worker.tar.gz"
        Invoke-WebRequest -Uri $TarUrl -OutFile $tar
        tar -xzf $tar --strip-components=1
        Remove-Item $tar
    }
    Set-Location worker
    Write-Host "Installing dependencies (Chromium ~1 min)..." -ForegroundColor Yellow
    npm install --omit=dev
    Write-Host ""; Write-Host "Ready. Starting pairing..." -ForegroundColor Green; Write-Host ""
    node src/pair.js
} else {
    Write-Error "This app is not fully configured yet - no worker source URL set. Contact the app owner."
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
