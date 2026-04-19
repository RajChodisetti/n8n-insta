#!/usr/bin/env bash
set -uo pipefail

if [[ -z "${INSTAGRAM_GRAPH_API_TOKEN:-}" ]]; then
  echo "ERROR: INSTAGRAM_GRAPH_API_TOKEN is not set." >&2
  echo "Set it in your shell or .env.local before running this script." >&2
  exit 1
fi

API_VERSION="${GRAPH_API_VERSION:-v25.0}"
BASE_URL="https://graph.facebook.com/${API_VERSION}"
TOKEN="${INSTAGRAM_GRAPH_API_TOKEN}"

call_api() {
  local path="$1"
  if ! response="$(curl -sS --get "${BASE_URL}/${path}" --data-urlencode "access_token=${TOKEN}" 2>&1)"; then
    jq -n --arg path "$path" --arg err "$response" \
      '{error: {message: ("Network/API call failed for " + $path + ": " + $err)}}'
    return 0
  fi

  echo "$response"
}

print_section() {
  echo
  echo "=== $1 ==="
}

print_section "Token validity check (/me)"
me_response="$(call_api 'me?fields=id,name')"
echo "$me_response" | jq '.'

if echo "$me_response" | jq -e '.error' >/dev/null; then
  echo "WARN: /me call returned an error."
else
  echo "OK: /me call succeeded."
fi

print_section "Permissions check (/me/permissions)"
perm_response="$(call_api 'me/permissions')"
echo "$perm_response" | jq '.'

if echo "$perm_response" | jq -e '.error' >/dev/null; then
  echo "WARN: /me/permissions call returned an error."
else
  echo "OK: /me/permissions call succeeded."
  granted_scopes="$(echo "$perm_response" | jq -r '.data[]? | select(.status=="granted") | .permission' | tr '\n' ' ')"
  declined_scopes="$(echo "$perm_response" | jq -r '.data[]? | select(.status!="granted") | .permission + ":" + .status' | tr '\n' ' ')"

  echo "Granted scopes: ${granted_scopes:-<none>}"
  echo "Non-granted scopes: ${declined_scopes:-<none>}"
fi

print_section "Page linkage check (/me/accounts)"
accounts_response="$(call_api 'me/accounts?fields=id,name,access_token')"
echo "$accounts_response" | jq '{data: [.data[]? | {id, name}], paging, error}'

if echo "$accounts_response" | jq -e '.error' >/dev/null; then
  echo "WARN: /me/accounts call returned an error."
else
  pages_count="$(echo "$accounts_response" | jq '.data | length')"
  echo "OK: /me/accounts call succeeded. Linked pages: ${pages_count}."
fi

print_section "Summary"
echo "Use this output to verify whether required permissions are granted for your publishing workflow."
