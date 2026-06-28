# Architecture Summary

Last reviewed: 2026-06-21 at git commit `d1e1bd0`.

## System purpose

The repo builds an Instagram-only AI storytelling workflow. The long-term flow is:

`idea -> research/script -> storyboard -> assets -> narration -> render -> QA/approval -> publish -> metrics -> improve`

The current implementation is migrating from a local n8n-centered automation stack to code-first orchestration. Studio/API queues pipeline runs, `pipeline-worker` executes stages from Postgres-backed run/step state, n8n workflow exports remain as fallback/reference, and the stack uses Postgres state, object/GCS asset hosting, Remotion rendering by default, FFmpeg render fallback, shell smoke tests, and Studio UI.

## Major runtime components

| Component | Current implementation |
| --- | --- |
| Orchestration | Code-first worker in `pipeline/`, with n8n workflow exports in `workflows/n8n/*.json` retained as fallback/reference |
| Prompt storage | File-backed templates and schemas under `prompts/` |
| Helper scripts | Node ESM scripts under `workflows/scripts/` |
| State | PostgreSQL initialized from `infra/postgres/init/*.sql`, including `pipeline_runs`, `pipeline_steps`, `pipeline_events`, and `pipeline_reviews` |
| Asset hosting | MinIO/S3-compatible `object_storage` or Google Cloud Storage |
| Rendering | Remotion renderer service in `infra/remotion-renderer/` by default; Flask/FFmpeg worker in `infra/render-worker/` remains as rollback fallback |
| Studio control panel | `studio-ui/server.mjs` plus static frontend files |
| Operations/tests | Shell scripts under `scripts/` |

## Data and control flow

1. A topic row enters `content_items`, usually with `status = idea_approved`.
2. Studio-created topics carry a client/account context snapshot in `content_account_contexts` and `source_payload_json.client_account_context`.
3. Studio enqueues a `pipeline_runs` row and ordered `pipeline_steps` for the default `generate_reel` action, including `reel_type` (`image`, `video`, or `avatar`). The visible UI presents explicit Image Reel, Video Reel, and Avatar Reel buttons.
4. `pipeline-worker` claims one pending step with row locks, executes the stage, and records events.
5. If `pipeline_runs.summary_json.review_mode = true`, reviewable checkpoints write `pipeline_reviews` rows and pause the run with `status = awaiting_review`; Studio approval applies edits and resumes the next pending step. Review mode is opt-in, and default runs do not pause.
6. Text stages build prompt requests from `prompts/` using `build_prompt_request.mjs`; `invoke_structured_text_adapter.mjs` calls the selected OpenAI or Anthropic text provider and returns structured JSON.
7. Asset stages generate images/video/audio through adapter scripts and rehost public outputs into object storage or GCS, then write `assets`.
8. Story package generation normalizes each scene with `asset_plan` (`image`, `video`, or `image_with_motion`) and `remotion` guidance. Image reels default scenes to `image_with_motion`; video reels opt into direct provider video per scene.
9. `story_package_quality_gate` runs offline before media generation, using `validating` -> `validation_complete`. It checks scene count, narration, prompt specificity, text-rendering risk, asset-plan/remotion defaults, and render-seed timeline consistency; when `scene_guidance_json.image_prompt` is stronger than `storyboard_json.visual_prompt`, it promotes that prompt into the storyboard scene for asset generation.
10. Active code-first generation then runs `director_contract` and `visual_prompt_builder`; the director contract is persisted in `directors`, and the visual prompt plan is merged back into `storyboard_json[].visual_prompt`/`image_prompt` before image/video provider spend.
11. `image` runs use image-only scene assets plus narration; `video` runs use v3 video assets plus narration and fall back to still images for remaining scenes when Wan/Fal is unavailable, billing-locked, or quota-blocked; `avatar` runs use `avatar_presenter_selector` and `avatar_media_generation` to either create a HeyGen avatar MP4 asset or auto-downgrade to the normal video asset, voice performance, and narration path.
12. Image/video narration runs `voice_performance_script` after scene assets and before TTS. It enriches per-scene delivery instructions in `storyboard_json[].tts_instructions` while keeping spoken narration text clean.
13. Render manifest construction writes a Remotion-compatible canonical payload into `renders.render_manifest_json`, preserving per-scene camera moves, pan/zoom direction, transition type, overlays, pacing, motion layers, and provider-video fallback metadata.
14. Render sync calls the configured sync render endpoint, defaulting to `remotion-renderer:8081/render-sync`. The Remotion service renders H.264 MP4 and uploads the result; `infra/render-worker/` remains fallback.
15. The default code pipeline writes caption/publish draft data, invokes `final_qa_validator`, and ends with `pipeline_runs.status = awaiting_approval` only when QA does not block publish.
16. Instagram publish is a separate explicit code pipeline action requiring selected-render approval and account-context match. `analyze_performance` is a separate explicit action that turns stored Instagram insight snapshots into reusable account-context guidance.

