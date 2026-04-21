# 18 — MVP Smoke Test and Publish Runbook

Use this runbook to repeat the current simple-post MVP safely.

## Scope

This covers:

- live simple-post publish
- duplicate-publish guard verification
- retry-safe failure verification
- exact PostgreSQL checks after each run
- script-assisted local smoke testing for `MVP-08`

## Preconditions

- local stack is running:
  - `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d`
- Instagram readiness already passed:
  - `wf_instagram_publish_readiness`
- imported workflow exists in n8n:
  - `wf_instagram_simple_post_publish`
- runtime Postgres nodes are bound to the `Postgres account` credential

## Live publish path

1. Set the live publish switch and a public JPEG in the repo-root `.env`:
   - `INSTAGRAM_PUBLISH_ENABLED=true`
   - `MVP_SIMPLE_POST_IMAGE_URL=https://.../your-public-image.jpg`
2. Recreate `n8n` so the running container reloads the repo-root `.env`:
   - `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n`
3. Confirm the running container picked up the publish env:
   - `docker exec n8n-insta sh -lc 'printf "publish_enabled=%s\npublic_image_url=%s\n" "$INSTAGRAM_PUBLISH_ENABLED" "$MVP_SIMPLE_POST_IMAGE_URL"'`
4. Check whether you already have an eligible publish candidate:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status as content_status, p.publish_status, p.scheduled_for from content_items ci join publishes p on p.content_id = ci.content_id left join lateral (select status from assets where content_id = ci.content_id and asset_role = 'post_image' order by created_at desc limit 1) a on true where p.platform = 'instagram' and p.publish_status in ('draft', 'failed') and ci.status in ('assets_ready', 'qa_approved') and coalesce(nullif(btrim(p.instagram_media_id), ''), '') = '' and p.published_at is null and coalesce(a.status, '') = 'ready' order by coalesce(p.scheduled_for, ci.updated_at) asc, ci.updated_at asc;"`
5. If the query is empty and you want a controlled live test candidate, seed one directly:

```bash
IMAGE_URL="$(grep '^MVP_SIMPLE_POST_IMAGE_URL=' .env | cut -d= -f2-)"
SLUG="tmp-live-publish-$(date +%Y%m%d-%H%M%S)"
docker exec n8n-insta-postgres psql -v ON_ERROR_STOP=1 -U n8n_insta -d n8n_insta -c "insert into content_items (title, slug, status, brand_profile) values ('Temporary Live Publish Smoke Test', '${SLUG}', 'assets_ready', 'default'); insert into publishes (content_id, platform, publish_status, caption_final, hashtags_final, publish_error) select content_id, 'instagram', 'draft', 'Temporary live publish smoke test caption', '#mvp #smoketest', null from content_items where slug = '${SLUG}'; insert into assets (content_id, asset_role, provider, source_url, storage_url, mime_type, width, height, status) select content_id, 'post_image', 'public_image_url', '${IMAGE_URL}', '${IMAGE_URL}', 'image/jpeg', 1080, 1080, 'ready' from content_items where slug = '${SLUG}';"
printf 'Seeded live publish candidate slug=%s\n' "$SLUG"
```
6. If you prefer the newer upstream generated-image plus approval path, use [19 — Phase 2 Manual Review and Live Publish Runbook](/Users/rajchodisetti/n8n-insta/19-phase2-manual-review-and-live-publish-runbook.md) instead of this MVP shortcut.
7. Verify the candidate asset row:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, asset_role, provider, storage_url, mime_type, status from assets where asset_role = 'post_image' order by created_at desc limit 5;"`
8. Verify the candidate publish row:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.content_id, ci.title, ci.status, p.publish_status, p.caption_final, p.hashtags_final from content_items ci join publishes p on p.content_id = ci.content_id order by ci.updated_at desc limit 5;"`
9. In n8n, open `wf_instagram_simple_post_publish`.
10. Confirm the workflow nodes:
   - `Manual Trigger`
   - `Claim Next Instagram Publish Item`
   - `Validate and Publish Instagram Post`
   - `Prepare Publish Result SQL Values`
   - `Upsert Publish Result`
   - `Sync Content Publish State`
   - `Log Publish Run`
11. Run the workflow from `Manual Trigger`.
12. Verify the publish row:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, publish_status, instagram_media_id, instagram_container_id, published_at, publish_error from publishes order by created_at desc limit 5;"`
13. Verify the content state:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, title, status, published_at from content_items order by updated_at desc limit 5;"`
14. Verify the workflow log:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select run_id, content_id, workflow_name, run_status, error_message, started_at, ended_at from workflow_runs where workflow_name = 'wf_instagram_simple_post_publish' order by started_at desc limit 5;"`
15. Inspect the latest detailed payload:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select details_json->'instagram_account' as instagram_account, details_json->'content_publishing_limit' as content_publishing_limit, details_json->'container_create' as container_create, details_json->'publish_response' as publish_response from workflow_runs where workflow_name = 'wf_instagram_simple_post_publish' order by started_at desc limit 1;"`

## Pass condition

- `publishes.publish_status = 'published'`
- `instagram_container_id` and `instagram_media_id` are populated
- `content_items.status = 'published'`
- `workflow_runs.run_status = 'success'`

## Safe smoke test — duplicate guard

Fast path:

- run `bash scripts/test_mvp08_smoke.sh`
- the script runs both `MVP-08` safeguard checks using the exact SQL/code from [wf_instagram_simple_post_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_simple_post_publish.json)
- for debugging, keep the synthetic rows after the run with `KEEP_FIXTURES=true bash scripts/test_mvp08_smoke.sh`

