# 15 — Delivery and Testing Workflow

This is the active delivery/testing tracker.

## Updated Links

- Active tracker: [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/docs/delivery/delivery-and-testing-workflow.md)
- Engineering backlog: [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/docs/delivery/engineering-backlog.md)
- Completed items archive: [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)
- Setup checklist: [docs/delivery/setup-checklist.md](/Users/rajchodisetti/n8n-insta/docs/delivery/setup-checklist.md)
- MVP smoke test runbook: [docs/runbooks/mvp-smoke-test-and-publish.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/mvp-smoke-test-and-publish.md)
- Prompt reference: [21 — Prompt Reference and Model Call Map](/Users/rajchodisetti/n8n-insta/docs/prompts/prompt-reference-and-model-call-map.md)
- One-click Reel runbook: [22 — One-Click Reel Generate and Publish Runbook](/Users/rajchodisetti/n8n-insta/docs/runbooks/one-click-reel-generate-and-publish.md)
- Studio UI runbook: [25 — Studio UI Runbook](/Users/rajchodisetti/n8n-insta/docs/runbooks/studio-ui.md)

## Browser Studio

The repo now includes a local browser control panel for common pipeline operations.

Start it with the stack:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis minio minio-bootstrap n8n render-worker studio-ui
```

Then open:

```text
http://localhost:7780
```

Use it for:

- topic injection into `content_items`
- prompt-file editing under `prompts/`
- env-backed runtime setting changes for placeholder defaults, models, providers, voice, and host selection
- launching one-click or individual workflows

## How Tracking Works

Use these three documents together:

- [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/docs/delivery/engineering-backlog.md)
  Source of truth for what still needs to be built and what is in scope for the MVP.
- [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/docs/delivery/delivery-and-testing-workflow.md)
  Active tracker for items that have been implemented and are waiting for testing.
- [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)
  Archive of items that already passed testing.

Rule:

1. backlog sequencing lives in the engineering backlog
2. once an item is implemented, it moves here for testing
3. once it passes testing, it moves into the completed-items archive
4. every completion message should include the updated links above
5. every testing section should include exact DB check commands and, if needed, exact insert or update commands
6. every `implemented_awaiting_test` item must document:
   - what was delivered
   - why you are testing it
   - exact prerequisites
   - exact test steps
   - exact DB checks or observable outputs
   - clear pass conditions
   - cleanup steps if the test creates synthetic data
7. after an item passes testing, the feature PR target should be `release/2.0`
8. `main` should only receive promoted changes from `release/2.0`

## Branching Rule

For all work after Phase 1:

- cut feature branches from `release/2.0`
- merge tested feature branches into `release/2.0`
- merge `release/2.0` into `main` only when the branch contains a meaningful validated upgrade

## Status Model

- `backlog`
- `implemented_awaiting_test`
- `complete`

## Required Entry Format

Every new item added to `implemented_awaiting_test` must use this structure:

### `ITEM-ID` short title

Status: `implemented_awaiting_test`

What Was Delivered:

- concrete code, workflow, script, or config that changed
- key behavior now supported

Why You Are Testing It:

- the user-visible or system-critical behavior that still needs confirmation
- the failure or regression risk this test is meant to catch

Prerequisites:

- env flags, credentials, data state, or running services needed before the test

How To Test:

1. exact commands to run, or exact n8n/manual UI path
2. exact DB checks or observable outputs to inspect
3. cleanup commands if needed

Pass Condition:

- exact expected result
- exact DB state or log evidence that confirms success

Notes:

- optional local validation context from implementation, if it helps you understand what you are confirming

## Current Items in `implemented_awaiting_test`

### `P3-06` live reel publish path

Status: `implemented_awaiting_test`

What Was Delivered:

- added [infra/render-worker/app.py](/Users/rajchodisetti/n8n-insta/infra/render-worker/app.py), [Dockerfile](/Users/rajchodisetti/n8n-insta/infra/render-worker/Dockerfile), and [requirements.txt](/Users/rajchodisetti/n8n-insta/infra/render-worker/requirements.txt) for a local FFmpeg render worker that assembles the generated scene images plus narration audio into a public MP4 and calls back into n8n
- updated [infra/docker-compose.yml](/Users/rajchodisetti/n8n-insta/infra/docker-compose.yml) so `n8n` and `render-worker` can run in either stub mode or live webhook mode with explicit `RENDER_WORKER_MODE`, `RENDER_WORKER_URL`, and `RENDER_CALLBACK_URL` env wiring
- updated [wf_render_worker_dispatch.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_render_worker_dispatch.json) to include `callback_url` in the worker request, added [wf_instagram_reel_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_reel_publish.json) for live Reel publish, and extended [wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json) so rendered reels can still receive a final caption package
- added [prepare_phase3_live_reel_candidate.sh](/Users/rajchodisetti/n8n-insta/scripts/prepare_phase3_live_reel_candidate.sh) plus [docs/runbooks/phase3-live-reel-publish.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/phase3-live-reel-publish.md) to prepare one real narrated Reel candidate and then manually publish it

Why You Are Testing It:

- this is the first true end-to-end narrated Reel path, so the test needs to confirm that FFmpeg rendering, callback completion, caption packaging, and Meta Reel publishing all work together on one real candidate
- the main risks are worker callback registration, MP4 rehosting, `render_queued -> render_complete` completion, and Meta rejecting the final reel publish because of asset URL, token, or container-processing issues

Prerequisites:

- the local Docker stack is running
- the repo-root `.env` contains working OpenAI, ImageKit, and Instagram publish credentials
- `INSTAGRAM_PUBLISH_ENABLED=true`
- if you changed `.env`, recreate `n8n` and `render-worker`

How To Test:

1. Prepare one real candidate:
   `bash scripts/prepare_phase3_live_reel_candidate.sh`
2. Verify the prepared candidate:
   `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status, r.render_status, r.output_video_url, p.publish_status from content_items ci join renders r on r.content_id = ci.content_id left join publishes p on p.content_id = ci.content_id where ci.slug like 'tmp-phase3-live-reel-%' order by ci.created_at desc limit 1;"`
