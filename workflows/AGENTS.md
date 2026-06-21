# workflows Context

## Purpose

This folder stores n8n workflow exports, Node helper scripts used by n8n execute-command nodes, and small workflow assets such as placeholder images and the background music catalog.

## When to read this

Read this for n8n workflow changes, pipeline stage changes, provider adapters, asset hosting, prompt request building, one-click orchestration, render dispatch, image/video/narration generation, or workflow asset changes.

## Important files and subfolders

- `README.md`: workflow inventory and operational references.
- `n8n/*.json`: source-controlled workflow exports.
- `scripts/adapter_config.mjs`: provider/host selector logic.
- `scripts/build_prompt_request.mjs`, `scripts/invoke_structured_text_adapter.mjs`: structured text path.
- `scripts/image_generation_adapters.mjs`, `scripts/tts_adapters.mjs`, `scripts/asset_host_adapters.mjs`: provider adapters.
- `scripts/generate_and_rehost_scene_assets*.mjs`, `generate_and_rehost_narration_audio.mjs`, `generate_and_rehost_post_image.mjs`: media helpers.
- `scripts/run_resume_aware_reel_pipeline*.mjs`, `execute_workflow_by_name.mjs`, `wait_for_render_completion.mjs`: orchestration helpers.
- `assets/music/library.json` and `assets/music/README.md`: background music catalog.

## Inputs

Workflows consume Postgres rows, prompt files, `.env`/container env, n8n credentials, hosted asset URLs, and provider API responses.

## Outputs

Workflows and helpers write DB rows, hosted image/audio/video URLs, render manifests, workflow logs, and publish/metrics metadata.

## Depends on

- `prompts/` for prompt templates and schemas.
- `infra/postgres/init/*.sql` for schema contracts.
- `infra/docker-compose.yml` for mounts/env.
- External providers selected by env.

## Used by

n8n runtime, Studio UI launcher, shell smoke tests, render worker handoff, and live publish runbooks.

## Common change patterns

- Change prompt wording in `prompts/`, not workflow JSON.
- Change provider behavior in adapter files and keep normalized return shapes.
- Change workflow stage SQL/code nodes with matching smoke-test updates.
- Add workflow exports in `workflows/n8n/` and update routing/docs.

## Do not do

- Do not hardcode API keys or credentials in workflow exports.
- Do not silently fallback from an unsupported selected provider.
- Do not change workflow status names without updating DB assertions, Studio UI, and runbooks.
- Do not manually edit generated runtime workflow state under `infra/state/n8n`.

## Validation

- Text stages: `bash scripts/test_phase2_topic_to_storyboard_smoke.sh`
- Captions: `bash scripts/test_phase2_caption_iteration_smoke.sh`
- Scene assets: `bash scripts/test_phase3_scene_asset_generation_smoke.sh`
- Narration: `bash scripts/test_phase3_narration_generation_smoke.sh`
- Render manifest/dispatch/callback: corresponding `scripts/test_phase3_render_*_smoke.sh`
- Metrics: `bash scripts/test_phase4_metrics_collection_smoke.sh`

## Gotchas

- Smoke scripts sync workflow exports into the n8n DB and bind the runtime Postgres credential.
- All workflow exports were inactive (`active: false`) at review time.
- Working-tree v2/v3 workflow files exist and may be ahead of committed docs; check `git status` before deciding what is canonical.
- The current code supports more providers than some older docs mention.

## Uncertainties

- The active production path among v1/v2/v3 files is not fully settled from docs alone. Confirm via workflow launcher/runbook before removing older files.

## Last reviewed

2026-06-21, git commit `0d0515b`.
