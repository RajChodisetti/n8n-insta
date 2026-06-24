# infra Context

## Purpose

This folder defines the local Docker runtime, Postgres schema initialization, Remotion renderer, local FFmpeg render fallback worker, Node runtime image for Studio/pipeline-worker, and launchd token-refresh helper.

## When to read this

Read this for Docker Compose, service ports, schema, render worker, asset-hosting mounts, local runtime env, GCS/service-account integration, or infra validation tasks.

## Important files and subfolders

- `README.md`: local stack setup and smoke check.
- `docker-compose.yml`: services for Postgres, Redis, MinIO, n8n fallback, Studio UI/API, pipeline worker, Remotion renderer, and FFmpeg fallback render worker.
- `node-runtime/Dockerfile`: Node 22 runtime for Studio/API and code-first pipeline worker.
- `.env.example`: local infra env example.
- `postgres/init/001_init.sql`: core schema.
- `postgres/init/002_add_directors.sql`: director contract schema.
- `postgres/init/003_add_publish_approvals.sql`: selected-render/asset publish approval gate schema.
- `postgres/init/004_add_client_account_contexts.sql`: reusable and per-content client/account context snapshot schema.
- `postgres/init/005_add_pipeline_orchestration.sql`: code-first pipeline run/step/event schema.
- `postgres/init/006_add_reel_types_avatar_generations.sql`: `reel_type` columns and `avatar_generations` schema.
- `remotion-renderer/`: default code-first render service using Remotion SSR.
- `render-worker/app.py`: Flask render worker and FFmpeg fallback implementation.
- `render-worker/Dockerfile`, `render-worker/requirements.txt`: render worker image.
- `com.n8n-insta.token-refresh.plist`: macOS launchd token refresh configuration.

## Inputs

Infra consumes repo-root `.env`, `infra/.env`, workflow and prompt mounts, `sa-key.json`, Docker images, and root Node dependency metadata.

## Outputs

Local containers, Postgres data, MinIO objects, n8n fallback state, pipeline worker state in Postgres, render-worker temp/state files, and hosted render outputs.

## Depends on

Docker Compose, Node 22, root Node dependencies, n8n image `n8nio/n8n:1.92.2` for fallback, Postgres, Redis, MinIO, Remotion/Chromium, Python/Flask fallback render worker, FFmpeg, boto3, requests, and google-auth.

## Used by

All smoke scripts, n8n fallback workflows, Studio UI/API, code-first pipeline worker, render pipeline, and Instagram publishing tests.

## Common change patterns

- Add env example fields when code starts reading new env vars.
- Change schema in init SQL and then update workflow SQL, pipeline code, Studio UI, and smoke assertions.
- Change render worker request handling with matching render workflow updates.
- Recreate affected services after env or Dockerfile changes.

## Do not do

- Do not edit `infra/state/` as source.
- Do not put real secret values in `infra/.env.example`.
- Do not put `INSTAGRAM_GRAPH_API_TOKEN` in `infra/.env`; infra README says it belongs in repo-root `.env`.
- Do not open or print `sa-key.json`.

## Validation

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "\\dt"
```

Render-related changes should also use the relevant Phase 3 smoke scripts.

## Gotchas

- Existing `infra/state/postgres` means init SQL may not re-run automatically.
- `n8n`, `render-worker`, `studio-ui`, and `pipeline-worker` mount `../sa-key.json` into `/secrets/google/sa-key.json`.
- `N8N_RUNNERS_ENABLED=false` is documented as the reliable local setting for current code-node workflows.
- Remotion is the default code-first renderer. Keep the FFmpeg worker available as rollback until parity is documented.

## Uncertainties

- Some runtime artifacts under `infra/` are tracked or dirty. Treat them as local state unless the user explicitly asks for cleanup.

## Last reviewed

2026-06-21, git commit `0d0515b`.
