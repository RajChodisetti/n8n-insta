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

### Phase 4 — Analytics and learning loop

- metrics collection
- performance review
- next-post recommendations

## Current Progress

Working MVP backlog:

- complete: `9`
- remaining: `0`

Current recommended next build item:

- `Phase 3 — Reel/video pipeline`
