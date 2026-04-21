#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESEARCH_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_research_and_script.json"
STORYBOARD_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_storyboard_and_prompts.json"
CAPTION_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_caption_and_hashtags.json"
ASSET_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_simple_post_image_asset.json"
APPROVAL_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_content_approval.json"
PUBLISH_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_instagram_simple_post_publish.json"
DB_CONTAINER="${DB_CONTAINER:-n8n-insta-postgres}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n-insta}"
DB_USER="${DB_USER:-n8n_insta}"
DB_NAME="${DB_NAME:-n8n_insta}"
PG_CREDENTIAL_NAME="${PG_CREDENTIAL_NAME:-Postgres account}"
KEEP_FIXTURES="${KEEP_FIXTURES:-true}"
RESET_EXISTING="${RESET_EXISTING:-false}"
TMP_DIR="$(mktemp -d)"
TEST_SLUG="tmp-phase2-live-$(date +%Y%m%d-%H%M%S)"
TEST_TITLE="The Church That Reappears When the Water Recedes"
TEST_CONTENT_ID=""

info() {
  printf '[prepare_phase2_live_post_candidate] %s\n' "$*"
}

fail() {
  printf '[prepare_phase2_live_post_candidate] ERROR: %s\n' "$*" >&2
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
  queued_rows="$(psql_query "select ci.content_id, ci.slug, ci.status, coalesce(p.publish_status, '<none>') from content_items ci left join publishes p on p.content_id = ci.content_id where ci.status in ('script_complete', 'storyboard_complete', 'storyboarding', 'approval_rejected', 'generating_assets', 'approval_pending', 'assets_ready', 'qa_approved') order by ci.updated_at asc;")"
  if [[ -n "$queued_rows" ]]; then
    if [[ "$RESET_EXISTING" == "true" ]]; then
      info "RESET_EXISTING=true so existing tmp-phase2-live candidates will be deleted before preparing a new one"
      psql_query "delete from content_items where slug like 'tmp-phase2-live-%';" >/dev/null
      queued_rows="$(psql_query "select ci.content_id, ci.slug, ci.status, coalesce(p.publish_status, '<none>') from content_items ci left join publishes p on p.content_id = ci.content_id where ci.status in ('script_complete', 'storyboard_complete', 'storyboarding', 'approval_rejected', 'generating_assets', 'approval_pending', 'assets_ready', 'qa_approved') order by ci.updated_at asc;")"
    fi
  fi

  if [[ -n "$queued_rows" ]]; then
    fail "Found existing pipeline rows that could be claimed by the live-candidate prep flow. Either continue with the current candidate, delete it manually, or rerun with RESET_EXISTING=true.\n$queued_rows"
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
set nodes = \$phase2livenodes\$$runtime_nodes\$phase2livenodes\$::json,
    connections = \$phase2liveconnections\$$runtime_connections\$phase2liveconnections\$::json,
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
    fail "Failed to seed the temporary Phase 2 live-post content item."
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

assert_script_result() {
  local row
  row="$(psql_query "select ci.status, coalesce(s.generation_model, ''), jsonb_array_length(s.onscreen_text_json) from content_items ci join scripts s on s.content_id = ci.content_id where ci.content_id = '$TEST_CONTENT_ID'::uuid;")"
  if [[ -z "$row" ]]; then
    fail "Research workflow did not create a scripts row for $TEST_CONTENT_ID."
  fi

  IFS=$'\t' read -r content_status generation_model onscreen_lines <<<"$row"
  [[ "$content_status" == "script_complete" ]] || fail "Expected content status script_complete after research, got $content_status."
  [[ -n "$generation_model" ]] || fail "generation_model is empty after research."
  [[ "${onscreen_lines:-0}" -ge 1 ]] || fail "onscreen_text_json is empty after research."
}

assert_storyboard_result() {
  local row
  row="$(psql_query "select ci.status, jsonb_array_length(sb.storyboard_json), coalesce(sb.cover_prompt, '') from content_items ci join storyboards sb on sb.content_id = ci.content_id where ci.content_id = '$TEST_CONTENT_ID'::uuid;")"
  if [[ -z "$row" ]]; then
    fail "Storyboard workflow did not create a storyboards row for $TEST_CONTENT_ID."
  fi

  IFS=$'\t' read -r content_status scene_count cover_prompt <<<"$row"
  [[ "$content_status" == "storyboard_complete" ]] || fail "Expected content status storyboard_complete after storyboard, got $content_status."
  [[ "${scene_count:-0}" -ge 4 ]] || fail "Expected at least 4 storyboard scenes, got ${scene_count:-0}."
  [[ -n "$cover_prompt" ]] || fail "cover_prompt is empty after storyboard."
}

assert_caption_result() {
  local row
  row="$(psql_query "select coalesce(p.publish_status, ''), length(coalesce(p.caption_final, '')), length(coalesce(p.hashtags_final, '')) from publishes p where p.content_id = '$TEST_CONTENT_ID'::uuid;")"
  if [[ -z "$row" ]]; then
    fail "Caption workflow did not create a publishes row for $TEST_CONTENT_ID."
  fi

  IFS=$'\t' read -r publish_status caption_length hashtag_length <<<"$row"
  [[ "$publish_status" == "draft" ]] || fail "Expected publish_status draft after caption workflow, got $publish_status."
  [[ "${caption_length:-0}" -ge 40 ]] || fail "caption_final looks too short after caption workflow."
  [[ "${hashtag_length:-0}" -ge 8 ]] || fail "hashtags_final looks too short after caption workflow."
}

assert_asset_result() {
  local row
  row="$(psql_query "select ci.status, a.provider, coalesce(a.storage_url, ''), coalesce(a.source_url, ''), coalesce(a.mime_type, ''), a.status, (a.metadata_json ? 'generated_url')::text from content_items ci join assets a on a.content_id = ci.content_id and a.asset_role = 'post_image' where ci.content_id = '$TEST_CONTENT_ID'::uuid order by a.created_at desc limit 1;")"
  if [[ -z "$row" ]]; then
    fail "Asset workflow did not create a post_image asset row for $TEST_CONTENT_ID."
  fi

  IFS=$'\t' read -r content_status provider storage_url source_url mime_type asset_status has_generated_url <<<"$row"
  [[ "$content_status" == "approval_pending" ]] || fail "Expected content status approval_pending after asset generation, got $content_status."
  [[ -n "$provider" ]] || fail "provider is empty after asset generation."
  [[ -n "$storage_url" ]] || fail "storage_url is empty after asset generation."
  [[ -n "$source_url" ]] || fail "source_url is empty after asset generation."
  [[ -n "$mime_type" ]] || fail "mime_type is empty after asset generation."
  [[ "$asset_status" == "ready" ]] || fail "Expected latest post_image asset status ready, got $asset_status."
  [[ "$has_generated_url" == "t" || "$has_generated_url" == "true" ]] || fail "asset metadata_json does not include generated_url."
}

print_summary() {
  info "Temporary content_id: $TEST_CONTENT_ID"
  info "Temporary slug: $TEST_SLUG"
  psql_query "select ci.status, p.publish_status, a.provider, a.storage_url, a.metadata_json->>'generated_url' as generated_url, a.mime_type from content_items ci join publishes p on p.content_id = ci.content_id join assets a on a.content_id = ci.content_id and a.asset_role = 'post_image' where ci.content_id = '$TEST_CONTENT_ID'::uuid order by a.created_at desc limit 1;" | awk -F'\t' '
    {
      printf "[prepare_phase2_live_post_candidate] Final state: content_status=%s publish_status=%s asset_provider=%s delivery_url=%s generated_url=%s mime_type=%s\n",
        $1, $2, $3, $4, $5, $6
    }
  '
  info "Candidate is ready for manual review in wf_content_approval and live publish via wf_instagram_simple_post_publish."
}

RESEARCH_ID=""
STORYBOARD_ID=""
CAPTION_ID=""
ASSET_ID=""
APPROVAL_ID=""
PUBLISH_ID=""

info "Checking the live-post pipeline queue is clear before preparing a controlled candidate"
ensure_queue_is_clear

info "Ensuring the required workflows are imported into n8n"
RESEARCH_ID="$(ensure_workflow_id "wf_research_and_script" "/workflows/n8n/wf_research_and_script.json")"
STORYBOARD_ID="$(ensure_workflow_id "wf_storyboard_and_prompts" "/workflows/n8n/wf_storyboard_and_prompts.json")"
CAPTION_ID="$(ensure_workflow_id "wf_caption_and_hashtags" "/workflows/n8n/wf_caption_and_hashtags.json")"
ASSET_ID="$(ensure_workflow_id "wf_simple_post_image_asset" "/workflows/n8n/wf_simple_post_image_asset.json")"
APPROVAL_ID="$(ensure_workflow_id "wf_content_approval" "/workflows/n8n/wf_content_approval.json")"
PUBLISH_ID="$(ensure_workflow_id "wf_instagram_simple_post_publish" "/workflows/n8n/wf_instagram_simple_post_publish.json")"

info "Syncing the imported workflows to the current git-tracked exports and binding the local Postgres credential"
sync_runtime_workflow "$RESEARCH_ID" "$RESEARCH_WORKFLOW_PATH"
sync_runtime_workflow "$STORYBOARD_ID" "$STORYBOARD_WORKFLOW_PATH"
sync_runtime_workflow "$CAPTION_ID" "$CAPTION_WORKFLOW_PATH"
sync_runtime_workflow "$ASSET_ID" "$ASSET_WORKFLOW_PATH"
sync_runtime_workflow "$APPROVAL_ID" "$APPROVAL_WORKFLOW_PATH"
sync_runtime_workflow "$PUBLISH_ID" "$PUBLISH_WORKFLOW_PATH"

info "Seeding one temporary approved topic for the manual live-post path"
seed_content_item

info "Running wf_research_and_script inline"
run_workflow_inline "$RESEARCH_ID" "wf_research_and_script" "$TMP_DIR/research_execution.json"
assert_script_result

info "Running wf_storyboard_and_prompts inline"
run_workflow_inline "$STORYBOARD_ID" "wf_storyboard_and_prompts" "$TMP_DIR/storyboard_execution.json"
assert_storyboard_result

info "Running wf_caption_and_hashtags inline"
run_workflow_inline "$CAPTION_ID" "wf_caption_and_hashtags" "$TMP_DIR/caption_execution.json"
assert_caption_result

info "Running wf_simple_post_image_asset inline"
run_workflow_inline "$ASSET_ID" "wf_simple_post_image_asset" "$TMP_DIR/asset_execution.json"
assert_asset_result

print_summary

if [[ "$KEEP_FIXTURES" == "true" ]]; then
  info "KEEP_FIXTURES=true so the candidate row was left in place for manual approval and live publish."
fi
