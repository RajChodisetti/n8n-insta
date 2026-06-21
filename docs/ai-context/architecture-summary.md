# Architecture Summary

Last reviewed: 2026-06-21 at git commit `0d0515b`.

## System purpose

The repo builds an Instagram-only AI storytelling workflow. The long-term flow is:

`idea -> research/script -> storyboard -> assets -> narration -> render -> publish -> metrics -> improve`

The current implementation is a local n8n-centered automation stack with Postgres state, object/GCS asset hosting, a local FFmpeg render worker, shell smoke tests, and a Studio UI.

## Major runtime components

| Component | Current implementation |
| --- | --- |
| Orchestration | n8n workflow exports in `workflows/n8n/*.json` |
| Prompt storage | File-backed templates and schemas under `prompts/` |
| Helper scripts | Node ESM scripts under `workflows/scripts/` |
| State | PostgreSQL initialized from `infra/postgres/init/*.sql` |
| Asset hosting | MinIO/S3-compatible `object_storage` or Google Cloud Storage |
| Rendering | Flask render worker in `infra/render-worker/app.py` using FFmpeg/ffprobe |
| Studio control panel | `studio-ui/server.mjs` plus static frontend files |
| Operations/tests | Shell scripts under `scripts/` |

## Data and control flow

1. A topic row enters `content_items`, usually with `status = idea_approved`.
2. Text stages build prompt requests from `prompts/` using `build_prompt_request.mjs`.
3. `invoke_structured_text_adapter.mjs` calls the selected text provider and returns structured JSON.
4. Workflow stages persist outputs into `scripts`, `storyboards`, `directors`, `publishes`, or `workflow_runs`.
5. Asset stages generate images/video/audio through adapter scripts and rehost public outputs into object storage or GCS, then write `assets`.
6. Render manifest construction writes a canonical render payload into `renders.render_manifest_json`.
7. Render dispatch calls or queues the render worker. The worker downloads scene assets/narration/music, runs FFmpeg, uploads the MP4, and posts a callback.
8. Publish workflows create Instagram media containers, poll status, publish, and persist IDs.
9. Metrics workflows write `insight_snapshots` and log details to `workflow_runs`.

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
- Render: `local_ffmpeg`
- Asset host: `object_storage`, `google_cloud_storage`

Some older docs still describe a narrower OpenAI-first matrix. When provider details matter, inspect the adapter code and `.env.example`, not only the older runbook prose.

## State/storage boundaries

Schema files define these main tables:

- `content_items`
- `content_sources`
- `scripts`
- `storyboards`
- `assets`
- `renders`
- `publishes`
- `insight_snapshots`
- `performance_reviews`
- `workflow_runs`
- `directors`

Generated binary assets are stored by URL and metadata; the repo should not accumulate generated media outputs except intentional curated assets.

## Frontend/backend boundaries

There is no separate product web app. `studio-ui/` is local operations tooling. It reads/writes prompts, selected `.env` keys, DB rows, hosted objects, and n8n workflow executions.

## Testing strategy

Testing is shell-smoke-test driven. Scripts import or sync n8n workflow exports into the running container, bind the local Postgres credential, seed temporary rows, run `n8n execute`, assert DB state, and usually clean fixtures unless `KEEP_FIXTURES=true`.

No package-level lint, typecheck, unit-test, or CI config was found.

## Known uncertainties

- The working tree is dirty and includes newer v2/v3 workflow and provider files not all reflected in committed docs.
- `24-adapter-architecture-and-provider-switching.md` appears partly stale about supported image/TTS providers compared with current adapter code.
- Some tracked files look like secrets or runtime artifacts (`sa-key.json`, `.env.bak.*`, `logs/token-refresh.log`, `__pycache__`), but this context pass did not modify tracking.
