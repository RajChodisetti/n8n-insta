#!/usr/bin/env bash
# Entry point for starting the full n8n-insta stack.
# Refreshes the Instagram token before bringing containers up so n8n always
# starts with a fresh long-lived token.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '[start] %s\n' "$*"
}

# --- Refresh token (soft failure: warn but continue) ---
log "Refreshing Instagram Graph API token before stack start..."
if bash "${REPO_ROOT}/scripts/auto_refresh_instagram_token.sh"; then
  log "Token refresh succeeded"
else
  log "WARNING: Token refresh failed — starting with the existing token in .env"
fi

# --- Bring up the full stack ---
log "Starting stack..."
cd "${REPO_ROOT}/infra"
docker compose up -d "$@"
log "Stack is up. n8n: http://localhost:35678"
