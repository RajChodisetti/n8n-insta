#!/usr/bin/env bash
# Refreshes the Instagram Graph API long-lived token and hot-reloads n8n.
# Run manually, via start.sh, or via the LaunchAgent every 5 days.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS_DIR="${REPO_ROOT}/logs"
LOG_FILE="${LOGS_DIR}/token-refresh.log"

mkdir -p "$LOGS_DIR"

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  printf '[%s] [auto_refresh_instagram_token] %s\n' "$ts" "$*" | tee -a "$LOG_FILE"
}

log "Starting token refresh cycle"

# --- Token exchange ---
if ! bash "${REPO_ROOT}/scripts/exchange_instagram_long_lived_token.sh" 2>&1 | tee -a "$LOG_FILE"; then
  log "ERROR: exchange_instagram_long_lived_token.sh failed — aborting without touching containers"
  exit 1
fi

log "Token written to .env — hot-reloading n8n and studio-ui"

# --- Recreate containers that carry the token in their env ---
cd "${REPO_ROOT}/infra"

CONTAINERS_TO_RELOAD=(n8n studio-ui)
RUNNING=()
for svc in "${CONTAINERS_TO_RELOAD[@]}"; do
  container="n8n-insta-${svc}"
  if docker ps --format '{{.Names}}' | grep -qx "$container"; then
    RUNNING+=("$svc")
  fi
done

if [[ ${#RUNNING[@]} -eq 0 ]]; then
  log "No target containers are running — .env is up to date for next 'docker compose up'"
else
  log "Force-recreating: ${RUNNING[*]}"
  docker compose up -d --force-recreate "${RUNNING[@]}" 2>&1 | tee -a "$LOG_FILE"
  log "Containers restarted with the new token"
fi

log "Token refresh cycle complete"
