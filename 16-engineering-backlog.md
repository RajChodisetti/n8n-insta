# 16 — Engineering Backlog

This is the source of truth for engineering scope and sequencing.

## Tracking Model

Use these documents together:

- Backlog and sequencing: [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)
- Active testing tracker: [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md)
- Completed archive: [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)

## Product Scope

Long-term vision:

- automated Instagram storytelling engine
- scripts, storyboards, assets, renders, publishing, insights

Working MVP:

- create one simple Instagram post
- use one topic plus one caption plus best hashtags
- publish without complex video rendering
- prove the end-to-end loop first

For the MVP, the goal is not a Reel engine.
The goal is a reliable publish loop for a basic Instagram post.

## MVP Definition

The MVP is complete when the system can:

1. accept a topic
2. generate a short caption draft
3. generate a compact hashtag set
4. attach a simple image asset
5. publish the post to Instagram
6. persist publish metadata

## MVP Backlog

### MVP-01 Foundation and local runtime

Status: `complete`

Includes:

- Docker runtime
- PostgreSQL
- MinIO
- n8n setup

### MVP-02 Topic intake and script persistence

Status: `complete`

Includes:

- manual topic ingest
- research/script workflow scaffold
- script persistence to PostgreSQL

### MVP-03 Simple storyboard support

Status: `complete`

Includes:

- storyboard prompt templates
- storyboard workflow scaffold
- storyboard persistence

Note:

- this is already built, but it is no longer on the critical path for the first working MVP

### MVP-04 Caption and hashtag generator

Status: `complete` ✅

Goal:

- produce a publish-ready caption
- produce a compact hashtag list optimized for the topic and brand

Deliverables:

- prompt template or workflow node for caption + hashtags
- DB persistence into `publishes` draft fields or a dedicated draft payload
- simple test path from an existing content item

Implemented artifacts:

- [prompts/caption_and_hashtags/system.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/system.md)
- [prompts/caption_and_hashtags/user.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/user.md)
- [prompts/caption_and_hashtags/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/response-schema.json)
- [workflows/n8n/wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json)

### MVP-05 Simple image post asset path

Status: `complete` ✅

Goal:

- use a single image for the first post flow

Accepted approaches for MVP:

- manual image URL or local uploaded image
- generated single image prompt
- placeholder static asset for smoke tests

Deliverables:

- one repeatable asset source for a feed post
- asset reference persisted for the content item

Implemented artifacts:

- [workflows/assets/mvp_simple_post.svg](/Users/rajchodisetti/n8n-insta/workflows/assets/mvp_simple_post.svg)
- [workflows/n8n/wf_simple_post_image_asset.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_simple_post_image_asset.json)

### MVP-06 Instagram publishing credentials and account validation

Status: `complete` ✅

Goal:

- confirm the account can publish through the API path intended for MVP

Deliverables:

- credential storage strategy in n8n
- account permission checks
- publish prerequisites documented

Implemented artifacts:

- [workflows/n8n/wf_instagram_publish_readiness.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_publish_readiness.json)
- [14-instagram-professional-account-runbook.md](/Users/rajchodisetti/n8n-insta/14-instagram-professional-account-runbook.md)

### MVP-07 Simple Instagram publish workflow

Status: `complete` ✅

Goal:

- publish a basic Instagram post with caption and hashtags

Deliverables:

- publish workflow in n8n
- pre-publish validation
- image post API call
- success and failure logging

### MVP-08 Publish metadata persistence and duplicate protection

Status: `complete` ✅

Goal:

- store what was published and prevent duplicate posts

Deliverables:

- publish metadata write to `publishes`
- duplicate detection by `content_id`
- retry-safe behavior

### MVP-09 Smoke test and publish runbook

Status: `complete` ✅

Goal:

- make the MVP repeatable by anyone opening the repo

Deliverables:

- exact setup and run commands
- exact DB check commands
- troubleshooting notes

## After MVP

These are intentionally moved out of the critical path.

### Phase 2 — Better content packaging

### P2-01 Topic to script to storyboard draft generation

Status: `complete` ✅

Goal:

