# Commands and Validation

Last reviewed: 2026-06-21 at git commit `0d0515b`.

No `package.json`, JS lockfile, Makefile, pyproject, or CI workflow was found. Commands below come from README/runbooks, Docker files, and scripts present in the repo.

## Install/setup

```bash
cp infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

The render worker image installs Python dependencies from `infra/render-worker/requirements.txt` during Docker build. No local `pip install` command is documented for normal repo use.

## Dev/start

```bash
bash scripts/start.sh
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis minio minio-bootstrap n8n render-worker studio-ui
```

Default local URLs from docs:

- n8n: `http://localhost:35678`
- Studio UI: `http://localhost:7780`
- MinIO console: `http://localhost:42173`

## Build/recreate

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build --force-recreate n8n render-worker studio-ui
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n render-worker studio-ui
```

Use recreate commands after `.env` changes that affect `n8n`, `render-worker`, or `studio-ui`.

## Smoke tests

These require a running local stack and may call configured provider APIs.

```bash
bash scripts/test_mvp08_smoke.sh
bash scripts/test_phase2_topic_to_storyboard_smoke.sh
bash scripts/test_phase2_caption_iteration_smoke.sh
bash scripts/test_phase2_hashtag_ranking_smoke.sh
bash scripts/test_phase3_scene_asset_generation_smoke.sh
bash scripts/test_phase3_narration_generation_smoke.sh
bash scripts/test_phase3_render_manifest_smoke.sh
bash scripts/test_phase3_render_worker_dispatch_smoke.sh
bash scripts/test_phase3_render_status_callback_smoke.sh
bash scripts/test_phase4_metrics_collection_smoke.sh
```

Most smoke scripts:

- require clear queue rows before running
- import/sync n8n workflow exports
- require the n8n Postgres credential name, default `Postgres account`
- seed temporary content rows
- clean fixtures unless `KEEP_FIXTURES=true`

## Targeted validation by area

| Area | Command |
| --- | --- |
| Infra up | `docker compose --env-file infra/.env -f infra/docker-compose.yml ps` |
| DB tables | `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "\\dt"` |
| Research/storyboard | `bash scripts/test_phase2_topic_to_storyboard_smoke.sh` |
| Caption/hashtags | `bash scripts/test_phase2_caption_iteration_smoke.sh` |
| Scene assets | `bash scripts/test_phase3_scene_asset_generation_smoke.sh` |
| Narration | `bash scripts/test_phase3_narration_generation_smoke.sh` |
| Render manifest | `bash scripts/test_phase3_render_manifest_smoke.sh` |
| Render dispatch | `bash scripts/test_phase3_render_worker_dispatch_smoke.sh` |
| Render callback | `bash scripts/test_phase3_render_status_callback_smoke.sh` |
| Metrics | `bash scripts/test_phase4_metrics_collection_smoke.sh` |
| Instagram token/account | `bash scripts/check_instagram_permissions.sh` |
| Context manifest | `jq empty docs/ai-context/context-manifest.json` |

## Lint/typecheck/format

No dedicated lint, typecheck, or format command was discovered.

## Commands not to run casually

These can call paid APIs, mutate live/local state, publish, refresh tokens, or upload assets:

```bash
bash scripts/prepare_phase2_live_post_candidate.sh
bash scripts/prepare_phase3_live_reel_candidate.sh
bash scripts/exchange_instagram_long_lived_token.sh
bash scripts/auto_refresh_instagram_token.sh
bash scripts/check_instagram_permissions.sh
node scripts/upload_music_to_gcs.mjs
docker exec n8n-insta node /workflows/scripts/run_resume_aware_reel_pipeline.mjs --plan-only
```

Run live publish or token commands only when the user explicitly requests them.

## Environment variables

Do not expose values. Key groups discovered from examples and code:

- AI/model: `OPENAI_API_KEY`, `LLL_API_KEY`, `TEXT_LLM_PROVIDER`, `TEXT_MODEL`, `RESEARCH_MODEL`, `STORYBOARD_MODEL`, `CAPTION_MODEL`, `PROMPT_BUILDER_MODEL`
- Image/video: `IMAGE_GENERATION_PROVIDER`, `SCENE_IMAGE_PROVIDER`, `POST_IMAGE_PROVIDER`, `FAL_AI_API_KEY`, `WAN_VIDEO_MODEL`, `WAN_REFERENCE_VIDEO_MODEL`
- TTS: `NARRATION_PROVIDER`, `TTS_PROVIDER`, `OPENAI_TTS_MODEL`, `FISH_AUDIO_API_KEY`, `SMALLEST_AI_API_KEY`
- Hosting: `ASSET_HOST_PROVIDER`, `REELS_STORAGE_*`, `GOOGLE_CLOUD_STORAGE_*`
- Render: `RENDER_PROVIDER`, `RENDER_WORKER_MODE`, `RENDER_WORKER_URL`, `RENDER_WORKER_SYNC_URL`, `RENDER_CALLBACK_URL`
- Instagram: `INSTAGRAM_GRAPH_API_TOKEN`, `GRAPH_API_VERSION`, `INSTAGRAM_PUBLISH_ENABLED`, `INSTAGRAM_INSIGHTS_COLLECTION_MODE`
- Infra: `POSTGRES_*`, `REDIS_*`, `MINIO_*`, `N8N_*`, `WEBHOOK_URL`
- Studio UI: `STUDIO_UI_HOST_PORT`, `STUDIO_UI_PORT`, `STUDIO_TOPIC_TARGET_DURATION_*`

Infra README specifically warns to keep `INSTAGRAM_GRAPH_API_TOKEN` in repo-root `.env`, not `infra/.env`.
