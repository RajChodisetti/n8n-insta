#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESEARCH_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_research_and_script.json"
STORYBOARD_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_storyboard_and_prompts.json"
ASSET_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_asset_generation.json"
NARRATION_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_narration_generation.json"
RENDER_MANIFEST_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_render_manifest_construction.json"
RENDER_DISPATCH_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_render_worker_dispatch.json"
RENDER_CALLBACK_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_render_status_callback.json"
CAPTION_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_caption_and_hashtags.json"
REEL_PUBLISH_WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_instagram_reel_publish.json"
DB_CONTAINER="${DB_CONTAINER:-n8n-insta-postgres}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n-insta}"
RENDER_WORKER_CONTAINER="${RENDER_WORKER_CONTAINER:-n8n-insta-render-worker}"
DB_USER="${DB_USER:-n8n_insta}"
DB_NAME="${DB_NAME:-n8n_insta}"
PG_CREDENTIAL_NAME="${PG_CREDENTIAL_NAME:-Postgres account}"
KEEP_FIXTURES="${KEEP_FIXTURES:-true}"
RESET_EXISTING="${RESET_EXISTING:-false}"
RENDER_WAIT_SECONDS="${RENDER_WAIT_SECONDS:-300}"
TMP_DIR="$(mktemp -d)"
TEST_SLUG="tmp-phase3-live-reel-$(date +%Y%m%d-%H%M%S)"
TEST_TITLE="The Monastery That Returned When the Reservoir Fell Silent"
TEST_CONTENT_ID=""

info() {
  printf '[prepare_phase3_live_reel_candidate] %s\n' "$*"
}

fail() {
  printf '[prepare_phase3_live_reel_candidate] ERROR: %s\n' "$*" >&2
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
  queued_rows="$(psql_query "select ci.content_id, ci.slug, ci.status, coalesce(p.publish_status, '<none>') from content_items ci left join publishes p on p.content_id = ci.content_id where ci.status in ('script_complete', 'storyboarding', 'storyboard_complete', 'generating_assets', 'assets_ready', 'generating_narration', 'narration_ready', 'building_render_manifest', 'render_manifest_ready', 'dispatching_render', 'render_queued', 'render_complete', 'render_failed') order by ci.updated_at asc;")"
  if [[ -n "$queued_rows" ]]; then
    if [[ "$RESET_EXISTING" == "true" ]]; then
      info "RESET_EXISTING=true so existing tmp-phase3-live-reel candidates will be deleted before preparing a new one"
      psql_query "delete from content_items where slug like 'tmp-phase3-live-reel-%';" >/dev/null
      queued_rows="$(psql_query "select ci.content_id, ci.slug, ci.status, coalesce(p.publish_status, '<none>') from content_items ci left join publishes p on p.content_id = ci.content_id where ci.status in ('script_complete', 'storyboarding', 'storyboard_complete', 'generating_assets', 'assets_ready', 'generating_narration', 'narration_ready', 'building_render_manifest', 'render_manifest_ready', 'dispatching_render', 'render_queued', 'render_complete', 'render_failed') order by ci.updated_at asc;")"
    fi
  fi

  if [[ -n "$queued_rows" ]]; then
    fail "Found existing Phase 3 queue rows that could be claimed by the live-reel prep flow. Either continue with the current candidate, delete it manually, or rerun with RESET_EXISTING=true.\n$queued_rows"
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
set nodes = \$phase3livenodes\$$runtime_nodes\$phase3livenodes\$::json,
    connections = \$phase3liveconnections\$$runtime_connections\$phase3liveconnections\$::json,
    "updatedAt" = now()
where id = '$workflow_id';
SQL
}

activate_workflow() {
  local workflow_id="$1"
  docker exec "$N8N_CONTAINER" n8n update:workflow --id="$workflow_id" --active=true >/dev/null
}

restart_n8n_service() {
  docker restart "$N8N_CONTAINER" >/dev/null
}

recreate_live_render_runtime() {
  info "Recreating n8n and render-worker with live webhook render settings"
  (
    cd "$ROOT_DIR"
    RENDER_WORKER_MODE=webhook \
    RENDER_WORKER_URL=http://render-worker:8080/render \
    RENDER_CALLBACK_URL=http://n8n:5678/webhook/render-status-callback \
    docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n render-worker >/dev/null
  )
}

wait_for_worker_health() {
  local attempts=30
  local index
  for ((index = 1; index <= attempts; index += 1)); do
    if docker exec "$RENDER_WORKER_CONTAINER" python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health').read()" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  fail "render-worker did not become healthy after recreation."
}

