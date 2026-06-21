#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESEARCH_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_research_and_script.json"
STORYBOARD_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_storyboard_and_prompts.json"
ASSET_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_asset_generation.json"
NARRATION_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_narration_generation.json"
RENDER_MANIFEST_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_render_manifest_construction.json"
DB_CONTAINER="${DB_CONTAINER:-n8n-insta-postgres}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n-insta}"
DB_USER="${DB_USER:-n8n_insta}"
DB_NAME="${DB_NAME:-n8n_insta}"
PG_CREDENTIAL_NAME="${PG_CREDENTIAL_NAME:-Postgres account}"
KEEP_FIXTURES="${KEEP_FIXTURES:-false}"
TMP_DIR="$(mktemp -d)"
TEST_SLUG="tmp-phase3-render-manifest-$(date +%Y%m%d-%H%M%S)"
TEST_TITLE="The Lighthouse That Returned with the Tide"
TEST_CONTENT_ID=""

info() {
  printf '[test_phase3_render_manifest_smoke] %s\n' "$*"
}

fail() {
  printf '[test_phase3_render_manifest_smoke] ERROR: %s\n' "$*" >&2
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
  queued_rows="$(psql_query "select content_id, slug, status from content_items where status in ('script_complete', 'storyboarding', 'storyboard_complete', 'generating_assets', 'assets_ready', 'generating_narration', 'narration_ready', 'building_render_manifest') order by updated_at asc;")"
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
set nodes = \$phase3rendernodes\$$runtime_nodes\$phase3rendernodes\$::json,
    connections = \$phase3renderconnections\$$runtime_connections\$phase3renderconnections\$::json,
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
    fail "Failed to seed the temporary Phase 3 render-manifest content item."
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

assert_render_manifest_result() {
  local row
  row="$(psql_query "select ci.status, r.render_status, r.resolution, r.aspect_ratio, coalesce(r.duration_seconds, 0), coalesce(r.cover_image_url, ''), jsonb_array_length(r.render_manifest_json->'scenes'), jsonb_array_length(r.render_manifest_json->'timeline') from content_items ci join renders r on r.content_id = ci.content_id where ci.content_id = '$TEST_CONTENT_ID'::uuid;")"
  [[ -n "$row" ]] || fail "Render manifest workflow did not create a renders row for $TEST_CONTENT_ID."
  IFS=$'\t' read -r content_status render_status resolution aspect_ratio duration_seconds cover_image_url scene_count timeline_count <<<"$row"
  [[ "$content_status" == "render_manifest_ready" ]] || fail "Expected content status render_manifest_ready after render manifest construction, got $content_status."
  [[ "$render_status" == "manifest_ready" ]] || fail "Expected render_status manifest_ready, got $render_status."
  [[ -n "$resolution" ]] || fail "resolution is empty in renders row."
  [[ "$aspect_ratio" == "9:16" ]] || fail "Expected aspect_ratio 9:16, got $aspect_ratio."
  [[ "$(printf '%.0f' "$duration_seconds")" -ge 1 ]] || fail "duration_seconds looks too small in renders row."
  [[ -n "$cover_image_url" ]] || fail "cover_image_url is empty in renders row."
  [[ "${scene_count:-0}" -ge 4 ]] || fail "render_manifest_json.scenes is missing scenes."
  [[ "${timeline_count:-0}" -ge 4 ]] || fail "render_manifest_json.timeline is missing scenes."

  local run_row
  run_row="$(psql_query "select run_status, jsonb_typeof(details_json->'render_manifest'), coalesce((details_json->'render_manifest'->>'scene_count'), ''), coalesce((details_json->'render_manifest'->>'cover_image_url'), '') from workflow_runs where content_id = '$TEST_CONTENT_ID'::uuid and workflow_name = 'wf_render_manifest_construction' order by started_at desc limit 1;")"
  [[ -n "$run_row" ]] || fail "wf_render_manifest_construction did not write a workflow_runs row."
  IFS=$'\t' read -r run_status render_manifest_type scene_count_logged cover_image_logged <<<"$run_row"
  [[ "$run_status" == "success" ]] || fail "Expected wf_render_manifest_construction workflow_runs status success, got $run_status."
  [[ "$render_manifest_type" == "object" ]] || fail "workflow_runs.details_json.render_manifest is not an object."
  [[ "${scene_count_logged:-0}" -ge 4 ]] || fail "workflow_runs render manifest summary is missing scene_count."
  [[ -n "$cover_image_logged" ]] || fail "workflow_runs render manifest summary is missing cover_image_url."
}

print_summary() {
  info "Temporary content_id: $TEST_CONTENT_ID"
  info "Temporary slug: $TEST_SLUG"
  psql_query "select ci.status, r.render_status, r.resolution, r.aspect_ratio, coalesce(r.duration_seconds, 0) from content_items ci join renders r on r.content_id = ci.content_id where ci.content_id = '$TEST_CONTENT_ID'::uuid;" | awk -F'\t' '
    {
      printf "[test_phase3_render_manifest_smoke] Final state: content_status=%s render_status=%s resolution=%s aspect_ratio=%s duration_seconds=%s\n",
        $1, $2, $3, $4, $5
    }
  '
}

RESEARCH_ID=""
STORYBOARD_ID=""
ASSET_ID=""
NARRATION_ID=""
RENDER_MANIFEST_ID=""

info "Checking the render-manifest queue is clear before the smoke test"
ensure_queue_is_clear

info "Ensuring the required Phase 3 workflows are imported into n8n"
RESEARCH_ID="$(ensure_workflow_id "wf_research_and_script" "/workflows/n8n/wf_research_and_script.json")"
STORYBOARD_ID="$(ensure_workflow_id "wf_storyboard_and_prompts" "/workflows/n8n/wf_storyboard_and_prompts.json")"
ASSET_ID="$(ensure_workflow_id "wf_asset_generation" "/workflows/n8n/wf_asset_generation.json")"
NARRATION_ID="$(ensure_workflow_id "wf_narration_generation" "/workflows/n8n/wf_narration_generation.json")"
RENDER_MANIFEST_ID="$(ensure_workflow_id "wf_render_manifest_construction" "/workflows/n8n/wf_render_manifest_construction.json")"

info "Syncing the imported workflows to the current git-tracked exports and binding the local Postgres credential"
sync_runtime_workflow "$RESEARCH_ID" "$RESEARCH_WORKFLOW_PATH"
sync_runtime_workflow "$STORYBOARD_ID" "$STORYBOARD_WORKFLOW_PATH"
sync_runtime_workflow "$ASSET_ID" "$ASSET_WORKFLOW_PATH"
sync_runtime_workflow "$NARRATION_ID" "$NARRATION_WORKFLOW_PATH"
sync_runtime_workflow "$RENDER_MANIFEST_ID" "$RENDER_MANIFEST_WORKFLOW_PATH"

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

info "Running wf_render_manifest_construction inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$RENDER_MANIFEST_ID" "wf_render_manifest_construction" "$TMP_DIR/render_manifest_execution.json"
assert_render_manifest_result

print_summary

if [[ "$KEEP_FIXTURES" == "true" ]]; then
  info "KEEP_FIXTURES=true so the temporary content row was left in place."
fi
