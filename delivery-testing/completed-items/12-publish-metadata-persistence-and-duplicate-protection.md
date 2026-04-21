# 12 — Publish Metadata Persistence and Duplicate Protection

Status: `complete` ✅

## What Was Completed

- fixed the claim step in `wf_instagram_simple_post_publish` so it can atomically claim an eligible row
- duplicate rows with an existing `instagram_media_id` are skipped
- failed retry attempts preserve any previously stored Instagram identifiers
- publish failures are written back into `publishes.publish_error`
- validation and failure details are logged into `workflow_runs.details_json`

## Changed Files

- [workflows/n8n/wf_instagram_simple_post_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_simple_post_publish.json)
- [09-instagram-publishing.md](/Users/rajchodisetti/n8n-insta/09-instagram-publishing.md)
- [18-mvp-smoke-test-and-publish-runbook.md](/Users/rajchodisetti/n8n-insta/18-mvp-smoke-test-and-publish-runbook.md)
- [11-setup-checklist.md](/Users/rajchodisetti/n8n-insta/11-setup-checklist.md)
- [15-delivery-and-testing-workflow.md](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md)
- [16-engineering-backlog.md](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)

## How It Was Tested

1. Inserted a synthetic duplicate row with:
   - `publish_status = failed`
   - existing `instagram_media_id`
   - existing `instagram_container_id`
2. Verified the fixed claim query did not claim that row.
3. Inserted a synthetic retry row with:
   - `publish_status = failed`
   - existing `instagram_container_id = 18000000000000999`
   - invalid local SVG `post_image`
4. Ran the workflow claim SQL and confirmed the retry row moved to `publishing`.
5. Ran the exact validation code from `wf_instagram_simple_post_publish` against the claimed row.
6. Wrote the failed result back into `publishes` and `workflow_runs`.
7. Verified:
   - the row returned to `publish_status = failed`
   - `instagram_container_id` stayed populated
   - `content_items.status` stayed `assets_ready`
   - `workflow_runs` recorded the validation errors

Test method note:

- the duplicate and retry safeguards were exercised with the workflow’s exact SQL and code-node logic because the local `n8n 1.92.2` manual execution path was unreliable in this container
- the active test handoff for this item was [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md), and the helper path was `bash scripts/test_mvp08_smoke.sh`

## Test Result

- duplicate row remained untouched while already containing publish identifiers
- retry-safe failure preserved `instagram_container_id = 18000000000000999`
- latest failure payload included:
  - `storage_url must be a public http(s) URL so Meta can fetch the image.`
  - `The publish asset must be a JPEG image. Set MVP_SIMPLE_POST_IMAGE_URL to a public .jpg or .jpeg URL and rerun wf_simple_post_image_asset.`
- item was user-confirmed and moved to `complete` on `2026-04-20` in `America/Phoenix`
