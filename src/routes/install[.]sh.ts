// Serves the macOS/Linux one-command installer script.
// Two install paths, selected at runtime by env config:
//   • WORKER_NPM_PACKAGE  → `npx <pkg> pair` (option 2)
//   • WORKER_TARBALL_URL  → curl + tar   (option 1, Git Sync)
// If both are set, npm wins. If neither, the script errors clearly.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/install.sh")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const appUrl = new URL(request.url).origin;
        const npmPkg = process.env.WORKER_NPM_PACKAGE ?? "";
        const tarUrl = process.env.WORKER_TARBALL_URL ?? "";

        const SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

APP_URL="\${SMOOTHRECORD_APP:-${appUrl}}"
INSTALL_DIR="\${SMOOTHRECORD_HOME:-$HOME/.smoothrecord}"
NPM_PKG="${npmPkg}"
TAR_URL="${tarUrl}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SmoothRecord — installing worker"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# --- Homebrew (macOS) ---
if [[ "$(uname -s)" == "Darwin" ]] && ! command -v brew >/dev/null 2>&1; then
  echo "→ Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# --- Node.js 20+ ---
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  echo "→ Installing Node.js 20..."
  if command -v brew >/dev/null 2>&1; then brew install node@20 && brew link --overwrite --force node@20
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
  else echo "!! Install Node 20+ from https://nodejs.org, then re-run." && exit 1; fi
fi

# --- cloudflared ---
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "→ Installing cloudflared..."
  if command -v brew >/dev/null 2>&1; then brew install cloudflare/cloudflare/cloudflared
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared \$(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
    sudo apt-get update && sudo apt-get install -y cloudflared
  else echo "!! Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads" && exit 1; fi
fi

# --- Run worker ---
if [[ -n "$NPM_PKG" ]]; then
  echo "→ Launching \${NPM_PKG} via npx..."
  SMOOTHRECORD_APP="$APP_URL" npx --yes "$NPM_PKG" pair
elif [[ -n "$TAR_URL" ]]; then
  mkdir -p "$INSTALL_DIR"; cd "$INSTALL_DIR"
  if [[ ! -f package.json ]]; then
    echo "→ Downloading worker source..."
    curl -fsSL "$TAR_URL" | tar -xz --strip-components=1
  fi
  echo "→ Installing dependencies (Chromium download ~1 min)..."
  npm install --omit=dev
  echo ""; echo "✓ Ready. Starting pairing..."; echo ""
  SMOOTHRECORD_APP="$APP_URL" node src/pair.js
else
  echo "!! This app is not fully configured yet — no worker source URL set."
  echo "   Contact the app owner."
  exit 1
fi
`;
        return new Response(SCRIPT, {
          headers: {
            "Content-Type": "text/x-shellscript; charset=utf-8",
            "Cache-Control": "public, max-age=60",
          },
        });
      },
    },
  },
});
