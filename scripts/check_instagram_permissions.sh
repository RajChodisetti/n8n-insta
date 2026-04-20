#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
N8N_CONTAINER_NAME="${N8N_CONTAINER_NAME:-n8n-insta}"
REQUIRED_SCOPES=("instagram_basic" "instagram_content_publish" "pages_show_list")

read_env_value() {
  local key="$1"
  local file="$2"

  if [[ ! -f "$file" ]]; then
    return 1
  fi

  awk -F= -v key="$key" '$1 == key { sub($1 "=",""); print; exit }' "$file"
}

fingerprint_token() {
  local token="$1"

  if [[ -z "$token" ]]; then
    echo "missing"
    return
  fi

  printf "%s" "$token" | shasum -a 256 | awk '{print substr($1, 1, 12)}'
}

print_section() {
  echo
  echo "=== $1 ==="
}

FILE_TOKEN="$(read_env_value "INSTAGRAM_GRAPH_API_TOKEN" "$ENV_FILE" || true)"
FILE_GRAPH_API_VERSION="$(read_env_value "GRAPH_API_VERSION" "$ENV_FILE" || true)"
SHELL_TOKEN="${INSTAGRAM_GRAPH_API_TOKEN:-}"
SHELL_GRAPH_API_VERSION="${GRAPH_API_VERSION:-}"

if [[ -z "${FILE_TOKEN:-}" ]]; then
  echo "ERROR: INSTAGRAM_GRAPH_API_TOKEN is not set." >&2
  echo "Set it in the repo-root .env or export it in your shell before running this script." >&2
  exit 1
fi

API_VERSION="${FILE_GRAPH_API_VERSION:-v25.0}"
BASE_URL="https://graph.facebook.com/${API_VERSION}"
TOKEN="${FILE_TOKEN}"
TOKEN_FP="$(fingerprint_token "$TOKEN")"
VALIDATION_FAILED=0

call_api() {
  local path="$1"
  if ! response="$(curl -sS --get "${BASE_URL}/${path}" --data-urlencode "access_token=${TOKEN}" 2>&1)"; then
    jq -n --arg path "$path" --arg err "$response" \
      '{error: {message: ("Network/API call failed for " + $path + ": " + $err)}}'
    return 0
  fi

  echo "$response"
}

print_section "Token source"
echo "Repo .env token present: yes"
echo "Repo .env token length: ${#TOKEN}"
echo "Repo .env token fingerprint: ${TOKEN_FP}"
echo "Graph API version: ${API_VERSION}"
if [[ -n "${SHELL_TOKEN:-}" ]]; then
  shell_token_fp="$(fingerprint_token "$SHELL_TOKEN")"
  echo "Shell env token present: yes"
  echo "Shell env token fingerprint: ${shell_token_fp}"
  echo "Shell env GRAPH_API_VERSION: ${SHELL_GRAPH_API_VERSION:-<empty>}"
  if [[ "${shell_token_fp}" != "${TOKEN_FP}" ]]; then
    echo "WARN: exported INSTAGRAM_GRAPH_API_TOKEN differs from the repo-root .env."
    echo "Ad hoc curl commands that use \${INSTAGRAM_GRAPH_API_TOKEN} will test a different token."
  fi
fi

print_section "n8n container token check"
if docker ps --format '{{.Names}}' | grep -qx "${N8N_CONTAINER_NAME}"; then
  container_state="$(docker exec "${N8N_CONTAINER_NAME}" node -e "const crypto=require('crypto'); const token=(process.env.INSTAGRAM_GRAPH_API_TOKEN||'').trim(); const fp=token?crypto.createHash('sha256').update(token).digest('hex').slice(0,12):'missing'; console.log([(token ? 'true' : 'false'), token.length, fp, process.env.GRAPH_API_VERSION || ''].join('|'))")"
  IFS='|' read -r container_present container_length container_fp container_graph_api_version <<< "${container_state}"

  echo "n8n container token present: ${container_present}"
  echo "n8n container token length: ${container_length}"
  echo "n8n container token fingerprint: ${container_fp}"
  echo "n8n container GRAPH_API_VERSION: ${container_graph_api_version:-<empty, workflow will use v25.0 fallback>}"

  if [[ "${container_fp}" == "${TOKEN_FP}" ]]; then
    echo "OK: n8n is using the same token as the repo-root .env."
  else
    echo "WARN: n8n is not using the same token as the repo-root .env."
    echo "Run: docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n"
    VALIDATION_FAILED=1
  fi
else
  echo "WARN: n8n container '${N8N_CONTAINER_NAME}' is not running, so runtime token sync was not checked."
fi

print_section "Token validity check (/me)"
me_response="$(call_api 'me?fields=id,name')"
echo "$me_response" | jq '.'

if echo "$me_response" | jq -e '.error' >/dev/null; then
  echo "WARN: /me call returned an error."
  VALIDATION_FAILED=1
else
  echo "OK: /me call succeeded."
fi

print_section "Permissions check (/me/permissions)"
perm_response="$(call_api 'me/permissions')"
echo "$perm_response" | jq '.'

if echo "$perm_response" | jq -e '.error' >/dev/null; then
  echo "WARN: /me/permissions call returned an error."
  VALIDATION_FAILED=1
else
  echo "OK: /me/permissions call succeeded."
  granted_scopes="$(echo "$perm_response" | jq -r '.data[]? | select(.status=="granted") | .permission' | tr '\n' ' ')"
  declined_scopes="$(echo "$perm_response" | jq -r '.data[]? | select(.status!="granted") | .permission + ":" + .status' | tr '\n' ' ')"

  echo "Granted scopes: ${granted_scopes:-<none>}"
  echo "Non-granted scopes: ${declined_scopes:-<none>}"

  missing_required_scopes=()
  for scope in "${REQUIRED_SCOPES[@]}"; do
    if ! echo "${granted_scopes}" | tr ' ' '\n' | grep -qx "${scope}"; then
      missing_required_scopes+=("${scope}")
    fi
  done

  if [[ "${#missing_required_scopes[@]}" -gt 0 ]]; then
    echo "WARN: Missing required scopes: ${missing_required_scopes[*]}"
    VALIDATION_FAILED=1
  else
    echo "OK: Required publish scopes are present."
  fi
fi

print_section "Page linkage check (/me/accounts)"
accounts_response="$(call_api 'me/accounts?fields=id,name,access_token')"
echo "$accounts_response" | jq '{data: [.data[]? | {id, name}], paging, error}'

if echo "$accounts_response" | jq -e '.error' >/dev/null; then
  echo "WARN: /me/accounts call returned an error."
  VALIDATION_FAILED=1
else
  pages_count="$(echo "$accounts_response" | jq '.data | length')"
  echo "OK: /me/accounts call succeeded. Linked pages: ${pages_count}."
  if [[ "${pages_count}" -eq 0 ]]; then
    echo "WARN: No linked Facebook Pages were returned."
    VALIDATION_FAILED=1
  fi
fi

print_section "Summary"
if [[ "${VALIDATION_FAILED}" -eq 0 ]]; then
  echo "PASS: token is present, n8n is using the same token, and Meta returned publish-ready account data."
else
  echo "FAIL: see warnings above."
  echo "Common causes:"
  echo "- token in .env is expired or invalid"
  echo "- n8n container is still using an older token"
  echo "- required publish scopes are not granted"
  echo "- no Facebook Page is linked for the professional Instagram account"
fi

exit "${VALIDATION_FAILED}"
