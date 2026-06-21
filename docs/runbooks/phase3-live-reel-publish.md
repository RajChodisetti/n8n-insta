# 20 — Phase 3 Live Reel Publish Runbook

Use this runbook to validate the real narrated Reel path:

- OpenAI script generation
- OpenAI storyboard generation
- OpenAI scene image generation
- OpenAI narration generation
- FFmpeg render worker assembly
- caption and hashtag packaging
- live Instagram Reel publish

## Preconditions

- local stack is running:
  - `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d`
- the repo-root `.env` contains:
  - `OPENAI_API_KEY=...`
  - `INSTAGRAM_GRAPH_API_TOKEN=...`
  - `INSTAGRAM_PUBLISH_ENABLED=true`
  - `ASSET_HOST_PROVIDER=google_cloud_storage`
  - `RENDER_OUTPUT_HOST_PROVIDER=google_cloud_storage`
  - `GOOGLE_CLOUD_STORAGE_BUCKET=...`
  - `GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH=/secrets/google/sa-key.json`
- recreate `n8n` and `render-worker` after any `.env` changes:
  - `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n render-worker`
- this live path assumes the render output is rehosted to a public MP4 URL before Instagram publish

## Combined preparation

1. Prepare one real Reel candidate through the upstream workflows:
   - `bash scripts/prepare_phase3_live_reel_candidate.sh`
2. Inspect the prepared candidate:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status, r.render_status, r.output_video_url, p.publish_status from content_items ci join renders r on r.content_id = ci.content_id left join publishes p on p.content_id = ci.content_id where ci.slug like 'tmp-phase3-live-reel-%' order by ci.created_at desc limit 1;"`
3. Inspect the render metadata:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select r.output_video_url, r.cover_image_url, r.duration_seconds, r.resolution, r.render_log from renders r join content_items ci on ci.content_id = r.content_id where ci.slug like 'tmp-phase3-live-reel-%' order by ci.created_at desc limit 1;"`
4. Verify the latest workflow trail:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select workflow_name, run_status, error_message, started_at from workflow_runs where content_id in (select content_id from content_items where slug like 'tmp-phase3-live-reel-%') order by started_at desc limit 12;"`
5. Open the `output_video_url` in a browser and confirm the render looks correct before publishing.

## Live publish

1. Open `wf_instagram_reel_publish` in n8n.
2. Run from `Manual Trigger`.
3. Verify the publish result:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status as content_status, p.publish_status, p.instagram_media_id, p.instagram_container_id, p.published_at, r.output_video_url from content_items ci join publishes p on p.content_id = ci.content_id join renders r on r.content_id = ci.content_id where ci.slug like 'tmp-phase3-live-reel-%' order by ci.created_at desc limit 1;"`
4. If the publish fails, inspect the workflow log details:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select workflow_name, run_status, error_message, details_json from workflow_runs where content_id in (select content_id from content_items where slug like 'tmp-phase3-live-reel-%') and workflow_name = 'wf_instagram_reel_publish' order by started_at desc limit 1;"`

## Pass condition

- the prepared candidate reaches:
  - `content_items.status = render_complete`
  - `renders.render_status = success`
  - non-empty public `renders.output_video_url`
  - `publishes.publish_status = draft`
- the live publish workflow ends with:
  - `publishes.publish_status = published`
  - populated `instagram_container_id`
  - populated `instagram_media_id`
  - `content_items.status = published`

## Cleanup

- if you used a temporary live-test row and do not want to keep it:
  - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "delete from content_items where slug like 'tmp-phase3-live-reel-%';"`