3. Open the `output_video_url` and review the rendered Reel.
4. Run the live publish workflow from n8n:
   `wf_instagram_reel_publish`
5. Verify the final publish state:
   `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status as content_status, p.publish_status, p.instagram_media_id, p.instagram_container_id, p.published_at from content_items ci join publishes p on p.content_id = ci.content_id where ci.slug like 'tmp-phase3-live-reel-%' order by ci.created_at desc limit 1;"`

Pass Condition:

- the preparation helper exits successfully
- the latest temporary candidate reaches `content_items.status = render_complete`, `renders.render_status = success`, and a public `.mp4` `output_video_url`
- `wf_instagram_reel_publish` ends with `publishes.publish_status = published`, populated `instagram_container_id`, and populated `instagram_media_id`

Notes:

- the render worker posts its completion payload into the active production webhook on `wf_render_status_callback`, so the helper activates that workflow automatically before dispatch
- the helper leaves the temporary candidate in place by default so you can review the reel before you trigger the real publish step

### `P4-01` Instagram metrics collection

Status: `implemented_awaiting_test`

What Was Delivered:

- added [wf_instagram_metrics_collection.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_metrics_collection.json) to select the next published Instagram item that is due for a `24h`, `72h`, or `7d` snapshot, collect normalized metrics in either stub or live mode, and persist the result into `insight_snapshots`
- added [test_phase4_metrics_collection_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase4_metrics_collection_smoke.sh) to seed one temporary published Instagram item, run the metrics workflow inline, and validate both the newest `insight_snapshots` row and the associated `workflow_runs` log
- the workflow supports `INSTAGRAM_INSIGHTS_COLLECTION_MODE=stub` for deterministic local testing and `live` for Meta Graph API collection using the configured token

