#!/usr/bin/env bash
# Picket — boot a fresh Linux / WSL box (e.g. ll0dog) to a running instance.
# Idempotent: installs git + Node 22 + pnpm if missing, clones/builds the repo,
# seeds the .env, then runs the backend (or installs a systemd service).
#
#   curl -fsSL https://raw.githubusercontent.com/Ch-i/picket/main/bootstrap.sh | bash
#   # or, from a clone:        ./bootstrap.sh            (run in foreground)
#   #                          ./bootstrap.sh --service  (install + enable systemd)
#
# Box specs: x86_64/arm64 Linux or WSL2 (Ubuntu/Debian), ~2 GB RAM, outbound HTTPS.
set -euo pipefail

REPO="${PICKET_REPO:-https://github.com/Ch-i/picket.git}"
DIR="${PICKET_DIR:-$HOME/picket}"
MODE="${1:-run}"

log() { printf '\033[36m[picket]\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
SUDO=""; [ "$(id -u)" -ne 0 ] && have sudo && SUDO="sudo"

# 1. git
have git || { log "installing git"; $SUDO apt-get update -y && $SUDO apt-get install -y git curl ca-certificates; }

# 2. Node 22 (NodeSource) if absent or < 20
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v//;s/\..*//' || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  log "installing Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi

# 3. pnpm via corepack (pinned by the repo's packageManager field)
corepack enable >/dev/null 2>&1 || $SUDO corepack enable

# 4. clone or update
if [ -d "$DIR/.git" ]; then
  log "updating $DIR"; git -C "$DIR" pull --ff-only
else
  log "cloning into $DIR"; git clone "$REPO" "$DIR"
fi
cd "$DIR"

# 5. build everything
log "installing deps"; pnpm install --frozen-lockfile
log "building packages + web app"; pnpm build && pnpm --filter picket-web build

# 6. seed .env (secrets stay on this box)
if [ ! -f packages/backend/.env ]; then
  cp packages/backend/.env.example packages/backend/.env
  log "created packages/backend/.env — add ANTHROPIC_API_KEY for live mode"
fi

# 7. run, or install a service
if [ "$MODE" = "--service" ]; then
  UNIT=/etc/systemd/system/picket.service
  log "installing $UNIT"
  $SUDO tee "$UNIT" >/dev/null <<UNITEOF
[Unit]
Description=Picket — pfSense IDS/IPS console
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$DIR
EnvironmentFile=-$DIR/packages/backend/.env
ExecStart=$(command -v node) $DIR/packages/backend/dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNITEOF
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now picket
  log "picket service started — $(systemctl is-active picket). Logs: journalctl -u picket -f"
else
  log "starting Picket on :${PICKET_PORT:-8200}  (Ctrl-C to stop)"
  exec pnpm serve
fi
