# 13 — Smoke Test and Publish Runbook

Status: `complete` ✅

## What Was Completed

- added a dedicated MVP runbook for:
  - live simple-post publish validation
  - duplicate-guard smoke testing
  - retry-safe failure smoke testing
  - PostgreSQL verification queries
- linked the runbook from the top-level docs and delivery tracker

## Changed Files

- [docs/runbooks/mvp-smoke-test-and-publish.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/mvp-smoke-test-and-publish.md)
- [README.md](/Users/rajchodisetti/n8n-insta/README.md)
- [docs/delivery/delivery-and-testing-workflow.md](/Users/rajchodisetti/n8n-insta/docs/delivery/delivery-and-testing-workflow.md)
- [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)

## How It Was Tested

1. Checked for an eligible candidate with the runbook query and confirmed there were `0 rows`, so the seeded live-candidate path in the runbook was needed.
2. Seeded a controlled live test candidate:
   - `slug = tmp-live-publish-20260420-190716`
   - `content_id = b1b29220-6c6f-4de0-a534-d449cf45b19d`
   - public JPEG asset with `mime_type = image/jpeg`
3. Ran `wf_instagram_simple_post_publish` and initially got:
   - `/me/accounts failed: Error validating access token: Session has expired ...`
4. Updated `INSTAGRAM_GRAPH_API_TOKEN` in the repo-root `.env`, recreated `n8n`, and verified the running container picked up the new token.
5. Reran `wf_instagram_simple_post_publish` for the same candidate and verified the targeted PostgreSQL checks for that `content_id`.

## Test Result

- publish result for `b1b29220-6c6f-4de0-a534-d449cf45b19d`:
  - `publishes.publish_status = published`
  - `instagram_container_id = 18083290082120650`
  - `instagram_media_id = 18118525285656461`
  - `published_at = 2026-04-21 02:23:07.748222+00`
- content state for the same row:
  - `content_items.status = published`
  - `published_at = 2026-04-21 02:23:07.769131+00`
- workflow log for the same row:
  - latest `workflow_runs.run_status = success`
  - `instagram_account.id = 17841433619491398`
  - `instagram_account.username = manaandarikathalu`
  - `content_publishing_limit.quota_usage = 1`
  - `container_create.body.id = 18083290082120650`
  - `publish_response.body.id = 18118525285656461`
- the runbook now reflects a tested live publish path plus a known recovery step when the Instagram token has expired