Why You Are Testing It:

- this is the first analytics step after publishing, so the test needs to confirm that published content can now produce a normalized insight snapshot instead of leaving the feedback loop empty
- the main risks are due-window selection, normalized metric persistence, raw payload auditability, and consistent workflow-run logging for later review steps

Prerequisites:

- the local Docker stack is running
- for the default smoke test path, the repo-root `.env` contains `INSTAGRAM_INSIGHTS_COLLECTION_MODE=stub` or leaves it unset
- if you want to exercise live Meta collection later, the repo-root `.env` contains a valid `INSTAGRAM_GRAPH_API_TOKEN` with the needed Instagram insight permissions
- if you want to run the inline helper instead of only using the n8n UI, keep `N8N_RUNNERS_ENABLED=false` in `infra/.env` and recreate `n8n`

How To Test:

1. Run the smoke test:
   `bash scripts/test_phase4_metrics_collection_smoke.sh`
2. If you want to inspect the latest snapshot directly, run:
   `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, s.snapshot_window, s.views, s.reach, s.likes, s.comments, s.shares, s.saves, s.engagement_rate, s.snapshot_taken_at from content_items ci join insight_snapshots s on s.content_id = ci.content_id where ci.slug like 'tmp-phase4-metrics-%' order by s.snapshot_taken_at desc limit 1;"`
3. Verify the latest workflow log:
   `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select workflow_name, run_status, details_json->'metrics_collection'->>'snapshot_window' as snapshot_window, details_json->'metrics_collection'->>'collection_mode' as collection_mode, details_json->'metrics_collection'->>'views' as views from workflow_runs where workflow_name = 'wf_instagram_metrics_collection' order by started_at desc limit 3;"`

Pass Condition:

- the smoke test exits successfully
- the temporary content row gets a new `insight_snapshots` row with `snapshot_window = 24h`
- the newest snapshot has non-empty normalized metrics such as `views`, `reach`, `likes`, `comments`, `shares`, and `saves`
- the latest `workflow_runs` row for `wf_instagram_metrics_collection` shows `run_status = success` and includes non-empty `snapshot_window`, `collection_mode`, and `views` details

### `P3-07` prompt externalization and one-click Reel orchestration

Status: `implemented_awaiting_test`

What Was Delivered:

- moved the active model prompts into editable files under [prompts/](/Users/rajchodisetti/n8n-insta/prompts/README.md) for research, storyboard, single-call caption and hashtags, scene asset generation, narration generation, and simple-post image generation
- added [workflows/scripts/prompt_utils.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/prompt_utils.mjs) and [workflows/scripts/build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) so workflows load prompt files from `PROMPTS_ROOT` or `/prompts` instead of keeping the prompt text inside workflow JSON
- updated the affected workflows and generation helpers to build runtime prompt payloads from those files
- added [workflows/scripts/wait_for_render_completion.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/wait_for_render_completion.mjs) and extended [workflows/scripts/execute_workflow_by_name.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/execute_workflow_by_name.mjs) so the unified workflow can activate the render callback and wait for the asynchronous render stage
- added the unified workflow [wf_end_to_end_reel_generate_and_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_end_to_end_reel_generate_and_publish.json), the prompt reference [docs/prompts/prompt-reference-and-model-call-map.md](/Users/rajchodisetti/n8n-insta/docs/prompts/prompt-reference-and-model-call-map.md), and the live runbook [docs/runbooks/one-click-reel-generate-and-publish.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/one-click-reel-generate-and-publish.md)

Why You Are Testing It:

- prompt editing now depends on file-backed assets instead of inline workflow strings, so the test needs to confirm that prompt changes are picked up directly from `prompts/` without editing workflow JSON
- the one-click wrapper is the first orchestration layer that chains the full narrated Reel path into one run, so the test needs to confirm that callback activation, render waiting, caption packaging, and live publish all happen in order

