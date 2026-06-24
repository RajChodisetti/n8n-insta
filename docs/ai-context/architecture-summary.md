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
| State | PostgreSQL initialized from `infra/postgres/init/*.sql`, including `pipeline_runs`, `pipeline_steps`, and `pipeline_events` |
| Asset hosting | MinIO/S3-compatible `object_storage` or Google Cloud Storage |
| Rendering | Remotion renderer service in `infra/remotion-renderer/` by default; Flask/FFmpeg worker in `infra/render-worker/` remains as rollback fallback |
| Studio control panel | `studio-ui/server.mjs` plus static frontend files |
| Operations/tests | Shell scripts under `scripts/` |

## Data and control flow

1. A topic row enters `content_items`, usually with `status = idea_approved`.
2. Studio-created topics carry a client/account context snapshot in `content_account_contexts` and `source_payload_json.client_account_context`.
3. Studio enqueues a `pipeline_runs` row and ordered `pipeline_steps` for the default `generate_reel` action, including `reel_type` (`image`, `video`, or `avatar`).
4. `pipeline-worker` claims one pending step with row locks, executes the stage, and records events.
5. Text stages build prompt requests from `prompts/` using `build_prompt_request.mjs`; `invoke_structured_text_adapter.mjs` calls the selected text provider and returns structured JSON.
6. Asset stages generate images/video/audio through adapter scripts and rehost public outputs into object storage or GCS, then write `assets`.
7. `image` runs use image-only scene assets plus narration; `video` runs use v3 image/video assets plus narration; `avatar` runs require an avatar consent gate and HeyGen avatar MP4 asset while skipping Fish/OpenAI narration.
8. Render manifest construction writes a Remotion-compatible canonical payload into `renders.render_manifest_json`.
9. Render sync calls the configured sync render endpoint, defaulting to `remotion-renderer:8081/render-sync`. The Remotion service renders H.264 MP4 and uploads the result; `infra/render-worker/` remains fallback.
10. The default code pipeline writes caption/publish draft data, performs a structural QA/approval-gate step, and ends with `pipeline_runs.status = awaiting_approval`.
11. Instagram publish is a separate explicit code pipeline action requiring selected-render approval and account-context match.

Sessions 12, 15, and 16 add contract-only final QA, model/provider route, and renderer-neutral render manifest v2 layers. Remotion runtime and HeyGen avatar stages are now active code-first integration points; the older Remotion edit-plan and avatar/presenter selector contracts remain useful fixture/contract references.

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

- Text: `openai`
- Image: `openai`, `fal_ai`
- TTS/narration: `openai`, `fish_audio`, `smallest_ai`
- Scene video v3 path: Fal/Wan helpers in `generate_and_rehost_scene_assets_v3.mjs`
- Render: `remotion` by default; `local_ffmpeg` fallback through `infra/render-worker/`
- Avatar video: HeyGen Direct Video API through `heygen_avatar_generation`
- Asset host: `object_storage`, `google_cloud_storage`

Avatar provider calls fail closed unless `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `HEYGEN_VOICE_ID`, account `avatar_policy.avatar_allowed=true`, and consent metadata are present.

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
- `avatar_generations`

Generated binary assets are stored by URL and metadata; the repo should not accumulate generated media outputs except intentional curated assets.

Client/account context is policy metadata, not a CRM. It may guide brand, style, voice, music, avatar, and publish account alignment, but global safety, consent, license, factuality, and platform rules remain higher priority.

## Frontend/backend boundaries

There is no separate product web app. `studio-ui/` is local operations tooling. It reads/writes prompts, selected `.env` keys, DB rows, client/account context snapshots, hosted objects, and n8n workflow executions.

## Testing strategy

Testing is shell-smoke-test driven. Scripts import or sync n8n workflow exports into the running container, bind the local Postgres credential, seed temporary rows, run `n8n execute`, assert DB state, and usually clean fixtures unless `KEEP_FIXTURES=true`.

Root `package.json` provides Node dependency metadata and a syntax check for Studio and pipeline modules. No CI config was found.

## Known uncertainties

- `docs/architecture/adapter-architecture-and-provider-switching.md` appears partly stale about supported image/TTS providers compared with current adapter code.
- Local-only files such as `.env.bak.*`, `sa-key.json`, `logs/`, and `__pycache__/` may exist in working copies and should not be committed.
