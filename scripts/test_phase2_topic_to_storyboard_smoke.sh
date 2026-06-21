#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESEARCH_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_research_and_script.json"
STORYBOARD_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_storyboard_and_prompts.json"
DB_CONTAINER="${DB_CONTAINER:-n8n-insta-postgres}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n-insta}"
DB_USER="${DB_USER:-n8n_insta}"
DB_NAME="${DB_NAME:-n8n_insta}"
PG_CREDENTIAL_NAME="${PG_CREDENTIAL_NAME:-Postgres account}"
KEEP_FIXTURES="${KEEP_FIXTURES:-false}"
TMP_DIR="$(mktemp -d)"
TEST_SLUG="tmp-phase2-$(date +%Y%m%d-%H%M%S)"
TEST_TITLE="The Disappearance of the Sodder Children"
TEST_CONTENT_ID=""

info() {
  printf '[test_phase2_topic_to_storyboard_smoke] %s\n' "$*"
}

fail() {
  printf '[test_phase2_topic_to_storyboard_smoke] ERROR: %s\n' "$*" >&2
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
  queued_rows="$(psql_query "select content_id, slug, status from content_items where status in ('script_complete', 'storyboarding') order by updated_at asc;")"
  if [[ -n "$queued_rows" ]]; then
    fail "Found existing script/storyboard queue rows. Clear them before running this smoke test:\n$queued_rows"
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
set nodes = \$phase2nodes\$$runtime_nodes\$phase2nodes\$::json,
    connections = \$phase2connections\$$runtime_connections\$phase2connections\$::json,
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
      'mystery',
      'contested',
      45,
      'default',
      '{\"source_notes\":[\"On Christmas Eve 1945, the Sodder family home in West Virginia burned down.\",\"Five children were believed missing, but some family members doubted they died in the fire.\",\"The story remains unresolved and often retold as a mystery rather than a settled fact.\"],\"source_urls\":[\"https://en.wikipedia.org/wiki/Sodder_children_disappearance\"]}'::jsonb,
      'idea_approved',
      now(),
      '2000-01-01 00:00:00+00',
      '2000-01-01 00:00:00+00'
    )
    returning content_id;"
  )"

  if [[ -z "$TEST_CONTENT_ID" ]]; then
    fail "Failed to seed the temporary Phase 2 content item."
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
  row="$(psql_query "select ci.status, coalesce(ci.confidence_label, ''), coalesce(s.generation_model, ''), jsonb_array_length(s.onscreen_text_json)
  from content_items ci
  join scripts s on s.content_id = ci.content_id
  where ci.content_id = '$TEST_CONTENT_ID'::uuid;")"

  if [[ -z "$row" ]]; then
    fail "Research workflow did not create a scripts row for $TEST_CONTENT_ID."
  fi

  IFS=$'\t' read -r content_status confidence_label generation_model onscreen_lines <<<"$row"
  [[ "$content_status" == "script_complete" ]] || fail "Expected content status script_complete after research, got $content_status."
  [[ -n "$confidence_label" ]] || fail "confidence_label is empty after research."
  [[ -n "$generation_model" ]] || fail "generation_model is empty after research."
  [[ "${onscreen_lines:-0}" -ge 1 ]] || fail "onscreen_text_json is empty after research."
}

assert_storyboard_result() {
  local row
  row="$(psql_query "select ci.status, jsonb_array_length(sb.storyboard_json), jsonb_array_length(sb.subtitle_lines_json), coalesce(sb.cover_prompt, '')
  from content_items ci
  join storyboards sb on sb.content_id = ci.content_id
  where ci.content_id = '$TEST_CONTENT_ID'::uuid;")"

  if [[ -z "$row" ]]; then
    fail "Storyboard workflow did not create a storyboards row for $TEST_CONTENT_ID."
  fi

  IFS=$'\t' read -r content_status scene_count subtitle_count cover_prompt <<<"$row"
  [[ "$content_status" == "storyboard_complete" ]] || fail "Expected content status storyboard_complete after storyboard, got $content_status."
  [[ "${scene_count:-0}" -ge 4 ]] || fail "Expected at least 4 storyboard scenes, got ${scene_count:-0}."
  [[ "${subtitle_count:-0}" -ge 1 ]] || fail "Expected at least 1 subtitle line, got ${subtitle_count:-0}."
  [[ -n "$cover_prompt" ]] || fail "cover_prompt is empty after storyboard."
}

print_summary() {
  info "Temporary content_id: $TEST_CONTENT_ID"
  info "Temporary slug: $TEST_SLUG"
  info "Research and storyboard workflows both completed successfully."
  psql_query "select ci.status, ci.confidence_label, s.generation_model, jsonb_array_length(s.onscreen_text_json), jsonb_array_length(sb.storyboard_json), jsonb_array_length(sb.subtitle_lines_json)
  from content_items ci
  join scripts s on s.content_id = ci.content_id
  join storyboards sb on sb.content_id = ci.content_id
  where ci.content_id = '$TEST_CONTENT_ID'::uuid;" | awk -F'\t' '
    {
      printf "[test_phase2_topic_to_storyboard_smoke] Final state: content_status=%s confidence_label=%s generation_model=%s onscreen_lines=%s scene_count=%s subtitle_count=%s\n",
        $1, $2, $3, $4, $5, $6
    }
  '
}

RESEARCH_ID=""
STORYBOARD_ID=""

info "Checking the storyboard queue is clear before the smoke test"
ensure_queue_is_clear

info "Ensuring wf_research_and_script and wf_storyboard_and_prompts are imported into n8n"
RESEARCH_ID="$(ensure_workflow_id "wf_research_and_script" "/workflows/n8n/wf_research_and_script.json")"
STORYBOARD_ID="$(ensure_workflow_id "wf_storyboard_and_prompts" "/workflows/n8n/wf_storyboard_and_prompts.json")"

info "Syncing the imported workflows to the current git-tracked exports and binding the local Postgres credential"
sync_runtime_workflow "$RESEARCH_ID" "$RESEARCH_WORKFLOW_PATH"
sync_runtime_workflow "$STORYBOARD_ID" "$STORYBOARD_WORKFLOW_PATH"

info "Seeding one temporary approved topic"
seed_content_item

info "Running wf_research_and_script inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$RESEARCH_ID" "wf_research_and_script" "$TMP_DIR/research_execution.json"
assert_research_result

info "Running wf_storyboard_and_prompts inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$STORYBOARD_ID" "wf_storyboard_and_prompts" "$TMP_DIR/storyboard_execution.json"
assert_storyboard_result

print_summary

if [[ "$KEEP_FIXTURES" == "true" ]]; then
  info "KEEP_FIXTURES=true so the temporary content row was left in place."
fi
