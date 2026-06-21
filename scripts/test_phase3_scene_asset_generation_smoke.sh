#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESEARCH_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_research_and_script.json"
STORYBOARD_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_storyboard_and_prompts.json"
ASSET_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_asset_generation.json"
DB_CONTAINER="${DB_CONTAINER:-n8n-insta-postgres}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n-insta}"
DB_USER="${DB_USER:-n8n_insta}"
DB_NAME="${DB_NAME:-n8n_insta}"
PG_CREDENTIAL_NAME="${PG_CREDENTIAL_NAME:-Postgres account}"
KEEP_FIXTURES="${KEEP_FIXTURES:-false}"
TMP_DIR="$(mktemp -d)"
TEST_SLUG="tmp-phase3-scene-assets-$(date +%Y%m%d-%H%M%S)"
TEST_TITLE="The Village That Returned When the Reservoir Fell"
TEST_CONTENT_ID=""

info() {
  printf '[test_phase3_scene_asset_generation_smoke] %s\n' "$*"
}

fail() {
  printf '[test_phase3_scene_asset_generation_smoke] ERROR: %s\n' "$*" >&2
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
  queued_rows="$(psql_query "select content_id, slug, status from content_items where status in ('script_complete', 'storyboarding', 'storyboard_complete', 'generating_assets') order by updated_at asc;")"
  if [[ -n "$queued_rows" ]]; then
    fail "Found existing script/storyboard/asset queue rows. Clear them before running this smoke test:\n$queued_rows"
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
set nodes = \$phase3nodes\$$runtime_nodes\$phase3nodes\$::json,
    connections = \$phase3connections\$$runtime_connections\$phase3connections\$::json,
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
      40,
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
    fail "Failed to seed the temporary Phase 3 content item."
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

assert_research_result() {
  local row
  row="$(psql_query "select ci.status, coalesce(s.generation_model, ''), jsonb_array_length(s.onscreen_text_json) from content_items ci join scripts s on s.content_id = ci.content_id where ci.content_id = '$TEST_CONTENT_ID'::uuid;")"
  [[ -n "$row" ]] || fail "Research workflow did not create a scripts row for $TEST_CONTENT_ID."
  IFS=$'\t' read -r content_status generation_model onscreen_lines <<<"$row"
  [[ "$content_status" == "script_complete" ]] || fail "Expected content status script_complete after research, got $content_status."
  [[ -n "$generation_model" ]] || fail "generation_model is empty after research."
  [[ "${onscreen_lines:-0}" -ge 1 ]] || fail "onscreen_text_json is empty after research."
}

assert_storyboard_result() {
  local row
  row="$(psql_query "select ci.status, jsonb_array_length(sb.storyboard_json), coalesce(sb.cover_prompt, '') from content_items ci join storyboards sb on sb.content_id = ci.content_id where ci.content_id = '$TEST_CONTENT_ID'::uuid;")"
  [[ -n "$row" ]] || fail "Storyboard workflow did not create a storyboards row for $TEST_CONTENT_ID."
  IFS=$'\t' read -r content_status scene_count cover_prompt <<<"$row"
  [[ "$content_status" == "storyboard_complete" ]] || fail "Expected content status storyboard_complete after storyboard, got $content_status."
  [[ "${scene_count:-0}" -ge 4 ]] || fail "Expected at least 4 storyboard scenes, got ${scene_count:-0}."
  [[ -n "$cover_prompt" ]] || fail "cover_prompt is empty after storyboard."
}

assert_asset_result() {
  local row
  row="$(psql_query "select ci.status, count(*)::int, min(a.scene_number), max(a.scene_number), min(coalesce(a.storage_url, '')), min(coalesce(a.mime_type, '')), min(coalesce(a.provider, '')) from content_items ci join assets a on a.content_id = ci.content_id and a.asset_role = 'scene_image' where ci.content_id = '$TEST_CONTENT_ID'::uuid group by ci.status;")"
  [[ -n "$row" ]] || fail "Asset workflow did not create scene_image asset rows for $TEST_CONTENT_ID."
  IFS=$'\t' read -r content_status asset_count min_scene max_scene min_storage_url min_mime_type min_provider <<<"$row"
  [[ "$content_status" == "assets_ready" ]] || fail "Expected content status assets_ready after scene asset generation, got $content_status."
  [[ "${asset_count:-0}" -ge 4 ]] || fail "Expected at least 4 scene assets, got ${asset_count:-0}."
  [[ "${min_scene:-0}" -ge 1 ]] || fail "scene_number values are invalid."
  [[ "${max_scene:-0}" -ge "${asset_count:-0}" ]] || fail "scene_number range does not match generated scene count."
  [[ -n "$min_storage_url" ]] || fail "storage_url is empty on at least one scene asset."
  [[ -n "$min_mime_type" ]] || fail "mime_type is empty on at least one scene asset."
  [[ -n "$min_provider" ]] || fail "provider is empty on at least one scene asset."

  local run_row
  run_row="$(psql_query "select run_status, coalesce(details_json->>'generation_model', ''), coalesce(details_json->>'rehost_provider', ''), jsonb_array_length(details_json->'scene_asset_generation'->'scenes') from workflow_runs where content_id = '$TEST_CONTENT_ID'::uuid and workflow_name = 'wf_asset_generation' order by started_at desc limit 1;")"
  [[ -n "$run_row" ]] || fail "wf_asset_generation did not write a workflow_runs row."
  IFS=$'\t' read -r run_status generation_model rehost_provider scene_count_logged <<<"$run_row"
  [[ "$run_status" == "success" ]] || fail "Expected wf_asset_generation workflow_runs status success, got $run_status."
  [[ -n "$generation_model" ]] || fail "workflow_runs.details_json.generation_model is empty."
  [[ -n "$rehost_provider" ]] || fail "workflow_runs.details_json.rehost_provider is empty."
  [[ "${scene_count_logged:-0}" -ge 4 ]] || fail "workflow_runs scene asset log is missing scenes."
}

print_summary() {
  info "Temporary content_id: $TEST_CONTENT_ID"
  info "Temporary slug: $TEST_SLUG"
  psql_query "select ci.status, count(*)::int, min(a.provider), min(a.mime_type) from content_items ci join assets a on a.content_id = ci.content_id and a.asset_role = 'scene_image' where ci.content_id = '$TEST_CONTENT_ID'::uuid group by ci.status;" | awk -F'\t' '
    {
      printf "[test_phase3_scene_asset_generation_smoke] Final state: content_status=%s scene_assets=%s provider=%s mime_type=%s\n",
        $1, $2, $3, $4
    }
  '
}

RESEARCH_ID=""
STORYBOARD_ID=""
ASSET_ID=""

info "Checking the Phase 3 queue is clear before the smoke test"
ensure_queue_is_clear

info "Ensuring wf_research_and_script, wf_storyboard_and_prompts, and wf_asset_generation are imported into n8n"
RESEARCH_ID="$(ensure_workflow_id "wf_research_and_script" "/workflows/n8n/wf_research_and_script.json")"
STORYBOARD_ID="$(ensure_workflow_id "wf_storyboard_and_prompts" "/workflows/n8n/wf_storyboard_and_prompts.json")"
ASSET_ID="$(ensure_workflow_id "wf_asset_generation" "/workflows/n8n/wf_asset_generation.json")"

info "Syncing the imported workflows to the current git-tracked exports and binding the local Postgres credential"
sync_runtime_workflow "$RESEARCH_ID" "$RESEARCH_WORKFLOW_PATH"
sync_runtime_workflow "$STORYBOARD_ID" "$STORYBOARD_WORKFLOW_PATH"
sync_runtime_workflow "$ASSET_ID" "$ASSET_WORKFLOW_PATH"

info "Seeding one temporary approved topic"
seed_content_item

info "Running wf_research_and_script inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$RESEARCH_ID" "wf_research_and_script" "$TMP_DIR/research_execution.json"
assert_research_result

info "Running wf_storyboard_and_prompts inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$STORYBOARD_ID" "wf_storyboard_and_prompts" "$TMP_DIR/storyboard_execution.json"
assert_storyboard_result

info "Running wf_asset_generation inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$ASSET_ID" "wf_asset_generation" "$TMP_DIR/asset_execution.json"
assert_asset_result

print_summary

if [[ "$KEEP_FIXTURES" == "true" ]]; then
  info "KEEP_FIXTURES=true so the temporary content row was left in place."
fi
