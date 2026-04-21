#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW_PATH="$ROOT_DIR/workflows/n8n/wf_instagram_simple_post_publish.json"
DB_CONTAINER="${DB_CONTAINER:-n8n-insta-postgres}"
DB_USER="${DB_USER:-n8n_insta}"
DB_NAME="${DB_NAME:-n8n_insta}"
KEEP_FIXTURES="${KEEP_FIXTURES:-false}"
TMP_DIR="$(mktemp -d)"

info() {
  printf '[test_mvp08_smoke] %s\n' "$*"
}

fail() {
  printf '[test_mvp08_smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ "$KEEP_FIXTURES" != "true" ]]; then
    psql_query "delete from content_items where slug in ('tmp-duplicate-guard-skip', 'tmp-retry-safe-failure');" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

psql_query() {
  local query="$1"
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -At -F $'\t' -c "$query"
}

psql_file() {
  local file_path="$1"
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -At -F $'\t' < "$file_path"
}

write_wrapped_claim_query() {
  local target_path="$1"
  node - "$WORKFLOW_PATH" "$target_path" <<'NODE'
const fs = require('fs');

const [workflowPath, targetPath] = process.argv.slice(2);
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const claimNode = workflow.nodes.find((node) => node.name === 'Claim Next Instagram Publish Item');

if (!claimNode) {
  throw new Error('Missing Claim Next Instagram Publish Item node.');
}

const claimQuery = String(claimNode.parameters.query || '').replace(/;\s*$/, '');
fs.writeFileSync(targetPath, `${claimQuery}\n`);
NODE
}

claim_tsv_to_json() {
  local input_path="$1"
  local output_path="$2"

  node - "$input_path" "$output_path" <<'NODE'
const fs = require('fs');

const [inputPath, outputPath] = process.argv.slice(2);
const raw = fs.readFileSync(inputPath, 'utf8').trim();

if (!raw) {
  throw new Error('Claim query did not return a row.');
}

const columns = [
  'content_id',
  'title',
  'content_status',
  'previous_publish_status',
  'publish_status',
  'caption_final',
  'hashtags_final',
  'scheduled_for',
  'existing_instagram_media_id',
  'existing_instagram_container_id',
  'existing_published_at',
  'asset_id',
  'storage_url',
  'source_url',
  'mime_type',
  'provider',
  'width',
  'height'
];
const values = raw.split('\t');

if (values.length !== columns.length) {
  throw new Error(`Expected ${columns.length} claim columns, received ${values.length}.`);
}

const parsed = Object.fromEntries(columns.map((column, index) => [column, values[index] === '' ? null : values[index]]));

if (parsed.width !== null) {
  parsed.width = Number(parsed.width);
}
if (parsed.height !== null) {
  parsed.height = Number(parsed.height);
}

fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
NODE
}

run_code_node() {
  local node_name="$1"
  local input_path="$2"
  local output_path="$3"

  node - "$WORKFLOW_PATH" "$node_name" "$input_path" "$output_path" <<'NODE'
const fs = require('fs');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const [workflowPath, nodeName, inputPath, outputPath] = process.argv.slice(2);
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const codeNode = workflow.nodes.find((node) => node.name === nodeName);

if (!codeNode) {
  throw new Error(`Missing ${nodeName} node.`);
}

const jsCode = String(codeNode.parameters.jsCode || '');
const inputJson = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const helpers = {
  async httpRequest() {
    throw new Error('Smoke test unexpectedly attempted a network request.');
  }
};
const env = {
  GRAPH_API_VERSION: 'v25.0',
  INSTAGRAM_PUBLISH_ENABLED: 'true',
  INSTAGRAM_GRAPH_API_TOKEN: 'dummy-token-for-local-validation'
};

(async () => {
  const fn = new AsyncFunction('$json', '$env', 'helpers', jsCode);
  const result = await fn(inputJson, env, helpers);
  const payload = Array.isArray(result) ? result[0]?.json ?? result[0] ?? null : result;
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
}

render_query() {
  local node_name="$1"
  local prepared_path="$2"
  local target_path="$3"

  node - "$WORKFLOW_PATH" "$node_name" "$prepared_path" "$target_path" <<'NODE'
const fs = require('fs');

const [workflowPath, nodeName, preparedPath, targetPath] = process.argv.slice(2);
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const sqlNode = workflow.nodes.find((node) => node.name === nodeName);

if (!sqlNode) {
  throw new Error(`Missing ${nodeName} node.`);
}

const prepared = JSON.parse(fs.readFileSync(preparedPath, 'utf8'));
const getValue = (key) => {
  if (!(key in prepared)) {
    throw new Error(`Missing prepared value: ${key}`);
  }
  return String(prepared[key]);
};

let rendered = String(sqlNode.parameters.query || '');
rendered = rendered.replace(/\{\{\$json\.([A-Za-z0-9_]+)\}\}/g, (_, key) => getValue(key));
rendered = rendered.replace(/\{\{\$item\(0\)\.\$node\["Prepare Publish Result SQL Values"\]\.json\["([^"]+)"\]\}\}/g, (_, key) => getValue(key));

fs.writeFileSync(targetPath, `${rendered}\n`);
NODE
}

assert_json_file() {
  local json_path="$1"
  local assertion_source="$2"

  node - "$json_path" "$assertion_source" <<'NODE'
const fs = require('fs');

const [jsonPath, assertionSource] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const assertion = new Function('data', assertionSource);
const result = assertion(data);

if (result !== true) {
  console.error(result || 'Assertion failed.');
  process.exit(1);
}
NODE
}

ELIGIBLE_ROWS_QUERY="select ci.slug, ci.status as content_status, p.publish_status, p.scheduled_for
from content_items ci
join publishes p on p.content_id = ci.content_id
left join lateral (
  select status
  from assets
  where content_id = ci.content_id
    and asset_role = 'post_image'
  order by created_at desc
  limit 1
) a on true
where p.platform = 'instagram'
  and p.publish_status in ('draft', 'failed')
  and ci.status in ('assets_ready', 'qa_approved')
  and coalesce(nullif(btrim(p.instagram_media_id), ''), '') = ''
  and p.published_at is null
  and coalesce(a.status, '') = 'ready'
order by coalesce(p.scheduled_for, ci.updated_at) asc, ci.updated_at asc;"

claim_query_path="$TMP_DIR/claim_wrapped.sql"
retry_claim_tsv_path="$TMP_DIR/retry_claim.tsv"
duplicate_state_path="$TMP_DIR/duplicate_state.json"
retry_claim_path="$TMP_DIR/retry_claim.json"
validation_path="$TMP_DIR/validation_result.json"
prepared_path="$TMP_DIR/prepared_sql_values.json"
retry_state_path="$TMP_DIR/retry_state.json"
retry_log_path="$TMP_DIR/retry_log.json"

info "Checking for live eligible publish candidates before running the smoke test"
eligible_rows="$(psql_query "$ELIGIBLE_ROWS_QUERY")"
if [[ -n "$eligible_rows" ]]; then
  fail "Found existing eligible publish rows. Clear or publish them before running this smoke test:\n$eligible_rows"
fi

info "Preparing the exact claim query from wf_instagram_simple_post_publish"
write_wrapped_claim_query "$claim_query_path"

info "Creating the duplicate-guard fixture"
psql_query "delete from content_items where slug = 'tmp-duplicate-guard-skip';
insert into content_items (title, slug, status, brand_profile)
values ('Temporary Duplicate Guard Item', 'tmp-duplicate-guard-skip', 'assets_ready', 'default');
insert into publishes (content_id, platform, publish_status, caption_final, hashtags_final, instagram_media_id, instagram_container_id, publish_error)
select content_id, 'instagram', 'failed', 'Duplicate guard test caption', '#duplicateguard', '18100000000000001', '18000000000000001', 'synthetic duplicate-guard fixture'
from content_items
where slug = 'tmp-duplicate-guard-skip';
insert into assets (content_id, asset_role, provider, source_url, storage_url, mime_type, width, height, status)
select content_id, 'post_image', 'public_image_url', 'https://example.com/duplicate-guard.jpg', 'https://example.com/duplicate-guard.jpg', 'image/jpeg', 1080, 1080, 'ready'
from content_items
where slug = 'tmp-duplicate-guard-skip';" >/dev/null

info "Verifying the duplicate-guard row is not claimable"
duplicate_claim_output="$(psql_file "$claim_query_path")"
if [[ -n "$duplicate_claim_output" ]]; then
  fail "The duplicate-guard fixture should not have been claimable: $duplicate_claim_output"
fi

psql_query "select row_to_json(t)
from (
  select
    ci.slug,
    p.publish_status,
    p.instagram_media_id,
    p.instagram_container_id,
    p.publish_error
  from content_items ci
  join publishes p on p.content_id = ci.content_id
  where ci.slug = 'tmp-duplicate-guard-skip'
) t;" > "$duplicate_state_path"

assert_json_file "$duplicate_state_path" "if (data.publish_status !== 'failed') return 'Duplicate guard row should stay failed.'; if (data.instagram_media_id !== '18100000000000001') return 'Duplicate guard row lost instagram_media_id.'; if (data.instagram_container_id !== '18000000000000001') return 'Duplicate guard row lost instagram_container_id.'; return true;"

info "Creating the retry-safe failure fixture"
psql_query "delete from content_items where slug = 'tmp-retry-safe-failure';
insert into content_items (title, slug, status, brand_profile)
values ('Temporary Retry Safe Failure Item', 'tmp-retry-safe-failure', 'assets_ready', 'default');
insert into publishes (content_id, platform, publish_status, caption_final, hashtags_final, instagram_container_id, publish_error)
select content_id, 'instagram', 'failed', 'Retry safe test caption', '#retrysafe', '18000000000000999', 'synthetic retry-safe fixture'
from content_items
where slug = 'tmp-retry-safe-failure';
insert into assets (content_id, asset_role, provider, source_url, storage_url, mime_type, width, height, status)
select content_id, 'post_image', 'local_file', '/workflows/assets/mvp_simple_post.svg', '/workflows/assets/mvp_simple_post.svg', 'image/svg+xml', 1080, 1080, 'ready'
from content_items
where slug = 'tmp-retry-safe-failure';" >/dev/null

info "Claiming the retry-safe row with the exact workflow query"
psql_file "$claim_query_path" > "$retry_claim_tsv_path"
if [[ ! -s "$retry_claim_tsv_path" ]]; then
  fail "The retry-safe fixture was not claimable."
fi
claim_tsv_to_json "$retry_claim_tsv_path" "$retry_claim_path"

assert_json_file "$retry_claim_path" "if (data.previous_publish_status !== 'failed') return 'Retry fixture should start from failed.'; if (data.publish_status !== 'publishing') return 'Retry fixture should be atomically claimed into publishing.'; if (data.existing_instagram_container_id !== '18000000000000999') return 'Retry fixture lost the existing instagram_container_id.'; if (data.storage_url !== '/workflows/assets/mvp_simple_post.svg') return 'Retry fixture did not use the expected SVG asset.'; return true;"

info "Running the exact validation code locally with network access blocked"
run_code_node "Validate and Publish Instagram Post" "$retry_claim_path" "$validation_path"

assert_json_file "$validation_path" "if (data.run_status !== 'failed') return 'Validation should fail for the retry-safe SVG fixture.'; if (data.publish_status_after_run !== 'failed') return 'Publish status after validation should be failed.'; if (!String(data.error_message || '').includes('storage_url must be a public http(s) URL')) return 'Validation error did not mention the public URL requirement.'; if (!String(data.error_message || '').includes('The publish asset must be a JPEG image.')) return 'Validation error did not mention the JPEG requirement.'; return true;"

info "Preparing the exact workflow SQL values"
run_code_node "Prepare Publish Result SQL Values" "$validation_path" "$prepared_path"
assert_json_file "$prepared_path" "if (!data.content_id_sql) return 'Prepared SQL values are missing content_id_sql.'; if (data.publish_status_sql !== 'failed') return 'Prepared SQL values should persist a failed publish status.'; return true;"

info "Writing the failure result back through the workflow SQL nodes"
render_query "Upsert Publish Result" "$prepared_path" "$TMP_DIR/upsert.sql"
render_query "Sync Content Publish State" "$prepared_path" "$TMP_DIR/sync.sql"
render_query "Log Publish Run" "$prepared_path" "$TMP_DIR/log.sql"
psql_file "$TMP_DIR/upsert.sql" >/dev/null
psql_file "$TMP_DIR/sync.sql" >/dev/null
psql_file "$TMP_DIR/log.sql" >/dev/null

psql_query "select row_to_json(t)
from (
  select
    ci.slug,
    ci.status as content_status,
    p.publish_status,
    p.instagram_media_id,
    p.instagram_container_id,
    p.published_at,
    p.publish_error
  from content_items ci
  join publishes p on p.content_id = ci.content_id
  where ci.slug = 'tmp-retry-safe-failure'
) t;" > "$retry_state_path"

assert_json_file "$retry_state_path" "if (data.content_status !== 'assets_ready') return 'Retry fixture content status should stay assets_ready.'; if (data.publish_status !== 'failed') return 'Retry fixture publish status should end as failed.'; if (data.instagram_container_id !== '18000000000000999') return 'Retry fixture should preserve the existing instagram_container_id.'; if (data.instagram_media_id !== null) return 'Retry fixture should not gain an instagram_media_id.'; if (!String(data.publish_error || '').includes('storage_url must be a public http(s) URL')) return 'Persisted publish_error did not contain the validation failure.'; return true;"

psql_query "select row_to_json(t)
from (
  select
    workflow_name,
    run_status,
    error_message,
    details_json -> 'validation_errors' as validation_errors
  from workflow_runs
  where content_id = (
    select content_id
    from content_items
    where slug = 'tmp-retry-safe-failure'
  )
  order by started_at desc
  limit 1
) t;" > "$retry_log_path"

assert_json_file "$retry_log_path" "if (data.workflow_name !== 'wf_instagram_simple_post_publish') return 'workflow_runs should record wf_instagram_simple_post_publish.'; if (data.run_status !== 'failed') return 'workflow_runs should record a failed run.'; if (!String(data.error_message || '').includes('storage_url must be a public http(s) URL')) return 'workflow_runs.error_message is missing the public URL validation failure.'; if (!Array.isArray(data.validation_errors) || data.validation_errors.length < 2) return 'workflow_runs.details_json.validation_errors is missing the expected validation errors.'; return true;"

if [[ "$KEEP_FIXTURES" != "true" ]]; then
  info "Cleaning up the synthetic smoke-test rows"
  psql_query "delete from content_items where slug in ('tmp-duplicate-guard-skip', 'tmp-retry-safe-failure');" >/dev/null
fi

info "MVP-08 smoke test passed"