Prerequisites:

- the local Docker stack is running
- the repo-root `.env` contains valid OpenAI, ImageKit, and Instagram credentials
- `INSTAGRAM_PUBLISH_ENABLED=true` if you want to validate the final live publish stage
- if `.env` changed, recreate `n8n` and `render-worker`
- keep the active content queue controlled before the one-click run so each sub-workflow claims the same candidate

How To Test:

1. Confirm the prompt mount is visible inside `n8n`:
   `docker exec n8n-insta sh -lc 'echo "$PROMPTS_ROOT" && test -f /prompts/research_and_script/system.md && test -f /prompts/caption_and_hashtags/system.md && test -f /prompts/scene_asset_generation/prompt.md && echo prompts_ok'`
2. Re-run the existing prompt-backed smoke coverage:
   `bash scripts/test_phase2_topic_to_storyboard_smoke.sh`
   `bash scripts/test_phase2_caption_iteration_smoke.sh`
   `bash scripts/test_phase3_scene_asset_generation_smoke.sh`
   `bash scripts/test_phase3_narration_generation_smoke.sh`
3. Seed one controlled live candidate and run the unified wrapper using [22 — One-Click Reel Generate and Publish Runbook](/Users/rajchodisetti/n8n-insta/docs/runbooks/one-click-reel-generate-and-publish.md)
4. Verify the final state:
   `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status as content_status, p.publish_status, p.instagram_media_id, p.instagram_container_id, p.published_at, r.output_video_url from content_items ci join publishes p on p.content_id = ci.content_id left join renders r on r.content_id = ci.content_id where ci.slug like 'tmp-one-click-reel-%' order by coalesce(p.published_at, ci.updated_at) desc limit 1;"`
5. Verify the workflow trail:
   `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, wr.workflow_name, wr.run_status, wr.error_message, wr.started_at from content_items ci join workflow_runs wr on wr.content_id = ci.content_id where ci.slug like 'tmp-one-click-reel-%' order by wr.started_at desc limit 20;"`

Pass Condition:

- the prompt mount check prints `prompts_ok`
- the smoke tests still pass while loading prompt text from files
- the one-click wrapper advances the same temporary candidate through the expected stages and ends with `content_items.status = published`
- the final published row has populated `instagram_container_id`, populated `instagram_media_id`, and a public `.mp4` `renders.output_video_url`

### `P3-08` adapter-first provider and host architecture

Status: `implemented_awaiting_test`

What Was Delivered:

- added [workflows/scripts/adapter_config.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/adapter_config.mjs), [image_generation_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/image_generation_adapters.mjs), [tts_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/tts_adapters.mjs), and [asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs) so provider choice is centralized instead of spread across workflow code
- updated the text workflows to invoke [invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs) instead of calling OpenAI directly from multiple n8n code nodes
- updated the scene-image, narration, post-image, and render paths to prepare generic provider/model payloads and use adapter-based upload/generation helpers
- added [docs/architecture/adapter-architecture-and-provider-switching.md](/Users/rajchodisetti/n8n-insta/docs/architecture/adapter-architecture-and-provider-switching.md) plus `.env.example` selector docs for per-component switching

Why You Are Testing It:

- this is the repo-wide architecture change that makes future provider swaps practical, so the test needs to confirm that the current OpenAI defaults still work after moving provider selection into adapters
- the main risks are regression in the existing smoke-tested stages and silent fallback to the wrong provider or host

Prerequisites:

- the local Docker stack is running
- the repo-root `.env` has the current working defaults for OpenAI and your selected asset host
- if you changed `.env`, recreate `n8n`

How To Test:

1. Confirm the new selector surface exists:
   `rg -n "TEXT_LLM_PROVIDER|IMAGE_GENERATION_PROVIDER|NARRATION_PROVIDER|RENDER_PROVIDER|ASSET_HOST_PROVIDER" .env.example`