- turn one approved topic into a persisted script package and a persisted storyboard package using OpenAI structured outputs

Deliverables:

- [workflows/n8n/wf_research_and_script.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_research_and_script.json)
- [workflows/n8n/wf_storyboard_and_prompts.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_storyboard_and_prompts.json)
- atomic queue-claim behavior for `idea_approved -> scripting -> script_complete -> storyboarding -> storyboard_complete`
- [scripts/test_phase2_topic_to_storyboard_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase2_topic_to_storyboard_smoke.sh)

### P2-02 Stronger caption iteration

Status: `complete` ✅

Goal:

- replace the MVP mock caption generator with a real OpenAI-backed iterative caption workflow
- generate multiple caption directions, refine the strongest one, and persist a stronger draft package for publish review

Deliverables:

- [prompts/caption_and_hashtags/system.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/system.md)
- [prompts/caption_and_hashtags/user.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/user.md)
- [prompts/caption_and_hashtags/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/response-schema.json)
- [workflows/n8n/wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json)
- [scripts/test_phase2_caption_iteration_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase2_caption_iteration_smoke.sh)
- workflow-run logging for caption iteration details in `workflow_runs.details_json`

### P2-03 Better hashtag ranking

Status: `complete` ✅

Goal:

- improve the publish-draft hashtag quality by generating multiple compact hashtag candidates and ranking the strongest set
- persist the selected set together with ranking metadata so the result is auditable during review

Deliverables:

- [prompts/caption_and_hashtags/system.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/system.md)
- [prompts/caption_and_hashtags/user.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/user.md)
- [prompts/caption_and_hashtags/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/response-schema.json)
- [workflows/n8n/wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json)
- [scripts/test_phase2_hashtag_ranking_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase2_hashtag_ranking_smoke.sh)
- workflow-run logging for hashtag ranking details in `workflow_runs.details_json`

### P2-04 Smarter image generation

Status: `complete` ✅

Goal:

- replace the static post-image placeholder with an OpenAI-backed generated-image workflow that produces a story-specific Instagram post image
- rehost the generated JPEG into a stable public delivery host, then persist that delivery URL and prompt metadata for later manual review and publish validation

Deliverables:

- [workflows/n8n/wf_simple_post_image_asset.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_simple_post_image_asset.json)
- [workflows/scripts/generate_and_rehost_post_image.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_post_image.mjs)
- [scripts/prepare_phase2_live_post_candidate.sh](/Users/rajchodisetti/n8n-insta/scripts/prepare_phase2_live_post_candidate.sh)
- OpenAI image-generation metadata plus rehost details persisted in `assets.metadata_json`
- `storyboard_complete -> generating_assets -> approval_pending` queue behavior
- workflow-run logging for generated image details in `workflow_runs.details_json`

### P2-05 Basic content approval flow

Status: `complete` ✅

Goal:

- introduce one manual approval checkpoint before live Instagram publish for the generated post package
- allow approve and reject decisions with persisted status changes and review notes

Deliverables:

- [workflows/n8n/wf_content_approval.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_content_approval.json)
- combined manual live-test preparation helper [scripts/prepare_phase2_live_post_candidate.sh](/Users/rajchodisetti/n8n-insta/scripts/prepare_phase2_live_post_candidate.sh)
- `approval_pending -> qa_approved` and `approval_pending -> approval_rejected` state transitions
- review decisions logged in `workflow_runs.details_json`

### Phase 3 — Reel/video pipeline

- scene asset generation
- narration generation
- render manifest construction
- FFmpeg or external render worker
- Reel publishing path

### P3-01 Scene asset generation

Status: `complete` ✅

Goal:

- turn a completed storyboard package into persisted per-scene visual assets for the Reel pipeline
- generate portrait scene frames that can feed a later render-manifest and video assembly step

Deliverables:

