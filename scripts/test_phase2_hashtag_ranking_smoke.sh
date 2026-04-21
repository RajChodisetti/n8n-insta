#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAPTION_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_caption_and_hashtags.json"
DB_CONTAINER="${DB_CONTAINER:-n8n-insta-postgres}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n-insta}"
DB_USER="${DB_USER:-n8n_insta}"
DB_NAME="${DB_NAME:-n8n_insta}"
PG_CREDENTIAL_NAME="${PG_CREDENTIAL_NAME:-Postgres account}"
KEEP_FIXTURES="${KEEP_FIXTURES:-false}"
TMP_DIR="$(mktemp -d)"
TEST_SLUG="tmp-phase2-hashtags-$(date +%Y%m%d-%H%M%S)"
TEST_TITLE="The Village That Disappeared Beneath the Reservoir"
TEST_CONTENT_ID=""

info() {
  printf '[test_phase2_hashtag_ranking_smoke] %s\n' "$*"
}

fail() {
  printf '[test_phase2_hashtag_ranking_smoke] ERROR: %s\n' "$*" >&2
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
  queued_rows="$(psql_query "select ci.content_id, ci.slug, ci.status, coalesce(p.publish_status, 'draft') from content_items ci join scripts s on s.content_id = ci.content_id left join publishes p on p.content_id = ci.content_id where ci.status in ('script_complete', 'storyboard_complete', 'assets_ready', 'qa_approved') and coalesce(p.publish_status, 'draft') in ('draft', 'failed') and coalesce(nullif(btrim(coalesce(p.instagram_media_id, '')), ''), '') = '' order by ci.updated_at asc;")"
  if [[ -n "$queued_rows" ]]; then
    fail "Found existing caption/hashtag queue rows. Clear them before running this smoke test:\n$queued_rows"
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
set nodes = \$hashtagnodes\$$runtime_nodes\$hashtagnodes\$::json,
    connections = \$hashtagconnections\$$runtime_connections\$hashtagconnections\$::json,
    "updatedAt" = now()
where id = '$workflow_id';
SQL
}

seed_content_package() {
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
      35,
      'default',
      '{\"source_notes\":[\"Entire villages have been submerged during reservoir construction projects.\",\"Some sites remain visible only during drought or low water periods.\",\"These stories often blend local history with loss, memory, and vanished architecture.\"]}'::jsonb,
      'storyboard_complete',
      now(),
      '2000-01-01 00:00:00+00',
      '2000-01-01 00:00:00+00'
    )
    returning content_id;"
  )"

  if [[ -z "$TEST_CONTENT_ID" ]]; then
    fail "Failed to seed the temporary Phase 2 hashtag ranking content item."
  fi

  psql_query "insert into scripts (
    content_id,
    hook_option_1,
    hook_option_2,
    hook_option_3,
    selected_hook,
    narration_script,
    short_script,
    caption_draft,
    cta_line,
    onscreen_text_json,
    generation_model,
    raw_response_json,
    approved_by_human
  ) values (
    '$TEST_CONTENT_ID'::uuid,
    'A village vanished, but never really disappeared.',
    'The reservoir covered the streets, not the story.',
    'When the water drops, the old village returns.',
    'The reservoir covered the streets, not the story.',
    'When the water level falls, church walls, roads, and house foundations reappear, reminding people that a whole village still exists beneath the reservoir.',
    'A drowned village can reappear when the reservoir drops.',
    'The reservoir covered the streets, but not the story.',
    'Would you visit it if the ruins surfaced again?',
    '[{\"scene_number\":1,\"text\":\"A village went under.\"},{\"scene_number\":2,\"text\":\"Its outline still returns.\"}]'::jsonb,
    'gpt-4o-mini',
    '{}'::jsonb,
    false
  );" >/dev/null

  psql_query "insert into storyboards (
    content_id,
    storyboard_json,
    cover_prompt,
    subtitle_lines_json,
    style_notes,
    render_manifest_seed_json
  ) values (
    '$TEST_CONTENT_ID'::uuid,
    '[{\"scene_number\":1,\"visual_prompt\":\"Submerged village ruins beneath a reservoir at golden hour\"}]'::jsonb,
    'Submerged village ruins beneath calm reservoir water, cinematic history documentary style',
    '[\"The reservoir hid a village, but not its memory.\"]'::jsonb,
    'wistful documentary realism',
    '{}'::jsonb
  );" >/dev/null
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

