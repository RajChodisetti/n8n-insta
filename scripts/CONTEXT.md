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

## Uncertainties

- No standalone unit tests for scripts were found.

## Last reviewed

2026-06-21, git commit `0d0515b`.