This test never calls the Meta API.

1. Insert a synthetic row that already has an `instagram_media_id`:

```bash
docker exec n8n-insta-postgres psql -v ON_ERROR_STOP=1 -U n8n_insta -d n8n_insta -c "delete from content_items where slug = 'tmp-duplicate-guard-skip'; insert into content_items (title, slug, status, brand_profile) values ('Temporary Duplicate Guard Item', 'tmp-duplicate-guard-skip', 'assets_ready', 'default'); insert into publishes (content_id, platform, publish_status, caption_final, hashtags_final, instagram_media_id, instagram_container_id, publish_error) select content_id, 'instagram', 'failed', 'Duplicate guard test caption', '#duplicateguard', '18100000000000001', '18000000000000001', 'synthetic duplicate-guard fixture' from content_items where slug = 'tmp-duplicate-guard-skip'; insert into assets (content_id, asset_role, provider, source_url, storage_url, mime_type, width, height, status) select content_id, 'post_image', 'public_image_url', 'https://example.com/duplicate-guard.jpg', 'https://example.com/duplicate-guard.jpg', 'image/jpeg', 1080, 1080, 'ready' from content_items where slug = 'tmp-duplicate-guard-skip';"
```

2. Verify the row exists:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, p.publish_status, p.instagram_media_id, p.instagram_container_id from content_items ci join publishes p on p.content_id = ci.content_id where ci.slug = 'tmp-duplicate-guard-skip';"`
3. Run the fixed claim query from `wf_instagram_simple_post_publish`.
4. Verify the row is unchanged:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, p.publish_status, p.instagram_media_id, p.instagram_container_id, p.publish_error from content_items ci join publishes p on p.content_id = ci.content_id where ci.slug = 'tmp-duplicate-guard-skip';"`

Expected result:

- the duplicate row is not claimable
- `publish_status` stays `failed`
- existing Instagram identifiers stay intact

## Safe smoke test — retry-safe failure

This test uses the workflow’s claim SQL and validation code without making a live publish call.

1. Insert a synthetic retry row with an existing container id but an invalid local SVG asset:

```bash
docker exec n8n-insta-postgres psql -v ON_ERROR_STOP=1 -U n8n_insta -d n8n_insta -c "delete from content_items where slug = 'tmp-retry-safe-failure'; insert into content_items (title, slug, status, brand_profile) values ('Temporary Retry Safe Failure Item', 'tmp-retry-safe-failure', 'assets_ready', 'default'); insert into publishes (content_id, platform, publish_status, caption_final, hashtags_final, instagram_container_id, publish_error) select content_id, 'instagram', 'failed', 'Retry safe test caption', '#retrysafe', '18000000000000999', 'synthetic retry-safe fixture' from content_items where slug = 'tmp-retry-safe-failure'; insert into assets (content_id, asset_role, provider, source_url, storage_url, mime_type, width, height, status) select content_id, 'post_image', 'local_file', '/workflows/assets/mvp_simple_post.svg', '/workflows/assets/mvp_simple_post.svg', 'image/svg+xml', 1080, 1080, 'ready' from content_items where slug = 'tmp-retry-safe-failure';"
```

2. Claim the row and confirm the claim result shows:
   - `previous_publish_status = failed`
   - `publish_status = publishing`
   - `existing_instagram_container_id = 18000000000000999`
3. Run the workflow validation code against that claimed payload.

Expected validation result:

- `run_status = failed`
- `publish_status_after_run = failed`
- validation errors mention the non-public URL and JPEG requirement
- no Meta API request is made

4. Write the failed result back to PostgreSQL using the workflow’s publish/log tables.
5. Verify the row after writeback:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status as content_status, p.publish_status, p.instagram_media_id, p.instagram_container_id, p.published_at, p.publish_error from content_items ci join publishes p on p.content_id = ci.content_id where ci.slug = 'tmp-retry-safe-failure';"`
6. Verify the workflow log:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select workflow_name, run_status, error_message, details_json->'validation_errors' as validation_errors from workflow_runs where workflow_name = 'wf_instagram_simple_post_publish' order by started_at desc limit 5;"`

Expected result:

- the row ends in `publish_status = failed`
- `instagram_container_id` remains `18000000000000999`
- `content_items.status` stays `assets_ready`
- the failure is queryable in `workflow_runs`

## Cleanup

Remove the synthetic smoke-test rows when finished:

- `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "delete from content_items where slug in ('tmp-duplicate-guard-skip', 'tmp-retry-safe-failure');"`

## Troubleshooting

- `n8n execute --id=...` may hang in the current local `n8n 1.92.2` container. Prefer the editor UI for live publish validation.
- If the editor run endpoint fails before node execution, verify the workflow is imported with the `Postgres account` credential bound on every Postgres node.
- If the claim step returns no row, verify there is an eligible `publishes` row with:
  - `publish_status in ('draft', 'failed')`
  - `published_at is null`
  - empty `instagram_media_id`
  - matching ready `post_image` asset
- If validation fails on a supposed Phase 2 live candidate because the asset URL is local-only, switch the generated-image flow to `IMAGE_HOST_PROVIDER=imagekit`, recreate `n8n`, rerun `wf_simple_post_image_asset`, and then retry publish. The full generated-image path is documented in [19 — Phase 2 Manual Review and Live Publish Runbook](/Users/rajchodisetti/n8n-insta/19-phase2-manual-review-and-live-publish-runbook.md).
- If `/me/accounts` fails with `Error validating access token: Session has expired`, update `INSTAGRAM_GRAPH_API_TOKEN` in the repo-root `.env`, then recreate `n8n` with `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n` before retrying the workflow.
