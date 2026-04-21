# 11 — Simple Instagram Publish Workflow

Status: `complete` ✅

## What Was Completed

- added `wf_instagram_simple_post_publish`
- claims the next eligible simple-post publish row
- validates the caption, asset URL, JPEG requirement, and live publish env
- checks Instagram publish quota before calling the Graph API
- creates the media container, polls container status, and calls `media_publish`
- persists publish metadata into `publishes`
- logs each run in `workflow_runs`

## Changed Files

- [workflows/n8n/wf_instagram_simple_post_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_simple_post_publish.json)
- [workflows/n8n/wf_simple_post_image_asset.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_simple_post_image_asset.json)
- [09-instagram-publishing.md](/Users/rajchodisetti/n8n-insta/09-instagram-publishing.md)
- [04-workflows.md](/Users/rajchodisetti/n8n-insta/04-workflows.md)
- [15-delivery-and-testing-workflow.md](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md)
- [16-engineering-backlog.md](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)

## How It Was Tested

1. Re-ran `wf_simple_post_image_asset` with a public JPEG source.
2. Ran `wf_instagram_simple_post_publish` against the live local stack.
3. Verified the publish row:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, publish_status, instagram_media_id, instagram_container_id, published_at, publish_error from publishes order by created_at desc limit 5;"`
4. Verified the content state:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, title, status, published_at from content_items order by updated_at desc limit 5;"`
5. Verified the latest workflow details:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select details_json->'instagram_account' as instagram_account, details_json->'content_publishing_limit' as content_publishing_limit, details_json->'container_create' as container_create, details_json->'publish_response' as publish_response from workflow_runs where workflow_name = 'wf_instagram_simple_post_publish' order by started_at desc limit 1;"`

## Test Result

- published `The Mary Celeste Mystery`
- `instagram_container_id = 18083009432120650`
- `instagram_media_id = 18101344775486849`
- `publishes.publish_status = published`
- `content_items.status = published`
- latest successful publish row was recorded at `2026-04-20 05:26:48.756726+00`