- [workflows/n8n/wf_asset_generation.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_asset_generation.json)
- [workflows/scripts/generate_and_rehost_scene_assets.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_scene_assets.mjs)
- [scripts/test_phase3_scene_asset_generation_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase3_scene_asset_generation_smoke.sh)
- `storyboard_complete -> generating_assets -> assets_ready` queue behavior for scene-level assets
- persisted `scene_image` asset rows with `scene_number`, duration, provider, delivery URL, and per-scene metadata in `assets.metadata_json`
- workflow-run logging for scene asset generation details in `workflow_runs.details_json.scene_asset_generation`

### P3-02 Narration generation

Status: `complete` ✅

Goal:

- turn a completed script plus scene-asset package into a persisted narration track for the Reel pipeline
- generate a reusable audio asset that later render-manifest steps can combine with the scene images

Deliverables:

- [workflows/n8n/wf_narration_generation.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_narration_generation.json)
- [workflows/scripts/generate_and_rehost_narration_audio.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_narration_audio.mjs)
- [scripts/test_phase3_narration_generation_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase3_narration_generation_smoke.sh)
- `assets_ready -> generating_narration -> narration_ready` queue behavior
- persisted `narration_audio` asset rows with provider, delivery URL, mime type, estimated duration, voice, and metadata in `assets.metadata_json`
- workflow-run logging for narration generation details in `workflow_runs.details_json.narration_audio`

### P3-03 Render manifest construction

Status: `complete` ✅

Goal:

- turn the scene-asset plus narration package into a persisted render manifest for the future FFmpeg/external render worker
- produce one canonical timeline payload that later render execution can consume without re-querying earlier pipeline steps

Deliverables:

- [workflows/n8n/wf_render_manifest_construction.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_render_manifest_construction.json)
- [scripts/test_phase3_render_manifest_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase3_render_manifest_smoke.sh)
- `narration_ready -> building_render_manifest -> render_manifest_ready` queue behavior
- persisted `renders` row with `render_manifest_json`, cover image URL, resolution, aspect ratio, duration, and `render_status = manifest_ready`
- workflow-run logging for manifest construction details in `workflow_runs.details_json.render_manifest`

### P3-04 Render worker handoff

Status: `complete` ✅

Goal:

- send the persisted render manifest to a future FFmpeg/external render worker without recomputing upstream package data
- persist a queued render request so later callback/polling steps can continue from a stable request record

Deliverables:

- [workflows/n8n/wf_render_worker_dispatch.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_render_worker_dispatch.json)
- [scripts/test_phase3_render_worker_dispatch_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase3_render_worker_dispatch_smoke.sh)
- `render_manifest_ready -> dispatching_render -> render_queued` queue behavior
- persisted `renders.render_status = queued` plus `renders.render_log` containing the worker request metadata
- workflow-run logging for render dispatch details in `workflow_runs.details_json.render_request`

### P3-05 Render completion callback

Status: `complete` ✅

Goal:

- accept a worker completion payload and persist the final render result without regenerating upstream content
- update the pipeline from `render_queued` into either `render_complete` or `render_failed`

Deliverables:

- [workflows/n8n/wf_render_status_callback.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_render_status_callback.json)
- [scripts/test_phase3_render_status_callback_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase3_render_status_callback_smoke.sh)
- `render_queued -> render_complete` and `render_queued -> render_failed` completion behavior
- persisted `renders.output_video_url`, `cover_image_url`, `duration_seconds`, `resolution`, and final `render_status`
- workflow-run logging for callback completion details in `workflow_runs.details_json.render_callback`

### P3-06 Live reel publish path

Status: `implemented_awaiting_test`

Goal:

- turn the completed render package into a real Instagram Reel candidate with a public MP4, final caption package, and a live publish workflow
- keep the last publish step manual so the reel can be visually reviewed before it goes live

Deliverables:

- [infra/render-worker/app.py](/Users/rajchodisetti/n8n-insta/infra/render-worker/app.py) plus its Docker packaging for a local FFmpeg render worker that assembles scene images and narration audio into a public MP4 and posts the completion callback back into n8n
- [workflows/n8n/wf_instagram_reel_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_reel_publish.json)
- [scripts/prepare_phase3_live_reel_candidate.sh](/Users/rajchodisetti/n8n-insta/scripts/prepare_phase3_live_reel_candidate.sh)
- [20-phase3-live-reel-publish-runbook.md](/Users/rajchodisetti/n8n-insta/20-phase3-live-reel-publish-runbook.md)
- `render_manifest_ready -> render_queued -> render_complete -> published` live path coverage for narrated Reels
- workflow-run logging for worker callback completion and final reel publish details

