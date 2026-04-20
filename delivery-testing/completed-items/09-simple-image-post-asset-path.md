# 09 — Simple Image Post Asset Path

Status: `complete` ✅

## What Was Completed

- added a reusable static image asset for the simple-post MVP
- added `wf_simple_post_image_asset`
- fetches the next content item with a draft publish row
- attaches a single post image asset in `assets`
- updates `content_items.status` to `assets_ready`

## Changed Files

- [workflows/assets/mvp_simple_post.svg](/Users/rajchodisetti/n8n-insta/workflows/assets/mvp_simple_post.svg)
- [workflows/n8n/wf_simple_post_image_asset.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_simple_post_image_asset.json)
- [workflows/README.md](/Users/rajchodisetti/n8n-insta/workflows/README.md)

## How It Was Tested

1. Opened `wf_simple_post_image_asset` in n8n.
2. Confirmed the workflow nodes:
   - `Manual Trigger`
   - `Fetch Next Post Asset Item`
   - `Prepare Post Asset Payload`
   - `Prepare Asset SQL Values`
   - `Replace Post Image Asset`
   - `Mark Assets Ready`
3. Confirmed a draft publish row existed:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, publish_status, caption_final from publishes where publish_status = 'draft' order by created_at desc limit 5;"`
4. Ran `wf_simple_post_image_asset` from `Manual Trigger`.
5. Verified the asset row:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, asset_role, provider, storage_url, mime_type, width, height, status from assets where asset_role = 'post_image' order by created_at desc limit 5;"`
6. Verified the content status:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, title, status from content_items order by updated_at desc limit 5;"`

## Pass Condition

- one draft-publish content item received a `post_image` asset in `assets`
- `storage_url` points at the reusable static asset
- the matching `content_items.status` became `assets_ready`
