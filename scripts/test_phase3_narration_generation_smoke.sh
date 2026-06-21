#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESEARCH_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_research_and_script.json"
STORYBOARD_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_storyboard_and_prompts.json"
ASSET_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_asset_generation.json"
NARRATION_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_narration_generation.json"
DB_CONTAINER="${DB_CONTAINER:-n8n-insta-postgres}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n-insta}"
DB_USER="${DB_USER:-n8n_insta}"
DB_NAME="${DB_NAME:-n8n_insta}"
PG_CREDENTIAL_NAME="${PG_CREDENTIAL_NAME:-Postgres account}"
KEEP_FIXTURES="${KEEP_FIXTURES:-false}"
TMP_DIR="$(mktemp -d)"
TEST_SLUG="tmp-phase3-narration-$(date +%Y%m%d-%H%M%S)"
TEST_TITLE="The Church Bells That Rang Beneath the Reservoir"
TEST_CONTENT_ID=""

info() {
  printf '[test_phase3_narration_generation_smoke] %s\n' "$*"
}

fail() {
  printf '[test_phase3_narration_generation_smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$TEST_CONTENT_ID" && "$KEEP_FIXTURES" != "true" ]]; then
    psql_query "delete from content_items where content_id = '$TEST_CONTENT_ID'::uuid;" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

psql_query() {
  local query="$1"
  docker exec -i "$DB_CONTAINER" psql -q -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -At -F $'\t' -c "$query"
}

ensure_queue_is_clear() {
  local queued_rows
  queued_rows="$(psql_query "select content_id, slug, status from content_items where status in ('script_complete', 'storyboarding', 'storyboard_complete', 'generating_assets', 'assets_ready', 'generating_narration') order by updated_at asc;")"
  if [[ -n "$queued_rows" ]]; then
    fail "Found existing Phase 3 queue rows. Clear them before running this smoke test:\n$queued_rows"
  fi
}

ensure_workflow_id() {
  local workflow_name="$1"
  local workflow_file_in_container="$2"
  local workflow_id

  workflow_id="$(psql_query "select id from workflow_entity where name = '$workflow_name' order by \"updatedAt\" desc limit 1;")"
  if [[ -z "$workflow_id" ]]; then
    info "Importing $workflow_name into the running n8n instance" >&2
    docker exec "$N8N_CONTAINER" n8n import:workflow --input="$workflow_file_in_container" >/dev/null
    workflow_id="$(psql_query "select id from workflow_entity where name = '$workflow_name' order by \"updatedAt\" desc limit 1;")"
  fi

  if [[ -z "$workflow_id" ]]; then
    fail "Could not find imported workflow $workflow_name after import."
  fi

  printf '%s\n' "$workflow_id"
}

sync_runtime_workflow() {
  local workflow_id="$1"
  local workflow_file="$2"
  local pg_credential_id
  local runtime_nodes
  local runtime_connections

  pg_credential_id="$(psql_query "select id from credentials_entity where name = '$PG_CREDENTIAL_NAME' order by name limit 1;")"
  if [[ -z "$pg_credential_id" ]]; then
    fail "Could not find runtime Postgres credential named '$PG_CREDENTIAL_NAME'."
  fi

  runtime_nodes="$(
    jq -c --arg cred_id "$pg_credential_id" --arg cred_name "$PG_CREDENTIAL_NAME" '
      (.nodes[] | select(.type == "n8n-nodes-base.postgres").credentials.postgres.id) = $cred_id
      | (.nodes[] | select(.type == "n8n-nodes-base.postgres").credentials.postgres.name) = $cred_name
      | .nodes
    ' "$workflow_file"
  )"
  runtime_connections="$(jq -c '.connections' "$workflow_file")"

  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" <<SQL >/dev/null
update workflow_entity
set nodes = \$phase3narrationnodes\$$runtime_nodes\$phase3narrationnodes\$::json,
    connections = \$phase3narrationconnections\$$runtime_connections\$phase3narrationconnections\$::json,
    "updatedAt" = now()
where id = '$workflow_id';
SQL
}

seed_content_item() {
  TEST_CONTENT_ID="$(
    psql_query "insert into content_items (
      title,
      slug,
      category,
      confidence_label,
      target_duration_seconds,
      brand_profile,
      source_payload_json,
      status,
      approved_at,
      created_at,
      updated_at
    ) values (
      '$TEST_TITLE',
      '$TEST_SLUG',
      'history',
      'likely',
      45,
      'default',
      '{\"source_notes\":[\"Entire villages and churches have been submerged during reservoir construction in several regions.\",\"When water levels drop, stone walls, roads, and church towers can reappear.\",\"These places are often remembered as lost communities rather than only engineering sites.\"],\"source_urls\":[\"https://en.wikipedia.org/wiki/Submerged_village\"]}'::jsonb,
      'idea_approved',
      now(),
      '2000-01-01 00:00:00+00',
      '2000-01-01 00:00:00+00'
    )
    returning content_id;"
  )"

  if [[ -z "$TEST_CONTENT_ID" ]]; then
    fail "Failed to seed the temporary Phase 3 narration content item."
  fi
}

