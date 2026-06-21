#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
API_VERSION="${GRAPH_API_VERSION:-}"

fail() {
  printf '[exchange_instagram_long_lived_token] ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '[exchange_instagram_long_lived_token] %s\n' "$*"
}

read_env_value() {
  local key="$1"
  local file="$2"
  [[ -f "$file" ]] || return 0
  awk -F= -v key="$key" '$1 == key { sub($1 "=",""); print; exit }' "$file"
}

first_non_empty() {
  for value in "$@"; do
    if [[ -n "${value:-}" ]]; then
      printf '%s\n' "$value"
      return 0
    fi
  done
  return 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

update_env_value() {
  local key="$1"
  local value="$2"
  python3 - "$ENV_FILE" "$key" "$value" <<'PY'
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
lines = env_path.read_text().splitlines() if env_path.exists() else []
updated = False
rendered = []
for line in lines:
    if line.startswith(f"{key}="):
        rendered.append(f"{key}={value}")
        updated = True
    else:
        rendered.append(line)
if not updated:
    rendered.append(f"{key}={value}")
env_path.write_text("\n".join(rendered).rstrip() + "\n")
PY
}

require_command curl
require_command jq
require_command python3

[[ -f "$ENV_FILE" ]] || fail "Could not find repo-root .env at $ENV_FILE"

FILE_TOKEN="$(read_env_value "INSTAGRAM_GRAPH_API_TOKEN" "$ENV_FILE")"
FILE_SHORT_TOKEN="$(read_env_value "SHORT_LIVED_INSTAGRAM_GRAPH_API_TOKEN" "$ENV_FILE")"
FILE_APP_ID="$(read_env_value "FACEBOOK_APP_ID" "$ENV_FILE")"
FILE_APP_SECRET="$(read_env_value "FACEBOOK_APP_SECRET" "$ENV_FILE")"
FILE_META_APP_ID="$(read_env_value "META_APP_ID" "$ENV_FILE")"
FILE_META_APP_SECRET="$(read_env_value "META_APP_SECRET" "$ENV_FILE")"
FILE_GRAPH_API_VERSION="$(read_env_value "GRAPH_API_VERSION" "$ENV_FILE")"

APP_ID="$(first_non_empty "${FACEBOOK_APP_ID:-}" "${META_APP_ID:-}" "$FILE_APP_ID" "$FILE_META_APP_ID" || true)"
APP_SECRET="$(first_non_empty "${FACEBOOK_APP_SECRET:-}" "${META_APP_SECRET:-}" "$FILE_APP_SECRET" "$FILE_META_APP_SECRET" || true)"
SHORT_TOKEN="$(first_non_empty "${SHORT_LIVED_INSTAGRAM_GRAPH_API_TOKEN:-}" "$FILE_SHORT_TOKEN" "${INSTAGRAM_GRAPH_API_TOKEN:-}" "$FILE_TOKEN" || true)"
API_VERSION="$(first_non_empty "$API_VERSION" "$FILE_GRAPH_API_VERSION" "v25.0" || true)"

[[ -n "$APP_ID" ]] || fail "Set FACEBOOK_APP_ID or META_APP_ID in .env before running this script."
[[ -n "$APP_SECRET" ]] || fail "Set FACEBOOK_APP_SECRET or META_APP_SECRET in .env before running this script."
[[ -n "$SHORT_TOKEN" ]] || fail "Set SHORT_LIVED_INSTAGRAM_GRAPH_API_TOKEN or INSTAGRAM_GRAPH_API_TOKEN in .env before running this script."

BASE_URL="https://graph.facebook.com/${API_VERSION}"

info "Exchanging the current short-lived Graph token for a long-lived token via ${API_VERSION}"
exchange_response="$(curl -sS --get "${BASE_URL}/oauth/access_token" \
  --data-urlencode "grant_type=fb_exchange_token" \
  --data-urlencode "client_id=${APP_ID}" \
  --data-urlencode "client_secret=${APP_SECRET}" \
  --data-urlencode "fb_exchange_token=${SHORT_TOKEN}")"

if echo "$exchange_response" | jq -e '.error' >/dev/null 2>&1; then
  fail "$(echo "$exchange_response" | jq -r '.error.message // "Token exchange failed."')"
fi

LONG_LIVED_TOKEN="$(echo "$exchange_response" | jq -r '.access_token // empty')"
EXPIRES_IN="$(echo "$exchange_response" | jq -r '.expires_in // empty')"
[[ -n "$LONG_LIVED_TOKEN" ]] || fail "Meta did not return access_token in the exchange response."

info "Validating the exchanged token with /me and /me/accounts"
me_response="$(curl -sS --get "${BASE_URL}/me" \
  --data-urlencode "fields=id,name" \
  --data-urlencode "access_token=${LONG_LIVED_TOKEN}")"
if echo "$me_response" | jq -e '.error' >/dev/null 2>&1; then
  fail "New token failed /me validation: $(echo "$me_response" | jq -r '.error.message // \"unknown error\"')"
fi

accounts_response="$(curl -sS --get "${BASE_URL}/me/accounts" \
  --data-urlencode "fields=id,name" \
  --data-urlencode "access_token=${LONG_LIVED_TOKEN}")"
if echo "$accounts_response" | jq -e '.error' >/dev/null 2>&1; then
  fail "New token failed /me/accounts validation: $(echo "$accounts_response" | jq -r '.error.message // \"unknown error\"')"
fi

cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
update_env_value "INSTAGRAM_GRAPH_API_TOKEN" "$LONG_LIVED_TOKEN"
if [[ -z "$FILE_SHORT_TOKEN" && -z "${SHORT_LIVED_INSTAGRAM_GRAPH_API_TOKEN:-}" ]]; then
  update_env_value "SHORT_LIVED_INSTAGRAM_GRAPH_API_TOKEN" "$SHORT_TOKEN"
fi

info "Updated INSTAGRAM_GRAPH_API_TOKEN in ${ENV_FILE}"
if [[ -n "$EXPIRES_IN" ]]; then
  info "Meta reported expires_in=${EXPIRES_IN} seconds"
fi
info "Restart the runtime so n8n and the Studio UI pick up the new token:"
printf 'docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n studio-ui\n'
info "Then validate with:"
printf 'bash scripts/check_instagram_permissions.sh\n'