### P3-07 Prompt externalization and one-click Reel orchestration

Status: `implemented_awaiting_test`

Goal:

- make the active model prompts editable from files instead of buried in workflow JSON
- add one orchestration workflow that can move a single approved topic through generation, rendering, captioning, and live Reel publish in one trigger

Deliverables:

- [prompts/](/Users/rajchodisetti/n8n-insta/prompts/README.md) expanded to include all active text, image, and narration prompt assets
- [workflows/scripts/prompt_utils.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/prompt_utils.mjs)
- [workflows/scripts/build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs)
- [workflows/scripts/wait_for_render_completion.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/wait_for_render_completion.mjs)
- [workflows/scripts/execute_workflow_by_name.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/execute_workflow_by_name.mjs) support for workflow activation
- [workflows/n8n/wf_end_to_end_reel_generate_and_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_end_to_end_reel_generate_and_publish.json)
- [21-prompt-reference-and-model-call-map.md](/Users/rajchodisetti/n8n-insta/21-prompt-reference-and-model-call-map.md)
- [22-one-click-reel-generate-and-publish-runbook.md](/Users/rajchodisetti/n8n-insta/22-one-click-reel-generate-and-publish-runbook.md)
- file-backed prompt loading through `PROMPTS_ROOT` or `/prompts`
- one-trigger stage order:
  `research -> storyboard -> scene assets -> narration -> render manifest -> render dispatch -> wait for render completion -> caption package -> Reel publish`

### P3-08 Adapter-first provider and host architecture

Status: `implemented_awaiting_test`

Goal:

- make provider choice a first-class adapter concern instead of a hardcoded workflow detail
- allow each major component to switch providers, models, voices, render engines, and asset hosts independently through `.env`

Deliverables:

- [workflows/scripts/adapter_config.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/adapter_config.mjs)
- [workflows/scripts/invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)
- [workflows/scripts/image_generation_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/image_generation_adapters.mjs)
- [workflows/scripts/tts_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/tts_adapters.mjs)
- [workflows/scripts/asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs)
- adapter-driven updates to [wf_research_and_script.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_research_and_script.json), [wf_storyboard_and_prompts.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_storyboard_and_prompts.json), [wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json), [wf_asset_generation.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_asset_generation.json), [wf_narration_generation.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_narration_generation.json), [wf_simple_post_image_asset.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_simple_post_image_asset.json), and the render handoff flow
- [24-adapter-architecture-and-provider-switching.md](/Users/rajchodisetti/n8n-insta/24-adapter-architecture-and-provider-switching.md)
- generic selector envs in [.env.example](/Users/rajchodisetti/n8n-insta/.env.example)
- fail-fast behavior when an adapter is selected but not implemented

### Phase 4 — Analytics and learning loop

- metrics collection
- performance review
- next-post recommendations

### P4-01 Instagram metrics collection

Status: `implemented_awaiting_test`

Goal:

- collect one normalized Instagram insight snapshot for each published post at the right milestone window without mutating upstream content packaging state
- persist raw metric payloads plus normalized snapshot fields so later review workflows can compare posts over time

Deliverables:

- [workflows/n8n/wf_instagram_metrics_collection.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_metrics_collection.json)
- [scripts/test_phase4_metrics_collection_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase4_metrics_collection_smoke.sh)
- milestone-based `insight_snapshots` writes for `24h`, `72h`, and `7d` windows based on `publishes.published_at`
- normalized metrics persisted into `insight_snapshots` together with the raw response payload in `raw_payload_json`
- workflow-run logging for collection details in `workflow_runs.details_json.metrics_collection`

## Current Progress

Working MVP backlog:

- complete: `10`
- remaining: `0`

Current recommended next build item:

- `P4-01 Instagram metrics collection`
