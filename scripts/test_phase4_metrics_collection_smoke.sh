#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_instagram_metrics_collection.json"
DB_CONTAINER="${DB_CONTAINER:-n8n-insta-postgres}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n-insta}"
DB_USER="${DB_USER:-n8n_insta}"
DB_NAME="${DB_NAME:-n8n_insta}"
PG_CREDENTIAL_NAME="${PG_CREDENTIAL_NAME:-Postgres account}"
KEEP_FIXTURES="${KEEP_FIXTURES:-false}"
TMP_DIR="$(mktemp -d)"
TEST_SLUG="tmp-phase4-metrics-$(date +%Y%m%d-%H%M%S)"
TEST_TITLE="Temporary Phase 4 Metrics Snapshot Fixture"
TEST_CONTENT_ID=""

info() {
  printf '[test_phase4_metrics_collection_smoke] %s\n' "$*"
}

fail() {
  printf '[test_phase4_metrics_collection_smoke] ERROR: %s\n' "$*" >&2
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
set nodes = \$phase4metricsnodes\$$runtime_nodes\$phase4metricsnodes\$::json,
    connections = \$phase4metricsconnections\$$runtime_connections\$phase4metricsconnections\$::json,
    "updatedAt" = now()
where id = '$workflow_id';
SQL
}

seed_published_item() {
  psql_query "delete from content_items where slug like 'tmp-phase4-metrics-%';" >/dev/null 2>&1 || true

  TEST_CONTENT_ID="$(
    psql_query "insert into content_items (
      title,
      slug,
      category,
      confidence_label,
      target_duration_seconds,
      brand_profile,
      status,
      published_at,
      created_at,
      updated_at
    ) values (
      '$TEST_TITLE',
      '$TEST_SLUG',
      'history',
      'likely',
      42,
      'default',
      'published',
      '2000-01-02 00:00:00+00',
      '2000-01-01 00:00:00+00',
      '2000-01-01 00:00:00+00'
    )
    returning content_id;"
  )"

  [[ -n "$TEST_CONTENT_ID" ]] || fail "Failed to seed the temporary Phase 4 metrics content item."

  psql_query "insert into publishes (
    content_id,
    platform,
    publish_status,
    caption_final,
    hashtags_final,
    instagram_media_id,
    published_at
  ) values (
    '$TEST_CONTENT_ID'::uuid,
    'instagram',
    'published',
    'Temporary published caption for metrics smoke test',
    '#metrics #smoke',
    '17890000000000001',
    '2000-01-02 00:00:00+00'
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

assert_metrics_snapshot() {
  local row
  row="$(psql_query "select snapshot_window, coalesce(views, 0), coalesce(reach, 0), coalesce(likes, 0), coalesce(comments, 0), coalesce(shares, 0), coalesce(saves, 0), coalesce(engagement_rate, 0), coalesce(raw_payload_json->>'collection_mode', '') from insight_snapshots where content_id = '$TEST_CONTENT_ID'::uuid order by snapshot_taken_at desc limit 1;")"
  [[ -n "$row" ]] || fail "Metrics workflow did not create an insight_snapshots row for $TEST_CONTENT_ID."
  IFS=$'\t' read -r snapshot_window views reach likes comments shares saves engagement_rate collection_mode <<<"$row"
  [[ "$snapshot_window" == "24h" ]] || fail "Expected snapshot_window 24h on first collection, got $snapshot_window."
  [[ "${views:-0}" -ge 1 ]] || fail "views is empty or zero in the latest insight snapshot."
  [[ "${reach:-0}" -ge 1 ]] || fail "reach is empty or zero in the latest insight snapshot."
  [[ "${likes:-0}" -ge 1 ]] || fail "likes is empty or zero in the latest insight snapshot."
  [[ "${comments:-0}" -ge 1 ]] || fail "comments is empty or zero in the latest insight snapshot."
  [[ "${shares:-0}" -ge 1 ]] || fail "shares is empty or zero in the latest insight snapshot."
  [[ "${saves:-0}" -ge 1 ]] || fail "saves is empty or zero in the latest insight snapshot."
  [[ "$(printf '%.0f' "$engagement_rate")" -ge 1 ]] || fail "engagement_rate looks too small in the latest insight snapshot."
  [[ "$collection_mode" == "stub" || "$collection_mode" == "live" ]] || fail "raw_payload_json.collection_mode is empty in the latest insight snapshot."

  local run_row
  run_row="$(psql_query "select run_status, coalesce(details_json->'metrics_collection'->>'snapshot_window', ''), coalesce(details_json->'metrics_collection'->>'collection_mode', ''), coalesce(details_json->'metrics_collection'->>'views', '') from workflow_runs where content_id = '$TEST_CONTENT_ID'::uuid and workflow_name = 'wf_instagram_metrics_collection' order by started_at desc limit 1;")"
  [[ -n "$run_row" ]] || fail "wf_instagram_metrics_collection did not write a workflow_runs row."
  IFS=$'\t' read -r run_status logged_snapshot_window logged_collection_mode logged_views <<<"$run_row"
  [[ "$run_status" == "success" ]] || fail "Expected wf_instagram_metrics_collection workflow_runs status success, got $run_status."
  [[ "$logged_snapshot_window" == "24h" ]] || fail "workflow_runs.details_json.metrics_collection.snapshot_window did not record 24h."
  [[ -n "$logged_collection_mode" ]] || fail "workflow_runs.details_json.metrics_collection.collection_mode is empty."
  [[ "${logged_views:-0}" -ge 1 ]] || fail "workflow_runs.details_json.metrics_collection.views is empty or zero."
}

print_summary() {
  info "Temporary content_id: $TEST_CONTENT_ID"
  info "Temporary slug: $TEST_SLUG"
  psql_query "select snapshot_window, coalesce(views, 0), coalesce(reach, 0), coalesce(engagement_rate, 0), coalesce(raw_payload_json->>'collection_mode', '') from insight_snapshots where content_id = '$TEST_CONTENT_ID'::uuid order by snapshot_taken_at desc limit 1;" | awk -F'\t' '
    {
      printf "[test_phase4_metrics_collection_smoke] Final state: snapshot_window=%s views=%s reach=%s engagement_rate=%s collection_mode=%s\n",
        $1, $2, $3, $4, $5
    }
  '
}

WORKFLOW_ID=""

info "Ensuring wf_instagram_metrics_collection is imported into n8n"
WORKFLOW_ID="$(ensure_workflow_id "wf_instagram_metrics_collection" "/workflows/n8n/wf_instagram_metrics_collection.json")"

info "Syncing the imported workflow to the current git-tracked export and binding the local Postgres credential"
sync_runtime_workflow "$WORKFLOW_ID" "$WORKFLOW_PATH"

info "Seeding one temporary published Instagram item"
seed_published_item

info "Running wf_instagram_metrics_collection inline with N8N_RUNNERS_ENABLED=false"
run_workflow_inline "$WORKFLOW_ID" "wf_instagram_metrics_collection" "$TMP_DIR/metrics_execution.json"

assert_metrics_snapshot
print_summary

if [[ "$KEEP_FIXTURES" == "true" ]]; then
  info "KEEP_FIXTURES=true so the temporary content row was left in place."
fi