wait_for_callback_webhook_registration() {
  local workflow_id="$1"
  local attempts=30
  local index
  local count
  for ((index = 1; index <= attempts; index += 1)); do
    count="$(psql_query "select count(*) from webhook_entity where \"workflowId\" = '$workflow_id' and method = 'POST' and \"webhookPath\" = 'render-status-callback';")"
    if [[ "${count:-0}" -ge 1 ]]; then
      return 0
    fi
    sleep 2
  done
  fail "wf_render_status_callback is marked active but its production webhook is not registered in webhook_entity."
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
      '{\"source_notes\":[\"Entire monasteries and churches have been submerged after dam and reservoir construction in parts of Europe and Asia.\",\"When drought or water drawdown exposes foundations, towers, and roads, these sites often reappear dramatically.\",\"The visual return of these structures usually becomes a local memory story about displacement, loss, and time.\"],\"source_urls\":[\"https://en.wikipedia.org/wiki/Submerged_village\"]}'::jsonb,
      'idea_approved',
      now(),
      '2000-01-01 00:00:00+00',
      '2000-01-01 00:00:00+00'
    )
    returning content_id;"
  )"

  if [[ -z "$TEST_CONTENT_ID" ]]; then
    fail "Failed to seed the temporary Phase 3 live-reel content item."
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

wait_for_render_completion() {
  local waited=0
  local row
  while (( waited < RENDER_WAIT_SECONDS )); do
    row="$(psql_query "select ci.status, coalesce(r.render_status, ''), coalesce(r.output_video_url, ''), coalesce(r.resolution, ''), coalesce(r.render_log, '') from content_items ci join renders r on r.content_id = ci.content_id where ci.content_id = '$TEST_CONTENT_ID'::uuid;")"
    if [[ -n "$row" ]]; then
      IFS=$'\t' read -r content_status render_status output_video_url resolution render_log <<<"$row"
      if [[ "$content_status" == "render_complete" && "$render_status" == "success" && -n "$output_video_url" ]]; then
        return 0
      fi
      if [[ "$content_status" == "render_failed" || "$render_status" == "failed" ]]; then
        fail "Render worker callback marked the live reel as failed. Latest render_log: ${render_log:-<empty>}"
      fi
    fi
    sleep 5
    waited=$((waited + 5))
  done
  fail "Timed out waiting ${RENDER_WAIT_SECONDS}s for render_complete. Check wf_render_status_callback activity and docker logs for $RENDER_WORKER_CONTAINER."
}