assert_publish_result() {
  local row
  row="$(psql_query "select p.publish_status, coalesce(p.caption_final, ''), coalesce(p.hashtags_final, '') from publishes p where p.content_id = '$TEST_CONTENT_ID'::uuid;")"

  if [[ -z "$row" ]]; then
    fail "Hashtag ranking workflow did not create a publishes row for $TEST_CONTENT_ID."
  fi

  IFS=$'\t' read -r publish_status caption_final hashtags_final <<<"$row"
  [[ "$publish_status" == "draft" ]] || fail "Expected publish_status draft after workflow, got $publish_status."
  [[ -n "$caption_final" ]] || fail "caption_final is empty after workflow."
  [[ -n "$hashtags_final" ]] || fail "hashtags_final is empty after workflow."
  [[ "$hashtags_final" == *"#"* ]] || fail "hashtags_final does not contain hashtags."
}

assert_workflow_log() {
  local row
  row="$(psql_query "select run_status, coalesce(details_json ->> 'generation_model', ''), coalesce(details_json ->> 'hashtag_selection_rationale', ''), jsonb_typeof(details_json -> 'hashtag_ranking'), jsonb_typeof(details_json -> 'caption_iteration') from workflow_runs where content_id = '$TEST_CONTENT_ID'::uuid and workflow_name = 'wf_caption_and_hashtags' order by started_at desc limit 1;")"

  if [[ -z "$row" ]]; then
    fail "Workflow did not create a workflow_runs entry for $TEST_CONTENT_ID."
  fi

  IFS=$'\t' read -r run_status generation_model hashtag_selection_rationale hashtag_ranking_type caption_iteration_type <<<"$row"
  [[ "$run_status" == "success" ]] || fail "Expected workflow_runs.run_status success, got $run_status."
  [[ -n "$generation_model" ]] || fail "workflow_runs.details_json.generation_model is empty."
  [[ -n "$hashtag_selection_rationale" ]] || fail "workflow_runs.details_json.hashtag_selection_rationale is empty."
  [[ "$hashtag_ranking_type" == "object" ]] || fail "workflow_runs.details_json.hashtag_ranking is not a JSON object."
  [[ "$caption_iteration_type" == "object" ]] || fail "workflow_runs.details_json.caption_iteration is not a JSON object."
}

print_summary() {
  info "Temporary content_id: $TEST_CONTENT_ID"
  info "Temporary slug: $TEST_SLUG"
  info "Hashtag ranking workflow completed successfully."
  psql_query "select p.publish_status, p.hashtags_final, coalesce(wr.details_json ->> 'generation_model', ''), coalesce(wr.details_json ->> 'hashtag_selection_rationale', '') from publishes p join workflow_runs wr on wr.content_id = p.content_id and wr.workflow_name = 'wf_caption_and_hashtags' where p.content_id = '$TEST_CONTENT_ID'::uuid order by wr.started_at desc limit 1;" | awk -F'\t' '
    {
      printf "[test_phase2_hashtag_ranking_smoke] Final state: publish_status=%s hashtags_final=%s generation_model=%s hashtag_selection_rationale=%s\n",
        $1, $2, $3, $4
    }
  '
}

WORKFLOW_ID=""

info "Checking the caption/hashtag queue is clear before the smoke test"
ensure_queue_is_clear

info "Ensuring wf_caption_and_hashtags is imported into n8n"
WORKFLOW_ID="$(ensure_workflow_id "wf_caption_and_hashtags" "/workflows/n8n/wf_caption_and_hashtags.json")"

info "Syncing the imported workflow to the current git-tracked export and binding the local Postgres credential"
sync_runtime_workflow "$WORKFLOW_ID" "$CAPTION_WORKFLOW_PATH"

info "Seeding one temporary storyboard-complete content package"
seed_content_package

info "Running wf_caption_and_hashtags inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$WORKFLOW_ID" "wf_caption_and_hashtags" "$TMP_DIR/hashtag_execution.json"

assert_publish_result
assert_workflow_log
print_summary

if [[ "$KEEP_FIXTURES" == "true" ]]; then
  info "KEEP_FIXTURES=true so the temporary content row was left in place."
fi
