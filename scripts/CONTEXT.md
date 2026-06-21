# scripts Context

## Purpose

This folder contains operational shell scripts, smoke tests, live-candidate preparation helpers, Instagram token helpers, stack start helper, and a GCS music upload utility.

## When to read this

Read this before running or editing smoke tests, token scripts, live publish preparation, music upload, or local stack start behavior.

## Important files and subfolders

- `test_mvp08_smoke.sh`: simple post MVP smoke.
- `test_phase2_*_smoke.sh`: research/storyboard, caption, hashtag smoke paths.
- `test_phase3_*_smoke.sh`: scene assets, narration, render manifest, dispatch, callback.
- `test_phase4_metrics_collection_smoke.sh`: metrics snapshot smoke.
- `prepare_phase2_live_post_candidate.sh`, `prepare_phase3_live_reel_candidate.sh`: live candidate prep helpers.
- `check_instagram_permissions.sh`, `exchange_instagram_long_lived_token.sh`, `auto_refresh_instagram_token.sh`: Meta token/account helpers.
- `start.sh`: refresh token then `docker compose up`.
- `upload_music_to_gcs.mjs`: uploads music assets to GCS and rewrites `library.json`.
- `validate_director_contract_fixture.mjs`: no-dependency validator for upgraded director contract fixtures.
- `validate_storyboard_fixture.mjs`: no-dependency validator for Session 8 storyboard/shot-plan fixtures.
- `validate_visual_prompt_fixture.mjs`: no-dependency validator for Session 9 visual prompt builder fixtures.
- `validate_voice_performance_fixture.mjs`: no-dependency validator for Session 10 voice performance fixtures.
- `validate_music_sfx_fixture.mjs`: no-dependency validator for Session 11 music/SFX plan fixtures.
- `validate_music_library.mjs`: no-dependency validator for the render-worker background music catalog license metadata.
- `validate_final_qa_fixture.mjs`: no-dependency validator for Session 12 final QA result fixtures.
- `validate_approval_fixture.mjs`: no-dependency validator for Session 13 approval record fixtures.
- `validate_publish_gate_workflow.mjs`: no-dependency static check that publish workflow exports still require approval gates.
- `validate_client_account_context_fixture.mjs`: no-dependency validator for Session 14 client/account context fixtures.
- `validate_model_route_fixture.mjs`: no-dependency validator for Session 15 model provider router fixtures.
- `validate_render_manifest_v2_fixture.mjs`: no-dependency validator for Session 16 renderer-neutral render manifest bridge fixtures.
- `validate_remotion_edit_plan_fixture.mjs`: no-dependency validator for Session 17 Remotion-compatible edit-plan fixtures.
- `validate_avatar_decision_fixture.mjs`: no-dependency validator for Session 18 avatar/presenter selector fixtures.
- `validate_ai_video_contract_regressions.mjs`: no-dependency offline regression runner for the high-risk AI video contract fixtures and publish blockers.

## Inputs

Scripts consume running Docker containers, repo-root `.env`, `infra/.env`, n8n workflow exports, DB rows, credentials in n8n, provider API keys, and sometimes hosted media.

## Outputs

Temporary DB fixtures, synced n8n workflows, smoke-test assertions, token updates, live-candidate rows, GCS-hosted music URLs, and local logs.

## Depends on

Docker, n8n CLI inside the container, Postgres `psql`, `jq`, `curl`, Node, and configured external APIs for non-stub paths.

## Used by

Validation workflows, runbooks, manual local operation, and future agents verifying changes.

## Common change patterns

- Update assertions when DB schema or workflow details change.
- Add a narrow smoke script for a new workflow stage.
- Add or update fixture validators when prompt contract schemas gain new structural features.
- Keep queue-clearing checks explicit to avoid claiming unrelated local work.
- Keep `KEEP_FIXTURES` behavior for debugging.

## Do not do

- Do not run live publish prep or token exchange without explicit user approval.
- Do not leave fixture cleanup broken.
- Do not print secrets.
- Do not assume scripts are read-only; most mutate local DB or workflow state.

## Validation

Run the script you changed against a running local stack. For docs-only changes, no script execution is required.

## Gotchas

- Smoke scripts often fail if queue rows from previous runs exist.
- Scripts bind workflow Postgres credential by name, default `Postgres account`.
- `N8N_RUNNERS_ENABLED=false` is set during inline workflow execution.
- Some scripts can call paid AI/provider APIs depending on env configuration.
- `validate_director_contract_fixture.mjs` is local-only and does not call providers.
- `validate_storyboard_fixture.mjs` is local-only and does not call providers.
- `validate_visual_prompt_fixture.mjs` is local-only and does not call providers.
- `validate_voice_performance_fixture.mjs` is local-only and does not call providers.
- `validate_music_sfx_fixture.mjs` and `validate_music_library.mjs` are local-only and do not call providers.
- `validate_final_qa_fixture.mjs` is local-only and does not call providers or publish workflows.
- `validate_approval_fixture.mjs` and `validate_publish_gate_workflow.mjs` are local-only and do not call providers or publish workflows.
- `validate_client_account_context_fixture.mjs` is local-only and enforces that client/account preferences cannot override global rules.
- `validate_model_route_fixture.mjs` is local-only and enforces planning-only provider routing with no adapter selection changes.
- `validate_render_manifest_v2_fixture.mjs` is local-only and enforces renderer-neutral timing, public media URLs, and compatibility with the current local FFmpeg request shape.
- `validate_remotion_edit_plan_fixture.mjs` is local-only and enforces plan-only Remotion data, contiguous frame timing, no dependency/runtime changes, and local FFmpeg fallback.
- `validate_avatar_decision_fixture.mjs` is local-only and enforces consent-gated avatar asset routing with no provider calls, runtime changes, dependencies, or publish route.
- `validate_ai_video_contract_regressions.mjs` is local-only and runs fixture validators only; it does not call Docker, n8n, providers, renderers, or publish APIs.

## Uncertainties

- No standalone unit tests for scripts were found.

## Last reviewed

2026-06-21, git commit `0d0515b`.