assert_caption_result() {
  local row
  row="$(psql_query "select ci.status, r.render_status, coalesce(r.output_video_url, ''), coalesce(r.cover_image_url, ''), coalesce(r.resolution, ''), coalesce(p.publish_status, ''), length(coalesce(p.caption_final, '')), length(coalesce(p.hashtags_final, '')) from content_items ci join renders r on r.content_id = ci.content_id left join publishes p on p.content_id = ci.content_id where ci.content_id = '$TEST_CONTENT_ID'::uuid;")"
  if [[ -z "$row" ]]; then
    fail "Could not inspect the final live-reel candidate state for $TEST_CONTENT_ID."
  fi

  IFS=$'\t' read -r content_status render_status output_video_url cover_image_url resolution publish_status caption_length hashtag_length <<<"$row"
  [[ "$content_status" == "render_complete" ]] || fail "Expected content status render_complete after worker callback, got $content_status."
  [[ "$render_status" == "success" ]] || fail "Expected render_status success after worker callback, got $render_status."
  [[ -n "$output_video_url" ]] || fail "output_video_url is empty after render completion."
  [[ "$output_video_url" =~ ^https?:// ]] || fail "output_video_url is not public: $output_video_url"
  [[ "$output_video_url" =~ \.mp4($|[?#]) ]] || fail "output_video_url is not an MP4 URL: $output_video_url"
  [[ -n "$cover_image_url" ]] || fail "cover_image_url is empty after render completion."
  [[ -n "$resolution" ]] || fail "resolution is empty after render completion."
  [[ "$publish_status" == "draft" ]] || fail "Expected publish_status draft after caption workflow, got $publish_status."
  [[ "${caption_length:-0}" -ge 40 ]] || fail "caption_final looks too short after caption workflow."
  [[ "${hashtag_length:-0}" -ge 8 ]] || fail "hashtags_final looks too short after caption workflow."
}

print_summary() {
  info "Temporary content_id: $TEST_CONTENT_ID"
  info "Temporary slug: $TEST_SLUG"
  psql_query "select ci.status, r.render_status, coalesce(r.output_video_url, ''), coalesce(p.publish_status, ''), coalesce(length(p.caption_final), 0), coalesce(length(p.hashtags_final), 0) from content_items ci join renders r on r.content_id = ci.content_id left join publishes p on p.content_id = ci.content_id where ci.content_id = '$TEST_CONTENT_ID'::uuid;" | awk -F'\t' '
    {
      printf "[prepare_phase3_live_reel_candidate] Final state: content_status=%s render_status=%s output_video_url=%s publish_status=%s caption_length=%s hashtag_length=%s\n",
        $1, $2, $3, $4, $5, $6
    }
  '
  info "Candidate is ready for manual review and live publish via wf_instagram_reel_publish."
}

RESEARCH_ID=""
STORYBOARD_ID=""
ASSET_ID=""
NARRATION_ID=""
RENDER_MANIFEST_ID=""
RENDER_DISPATCH_ID=""
RENDER_CALLBACK_ID=""
CAPTION_ID=""
REEL_PUBLISH_ID=""

info "Checking the live-reel pipeline queue is clear before preparing a controlled candidate"
ensure_queue_is_clear

recreate_live_render_runtime
wait_for_worker_health

info "Ensuring the required workflows are imported into n8n"
RESEARCH_ID="$(ensure_workflow_id "wf_research_and_script" "/workflows/n8n/wf_research_and_script.json")"
STORYBOARD_ID="$(ensure_workflow_id "wf_storyboard_and_prompts" "/workflows/n8n/wf_storyboard_and_prompts.json")"
ASSET_ID="$(ensure_workflow_id "wf_asset_generation" "/workflows/n8n/wf_asset_generation.json")"
NARRATION_ID="$(ensure_workflow_id "wf_narration_generation" "/workflows/n8n/wf_narration_generation.json")"
RENDER_MANIFEST_ID="$(ensure_workflow_id "wf_render_manifest_construction" "/workflows/n8n/wf_render_manifest_construction.json")"
RENDER_DISPATCH_ID="$(ensure_workflow_id "wf_render_worker_dispatch" "/workflows/n8n/wf_render_worker_dispatch.json")"
RENDER_CALLBACK_ID="$(ensure_workflow_id "wf_render_status_callback" "/workflows/n8n/wf_render_status_callback.json")"
CAPTION_ID="$(ensure_workflow_id "wf_caption_and_hashtags" "/workflows/n8n/wf_caption_and_hashtags.json")"
REEL_PUBLISH_ID="$(ensure_workflow_id "wf_instagram_reel_publish" "/workflows/n8n/wf_instagram_reel_publish.json")"

info "Syncing the imported workflows to the current git-tracked exports and binding the local Postgres credential"
sync_runtime_workflow "$RESEARCH_ID" "$RESEARCH_WORKFLOW_PATH"
sync_runtime_workflow "$STORYBOARD_ID" "$STORYBOARD_WORKFLOW_PATH"
sync_runtime_workflow "$ASSET_ID" "$ASSET_WORKFLOW_PATH"
sync_runtime_workflow "$NARRATION_ID" "$NARRATION_WORKFLOW_PATH"
sync_runtime_workflow "$RENDER_MANIFEST_ID" "$RENDER_MANIFEST_WORKFLOW_PATH"
sync_runtime_workflow "$RENDER_DISPATCH_ID" "$RENDER_DISPATCH_WORKFLOW_PATH"
sync_runtime_workflow "$RENDER_CALLBACK_ID" "$RENDER_CALLBACK_WORKFLOW_PATH"
sync_runtime_workflow "$CAPTION_ID" "$CAPTION_WORKFLOW_PATH"
sync_runtime_workflow "$REEL_PUBLISH_ID" "$REEL_PUBLISH_WORKFLOW_PATH"

info "Activating wf_render_status_callback so the worker can post back to the production webhook"
activate_workflow "$RENDER_CALLBACK_ID"
info "Restarting n8n so the active render callback webhook is registered"
restart_n8n_service
info "Waiting for render-status-callback to appear in n8n's registered webhook table"
wait_for_callback_webhook_registration "$RENDER_CALLBACK_ID"

info "Seeding one temporary approved topic for the manual live-reel path"
seed_content_item

info "Running wf_research_and_script inline"
run_workflow_inline "$RESEARCH_ID" "wf_research_and_script" "$TMP_DIR/research_execution.json"
info "Running wf_storyboard_and_prompts inline"
run_workflow_inline "$STORYBOARD_ID" "wf_storyboard_and_prompts" "$TMP_DIR/storyboard_execution.json"
info "Running wf_asset_generation inline"
run_workflow_inline "$ASSET_ID" "wf_asset_generation" "$TMP_DIR/asset_generation_execution.json"
info "Running wf_narration_generation inline"
run_workflow_inline "$NARRATION_ID" "wf_narration_generation" "$TMP_DIR/narration_execution.json"
info "Running wf_render_manifest_construction inline"
run_workflow_inline "$RENDER_MANIFEST_ID" "wf_render_manifest_construction" "$TMP_DIR/render_manifest_execution.json"
info "Running wf_render_worker_dispatch inline"
run_workflow_inline "$RENDER_DISPATCH_ID" "wf_render_worker_dispatch" "$TMP_DIR/render_dispatch_execution.json"
info "Waiting for render-worker to finish FFmpeg assembly and callback into wf_render_status_callback"
wait_for_render_completion
info "Running wf_caption_and_hashtags inline so the rendered reel has a live publish draft"
run_workflow_inline "$CAPTION_ID" "wf_caption_and_hashtags" "$TMP_DIR/caption_execution.json"
assert_caption_result

print_summary

if [[ "$KEEP_FIXTURES" == "true" ]]; then
  info "KEEP_FIXTURES=true so the temporary content row was left in place."
fi
