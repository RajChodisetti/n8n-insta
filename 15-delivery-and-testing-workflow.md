# 15 — Delivery and Testing Workflow

This is the active delivery/testing tracker.

## Updated Links

- Active tracker: [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md)
- Engineering backlog: [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)
- Completed items archive: [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)
- Setup checklist: [11-setup-checklist.md](/Users/rajchodisetti/n8n-insta/11-setup-checklist.md)

## How Tracking Works

Use these three documents together:

- [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)
  Source of truth for what still needs to be built and what is in scope for the MVP.
- [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md)
  Active tracker for items that have been implemented and are waiting for testing.
- [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)
  Archive of items that already passed testing.

Rule:

1. backlog sequencing lives in the engineering backlog
2. once an item is implemented, it moves here for testing
3. once it passes testing, it moves into the completed-items archive
4. every completion message should include the updated links above
5. every testing section should include exact DB check commands and, if needed, exact insert or update commands

## Status Model

- `backlog`
- `implemented_awaiting_test`
- `complete`

## Current Items in `implemented_awaiting_test`

### 11. `MVP-07` simple Instagram publish workflow

Status: `implemented_awaiting_test`

What was completed:

- added `wf_instagram_simple_post_publish`
- fetches the next draft or failed Instagram publish candidate with a ready `post_image` asset
- validates the caption, asset URL, JPEG requirement, publish status, and live-publish enable flag
- auto-discovers the linked Facebook Page, Page access token, and Instagram professional account ID
- checks the current `content_publishing_limit` quota before publish
- creates the Instagram media container, polls `status_code`, and calls `media_publish`
- upserts `publishes`, updates `content_items` on success, and logs the run in `workflow_runs`
- updated `wf_simple_post_image_asset` to use an optional `MVP_SIMPLE_POST_IMAGE_URL` public JPEG source for publish testing

Changed files:

- [workflows/n8n/wf_instagram_simple_post_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_simple_post_publish.json)
- [workflows/n8n/wf_simple_post_image_asset.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_simple_post_image_asset.json)
- [workflows/README.md](/Users/rajchodisetti/n8n-insta/workflows/README.md)
- [09-instagram-publishing.md](/Users/rajchodisetti/n8n-insta/09-instagram-publishing.md)
- [04-workflows.md](/Users/rajchodisetti/n8n-insta/04-workflows.md)
- [.env.example](/Users/rajchodisetti/n8n-insta/.env.example)
- [11-setup-checklist.md](/Users/rajchodisetti/n8n-insta/11-setup-checklist.md)
- [16-engineering-backlog.md](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)

How to test:

1. Set the publish safety switch and a public JPEG asset in the repo-root `.env`:
   - `INSTAGRAM_PUBLISH_ENABLED=true`
   - `MVP_SIMPLE_POST_IMAGE_URL=https://.../your-public-image.jpg`
2. Reload `n8n` so the running container picks up the updated repo-root `.env`:
   - `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n`
3. Confirm the env values are loaded into the running container:
   - `docker exec n8n-insta sh -lc 'printf \"publish_enabled=%s\\npublic_image_url=%s\\n\" \"$INSTAGRAM_PUBLISH_ENABLED\" \"$MVP_SIMPLE_POST_IMAGE_URL\"'`
4. Re-run `wf_simple_post_image_asset` so the candidate asset row uses the public JPEG URL.
5. Verify the asset row before publishing:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, asset_role, provider, storage_url, mime_type, status from assets where asset_role = 'post_image' order by created_at desc limit 5;"`
6. Verify the candidate publish row before publishing:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c \"select ci.content_id, ci.title, ci.status, p.publish_status, p.caption_final, p.hashtags_final from content_items ci join publishes p on p.content_id = ci.content_id order by ci.updated_at desc limit 5;\"`
7. In n8n, open the imported workflow named `wf_instagram_simple_post_publish`.
8. Confirm it has 7 nodes in this order:
   - `Manual Trigger`
   - `Fetch Next Instagram Publish Item`
   - `Validate and Publish Instagram Post`
   - `Prepare Publish Result SQL Values`
   - `Upsert Publish Result`
   - `Sync Content Publish State`
   - `Log Publish Run`
9. Run `wf_instagram_simple_post_publish` from `Manual Trigger`.
10. Verify the publish row:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, publish_status, instagram_media_id, instagram_container_id, published_at, publish_error from publishes order by created_at desc limit 5;"`
11. Verify the content status:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, title, status, published_at from content_items order by updated_at desc limit 5;"`
12. Verify the workflow log:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c \"select run_id, content_id, workflow_name, run_status, error_message, started_at, ended_at from workflow_runs where workflow_name = 'wf_instagram_simple_post_publish' order by started_at desc limit 5;\"`
13. Inspect the latest workflow details:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c \"select details_json->'instagram_account' as instagram_account, details_json->'content_publishing_limit' as content_publishing_limit, details_json->'container_create' as container_create, details_json->'publish_response' as publish_response from workflow_runs where workflow_name = 'wf_instagram_simple_post_publish' order by started_at desc limit 1;\"`

What to verify:

- the workflow selects a draft or failed publish candidate with a ready `post_image`
- `provider` is `public_image_url`, `storage_url` is the public JPEG URL, and `mime_type` is `image/jpeg`
- a successful run sets `publish_status = published`
- `instagram_container_id` and `instagram_media_id` are populated on success
- `content_items.status` becomes `published`
- `publish_error` is empty on success
- `workflow_runs.run_status` is `success`

Pass condition:

- one draft simple-post candidate is published to Instagram through the Graph API and the publish metadata is persisted locally

## Completed Items (moved to archive)

### 10. `MVP-06` Instagram publishing credentials and account validation

Status: `complete` ✅

Archive entry:

- [10 — Instagram Publishing Credentials and Account Validation](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/10-instagram-publishing-credentials-and-account-validation.md)
- Exact test steps and DB validation commands now live only in the archive record above.

## Next Item After 11 Passes

- `MVP-08` publish metadata persistence and duplicate protection
