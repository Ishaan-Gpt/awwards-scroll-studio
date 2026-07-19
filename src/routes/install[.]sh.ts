// Serves the macOS/Linux one-command installer script.
// The script it prints:
//   1. Ensures Node.js 20+ (via Homebrew if missing on macOS).
//   2. Ensures cloudflared (via Homebrew).
//   3. Downloads and unpacks the worker source tarball hosted at /download/smoothrecord-worker.tar.gz
//   4. `npm install` (which also runs `playwright install chromium`).
//   5. `node src/pair.js` — the pairing script, which prints the confirm URL.
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

APP_URL="\${SMOOTHRECORD_APP:-https://smoothrecord.lovable.app}"
INSTALL_DIR="\${SMOOTHRECORD_HOME:-$HOME/.smoothrecord}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SmoothRecord — installing worker on this Mac"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# --- Homebrew (macOS only) ---
if [[ "$(uname -s)" == "Darwin" ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "→ Installing Homebrew (needed to install Node.js + cloudflared)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
fi

# --- Node.js 20+ ---
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  echo "→ Installing Node.js 20..."
  if command -v brew >/dev/null 2>&1; then brew install node@20 && brew link --overwrite --force node@20
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
  else echo "!! Please install Node.js 20+ manually: https://nodejs.org" && exit 1; fi
fi

# --- cloudflared ---
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "→ Installing cloudflared..."
  if command -v brew >/dev/null 2>&1; then brew install cloudflare/cloudflare/cloudflared
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared \$(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
    sudo apt-get update && sudo apt-get install -y cloudflared
  else echo "!! Please install cloudflared manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads" && exit 1; fi
fi

# --- worker source ---
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
if [[ ! -f "package.json" ]]; then
  echo "→ Downloading worker..."
  curl -fsSL "$APP_URL/download/smoothrecord-worker.tar.gz" | tar -xz --strip-components=1
fi
echo "→ Installing worker dependencies (this may take a minute — playwright fetches Chromium)..."
npm install --omit=dev

echo ""
echo "✓ Setup complete. Starting pairing..."
echo ""
SMOOTHRECORD_APP="$APP_URL" node src/pair.js
`;

export const Route = createFileRoute("/install.sh")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SCRIPT, {
          headers: {
            "Content-Type": "text/x-shellscript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        }),
    },
  },
});
