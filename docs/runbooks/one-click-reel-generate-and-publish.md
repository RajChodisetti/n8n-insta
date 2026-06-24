# 22 — One-Click Reel Generate and Publish Runbook

Use this runbook for the unified Reel path:

- one approved topic in Postgres
- one n8n workflow trigger
- automatic research, storyboard, scene assets, narration, render dispatch, captioning, and Instagram Reel publish
- resume-aware continuation from the current unfinished checkpoint when the queue contains exactly one active candidate

Workflow:

- [wf_end_to_end_reel_generate_and_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_end_to_end_reel_generate_and_publish.json)

Important:

- this is a live publish path
- if `INSTAGRAM_PUBLISH_ENABLED=true` and the credentials are valid, it can create a real Instagram Reel

## Preconditions

- Docker stack is running:
  `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d`
- repo-root `.env` contains working values for:
  `OPENAI_API_KEY`, `ASSET_HOST_PROVIDER=google_cloud_storage`, `GOOGLE_CLOUD_STORAGE_BUCKET`, `GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH=/secrets/google/sa-key.json`, `INSTAGRAM_GRAPH_API_TOKEN`
- live publish is explicitly enabled:
  `INSTAGRAM_PUBLISH_ENABLED=true`
- recreate code-first services after any `.env` change:
  `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build --force-recreate studio-ui pipeline-worker remotion-renderer`
- also recreate `n8n` or `render-worker` if you intentionally use legacy fallback paths

Prompt editing note:

- if you want to refine prompt text before this run, edit the files under [prompts/](/Users/rajchodisetti/n8n-insta/prompts/README.md) first
- no workflow JSON change is needed for normal wording/tone updates

## Keep the Queue Controlled

Before a one-click run, keep the queue clean so the wrapper can safely resume the same candidate:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select content_id, slug, status from content_items where status in ('idea_approved', 'scripting', 'script_complete', 'storyboarding', 'storyboard_complete', 'generating_assets', 'assets_ready', 'generating_narration', 'narration_ready', 'building_render_manifest', 'render_manifest_ready', 'dispatching_render', 'render_queued', 'render_complete', 'render_failed') order by updated_at asc;"
```

Expected result:

- either `0 rows`
- or exactly one row that you intentionally want to publish

The wrapper now fails fast if more than one unfinished row exists.

## Seed One Controlled Topic

Insert one temporary approved topic:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "insert into content_items (title, slug, category, confidence_label, target_duration_seconds, brand_profile, source_payload_json, status, approved_at, created_at, updated_at) values ('The Village Bell That Rang Again After the Drought', 'tmp-one-click-reel-' || to_char(now(), 'YYYYMMDD-HH24MISS'), 'history', 'likely', 45, 'default', '{\"source_notes\":[\"Several submerged villages re-emerge during droughts or low reservoir conditions.\",\"Church towers, roads, and foundations often become the strongest surviving landmarks.\",\"These stories are usually remembered as human displacement and memory stories, not only engineering facts.\"],\"source_urls\":[\"https://en.wikipedia.org/wiki/Submerged_village\"]}'::jsonb, 'idea_approved', now(), now(), now()) returning content_id, slug;"
```

## Run the One-Click Workflow

Fastest reproducible path:

```bash
docker exec n8n-insta node /workflows/scripts/execute_workflow_by_name.mjs wf_end_to_end_reel_generate_and_publish /workflows/n8n/wf_end_to_end_reel_generate_and_publish.json
```

What this wrapper does:

1. activates `wf_render_status_callback`
2. finds the single unfinished Reel candidate in Postgres
3. normalizes a few transient states like `scripting` back to their last safe checkpoint
4. resumes only the remaining downstream stages for the current `content_items.status`
5. waits for render completion when the candidate is already in `render_queued`
6. runs captioning and Reel publish only when the candidate has reached `render_complete`

Supported resume checkpoints:

- `idea_approved`
- `script_complete`
- `storyboard_complete`
- `assets_ready`
- `narration_ready`
- `render_manifest_ready`
- `render_queued`
- `render_complete`

Automatically normalized transient states:

- `scripting` -> `idea_approved`
- `storyboarding` -> `script_complete`
- `generating_assets` -> `storyboard_complete`
- `generating_narration` -> `assets_ready`
- `building_render_manifest` -> `narration_ready`
- `dispatching_render` -> `render_queued` or `render_manifest_ready`, depending on `renders.render_status`

Render strategy:

- if `RENDER_WORKER_MODE=webhook`, one-click uses `wf_render_worker_dispatch` and then waits for the callback path
- otherwise, if `RENDER_WORKER_SYNC_URL` or `RENDER_WORKER_URL` is available, one-click uses `wf_render_sync_completion` instead
- old `render_queued` rows that were created by stub dispatch are automatically rewound to `render_manifest_ready` before the next one-click run

## Verify the Result

Latest published Reel:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status as content_status, p.publish_status, p.instagram_media_id, p.instagram_container_id, p.published_at, r.output_video_url from content_items ci join publishes p on p.content_id = ci.content_id left join renders r on r.content_id = ci.content_id where ci.slug like 'tmp-one-click-reel-%' order by coalesce(p.published_at, ci.updated_at) desc limit 1;"
```

Full workflow trail for the latest temporary candidate:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, wr.workflow_name, wr.run_status, wr.error_message, wr.started_at from content_items ci join workflow_runs wr on wr.content_id = ci.content_id where ci.slug like 'tmp-one-click-reel-%' order by wr.started_at desc limit 20;"
```

Render verification:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status, r.render_status, r.output_video_url, r.resolution, r.duration_seconds from content_items ci join renders r on r.content_id = ci.content_id where ci.slug like 'tmp-one-click-reel-%' order by ci.updated_at desc limit 1;"
```

## Pass Condition

- the topic progresses to `content_items.status = published`
- `publishes.publish_status = published`
- `publishes.instagram_container_id` is populated
- `publishes.instagram_media_id` is populated
- `renders.render_status = success`
- `renders.output_video_url` is a public `.mp4`

## Failure Triage

If the wrapper fails, the most common breakpoints are:

- prompt template mismatch:
  missing `{{placeholder}}` data or invalid response schema
- queue ambiguity:
  more than one unfinished row exists, so the resume wrapper refuses to guess
- render callback not active:
  `wf_render_status_callback` not registered in `webhook_entity`
- render failure:
  inspect `renders.render_log` and the `wf_render_worker_dispatch` or `wf_render_status_callback` rows
- publish failure:
  inspect the latest `wf_instagram_reel_publish` row in `workflow_runs`

## Cleanup

Remove temporary one-click candidates:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "delete from content_items where slug like 'tmp-one-click-reel-%';"
```