Sessions 15 and 16 add contract-only model/provider route and renderer-neutral render manifest v2 layers. Remotion runtime, the avatar presenter selector/media route, HeyGen avatar generation, director contracts, visual prompt building, voice performance, and final QA are now active code-first integration points; the older Remotion edit-plan contract remains useful fixture/contract reference.

## Important boundaries

- Prompt wording belongs in `prompts/`, not in workflow JSON, when the stage is already file-backed.
- Provider-specific code belongs in adapter files or the render worker, not scattered through n8n nodes.
- n8n workflow JSON keeps logic in git, but live credentials remain in the local n8n instance.
- Real secrets live in `.env`, n8n credentials, and `sa-key.json`; do not print or document values.
- Local runtime state is under `infra/state/` and should not be edited manually.

## Prompt pipeline

Text stages use:

- `prompts/<stage>/system.md`
- `prompts/<stage>/user.md`
- `prompts/<stage>/response-schema.json`
- `workflows/scripts/build_prompt_request.mjs`
- `workflows/scripts/invoke_structured_text_adapter.mjs`

Image and narration helper scripts load `prompt.md` or `instructions.md` through `prompt_utils.mjs`. Placeholders are injected from workflow payload data and stage defaults in `prompt_stage_defaults.mjs`.

## Generation pipeline

Current code-level provider support observed:

- Text: `openai`, `anthropic`
- Image: `openai`, `fal_ai`
- TTS/narration: `openai`, `fish_audio`, `smallest_ai`
- Scene video v3 path: Fal/Wan helpers in `generate_and_rehost_scene_assets_v3.mjs`, with billing/quota/provider-availability fallback to image assets plus Remotion motion
- Render: `remotion` by default, with per-scene motion plans used for camera moves, overlays, fades, and pacing; `local_ffmpeg` fallback through `infra/render-worker/`
- Avatar video: `avatar_presenter_selector` structured text routing plus HeyGen Direct Video API through `avatar_media_generation` / legacy `heygen_avatar_generation`
- Asset host: `object_storage`, `google_cloud_storage`

Avatar provider calls are attempted only when `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `HEYGEN_VOICE_ID`, account `avatar_policy.avatar_allowed=true`, consent metadata, disclosure, and provider identity pass revalidation. Otherwise avatar generation auto-downgrades to the normal video reel path while preserving the requested run intent.

Some older docs still describe a narrower OpenAI-first matrix. When provider details matter, inspect the adapter code and `.env.example`, not only the older runbook prose.

## State/storage boundaries

Schema files define these main tables:

- `content_items`
- `client_account_contexts`
- `content_account_contexts`
- `content_sources`
- `scripts`
- `storyboards`
- `assets`
- `renders`
- `publishes`
- `publish_approvals`
- `insight_snapshots`
- `performance_reviews`
- `workflow_runs`
- `directors`
- `pipeline_runs`
- `pipeline_steps`
- `pipeline_events`
- `pipeline_reviews`
- `avatar_generations`

Generated binary assets are stored by URL and metadata; the repo should not accumulate generated media outputs except intentional curated assets.

Client/account context is policy metadata, not a CRM. It may guide brand, style, voice, music, avatar, and publish account alignment, but global safety, consent, license, factuality, and platform rules remain higher priority.

## Frontend/backend boundaries

There is no separate product web app. `studio-ui/` is local operations tooling. The visible UI covers idea injection, runtime provider/model/avatar settings, collapsed provider API key inputs, opt-in review approvals, pipeline status, and final render approval. Compatibility endpoints can still read/write prompts, selected `.env` keys, DB rows, client/account context snapshots, hosted objects, and n8n workflow executions.

## Testing strategy

Testing is shell-smoke-test driven. Scripts import or sync n8n workflow exports into the running container, bind the local Postgres credential, seed temporary rows, run `n8n execute`, assert DB state, and usually clean fixtures unless `KEEP_FIXTURES=true`.

Root `package.json` provides Node dependency metadata and a syntax check for Studio and pipeline modules. No CI config was found.

## Known uncertainties

- `docs/architecture/adapter-architecture-and-provider-switching.md` appears partly stale about supported image/TTS providers compared with current adapter code.
- Local-only files such as `.env.bak.*`, `sa-key.json`, `logs/`, and `__pycache__/` may exist in working copies and should not be committed.