run_workflow_inline() {
  local workflow_id="$1"
  local label="$2"
  local output_path="$3"

  if ! docker exec -e N8N_RUNNERS_ENABLED=false "$N8N_CONTAINER" n8n execute --id="$workflow_id" --rawOutput >"$output_path" 2>&1; then
    cat "$output_path" >&2
    fail "$label failed."
  fi
}

assert_narration_result() {
  local row
  row="$(psql_query "select ci.status, a.provider, coalesce(a.storage_url, ''), coalesce(a.mime_type, ''), coalesce(a.duration_seconds, 0), coalesce(a.metadata_json->>'voice', '') from content_items ci join assets a on a.content_id = ci.content_id and a.asset_role = 'narration_audio' where ci.content_id = '$TEST_CONTENT_ID'::uuid order by a.created_at desc limit 1;")"
  [[ -n "$row" ]] || fail "Narration workflow did not create a narration_audio asset row for $TEST_CONTENT_ID."
  IFS=$'\t' read -r content_status provider storage_url mime_type duration_seconds voice <<<"$row"
  [[ "$content_status" == "narration_ready" ]] || fail "Expected content status narration_ready after narration generation, got $content_status."
  [[ -n "$provider" ]] || fail "provider is empty after narration generation."
  [[ -n "$storage_url" ]] || fail "storage_url is empty after narration generation."
  [[ "$mime_type" == "audio/mpeg" ]] || fail "Expected mime_type audio/mpeg after narration generation, got $mime_type."
  [[ "$(printf '%.0f' "$duration_seconds")" -ge 1 ]] || fail "duration_seconds looks too small after narration generation."
  [[ -n "$voice" ]] || fail "voice is empty in narration metadata."

  local run_row
  run_row="$(psql_query "select run_status, coalesce(details_json->>'generation_model', ''), coalesce(details_json->>'voice', '') from workflow_runs where content_id = '$TEST_CONTENT_ID'::uuid and workflow_name = 'wf_narration_generation' order by started_at desc limit 1;")"
  [[ -n "$run_row" ]] || fail "wf_narration_generation did not write a workflow_runs row."
  IFS=$'\t' read -r run_status generation_model logged_voice <<<"$run_row"
  [[ "$run_status" == "success" ]] || fail "Expected wf_narration_generation workflow_runs status success, got $run_status."
  [[ -n "$generation_model" ]] || fail "workflow_runs.details_json.generation_model is empty."
  [[ -n "$logged_voice" ]] || fail "workflow_runs.details_json.voice is empty."
}

print_summary() {
  info "Temporary content_id: $TEST_CONTENT_ID"
  info "Temporary slug: $TEST_SLUG"
  psql_query "select ci.status, a.provider, a.mime_type, coalesce(a.metadata_json->>'voice', ''), coalesce(a.duration_seconds, 0) from content_items ci join assets a on a.content_id = ci.content_id and a.asset_role = 'narration_audio' where ci.content_id = '$TEST_CONTENT_ID'::uuid order by a.created_at desc limit 1;" | awk -F'\t' '
    {
      printf "[test_phase3_narration_generation_smoke] Final state: content_status=%s provider=%s mime_type=%s voice=%s duration_seconds=%s\n",
        $1, $2, $3, $4, $5
    }
  '
}

RESEARCH_ID=""
STORYBOARD_ID=""
ASSET_ID=""
NARRATION_ID=""

info "Checking the narration queue is clear before the smoke test"
ensure_queue_is_clear

info "Ensuring the required Phase 3 workflows are imported into n8n"
RESEARCH_ID="$(ensure_workflow_id "wf_research_and_script" "/workflows/n8n/wf_research_and_script.json")"
STORYBOARD_ID="$(ensure_workflow_id "wf_storyboard_and_prompts" "/workflows/n8n/wf_storyboard_and_prompts.json")"
ASSET_ID="$(ensure_workflow_id "wf_asset_generation" "/workflows/n8n/wf_asset_generation.json")"
NARRATION_ID="$(ensure_workflow_id "wf_narration_generation" "/workflows/n8n/wf_narration_generation.json")"

info "Syncing the imported workflows to the current git-tracked exports and binding the local Postgres credential"
sync_runtime_workflow "$RESEARCH_ID" "$RESEARCH_WORKFLOW_PATH"
sync_runtime_workflow "$STORYBOARD_ID" "$STORYBOARD_WORKFLOW_PATH"
sync_runtime_workflow "$ASSET_ID" "$ASSET_WORKFLOW_PATH"
sync_runtime_workflow "$NARRATION_ID" "$NARRATION_WORKFLOW_PATH"

info "Seeding one temporary approved topic"
seed_content_item

info "Running wf_research_and_script inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$RESEARCH_ID" "wf_research_and_script" "$TMP_DIR/research_execution.json"

info "Running wf_storyboard_and_prompts inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$STORYBOARD_ID" "wf_storyboard_and_prompts" "$TMP_DIR/storyboard_execution.json"

info "Running wf_asset_generation inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$ASSET_ID" "wf_asset_generation" "$TMP_DIR/asset_execution.json"

info "Running wf_narration_generation inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$NARRATION_ID" "wf_narration_generation" "$TMP_DIR/narration_execution.json"
assert_narration_result

print_summary

if [[ "$KEEP_FIXTURES" == "true" ]]; then
  info "KEEP_FIXTURES=true so the temporary content row was left in place."
fi