2. Re-run the adapter-backed smoke coverage:
   `bash scripts/test_phase2_topic_to_storyboard_smoke.sh`
   `bash scripts/test_phase2_caption_iteration_smoke.sh`
   `bash scripts/test_phase3_scene_asset_generation_smoke.sh`
   `bash scripts/test_phase3_narration_generation_smoke.sh`
3. Verify recent workflow logs still show successful runs:
   `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select workflow_name, run_status, details_json->>'generation_model' as generation_model, started_at from workflow_runs where workflow_name in ('wf_research_and_script','wf_storyboard_and_prompts','wf_caption_and_hashtags','wf_asset_generation','wf_narration_generation') order by started_at desc limit 12;"`
4. Review the architecture guide:
   [24 — Adapter Architecture and Provider Switching](/Users/rajchodisetti/n8n-insta/docs/architecture/adapter-architecture-and-provider-switching.md)

Pass Condition:

- the selector grep shows the new generic provider env vars
- the smoke tests still pass under the default adapters
- recent workflow logs remain `success`
- the new guide clearly maps each component to its selector env vars and adapter file

## Completed Items (moved to archive)

### 22. `P3-05` render completion callback

Archive entry:

- [22 — Phase 3 Render Completion Callback](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/22-phase3-render-completion-callback.md)

### 21. `P3-04` render worker handoff

Archive entry:

- [21 — Phase 3 Render Worker Handoff](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/21-phase3-render-worker-handoff.md)

### 20. `P3-03` render manifest construction

Archive entry:

- [20 — Phase 3 Render Manifest Construction](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/20-phase3-render-manifest-construction.md)

### 19. `P3-02` narration generation

Archive entry:

- [19 — Phase 3 Narration Generation](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/19-phase3-narration-generation.md)

### 18. `P3-01` scene asset generation

Archive entry:

- [18 — Phase 3 Scene Asset Generation](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/18-phase3-scene-asset-generation.md)

### 17. `P2-04` smarter image generation + `P2-05` basic content approval flow

Archive entry:

- [17 — Phase 2 Smarter Image Generation and Approval Flow](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/17-phase2-image-generation-and-approval-flow.md)

### 16. `P2-03` better hashtag ranking

Archive entry:

- [16 — Phase 2 Better Hashtag Ranking](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/16-phase2-better-hashtag-ranking.md)

### 15. `P2-02` stronger caption iteration

Archive entry:

- [15 — Phase 2 Stronger Caption Iteration](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/15-phase2-stronger-caption-iteration.md)

### 14. `P2-01` topic to script to storyboard draft generation

Archive entry:

- [14 — Phase 2 Topic to Script to Storyboard Draft Generation](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/14-phase2-topic-to-script-to-storyboard-draft-generation.md)

### 10. `MVP-06` Instagram publishing credentials and account validation

Status: `complete` ✅

Archive entry:

- [10 — Instagram Publishing Credentials and Account Validation](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/10-instagram-publishing-credentials-and-account-validation.md)
- Exact test steps and DB validation commands now live only in the archive record above.

### 11. `MVP-07` simple Instagram publish workflow

Archive entry:

- [11 — Simple Instagram Publish Workflow](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/11-simple-instagram-publish-workflow.md)

### 12. `MVP-08` publish metadata persistence and duplicate protection

Archive entry:

- [12 — Publish Metadata Persistence and Duplicate Protection](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/12-publish-metadata-persistence-and-duplicate-protection.md)

### 13. `MVP-09` smoke test and publish runbook

Archive entry:

- [13 — Smoke Test and Publish Runbook](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/13-smoke-test-and-publish-runbook.md)
- Primary runbook: [18 — MVP Smoke Test and Publish Runbook](/Users/rajchodisetti/n8n-insta/docs/runbooks/mvp-smoke-test-and-publish.md)

## Next Item After MVP Completion

- current active item is `P4-01` in [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/docs/delivery/engineering-backlog.md)
