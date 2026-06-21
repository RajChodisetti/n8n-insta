# infra Context

## Purpose

This folder defines the local Docker runtime, Postgres schema initialization, local FFmpeg render worker, and launchd token-refresh helper.

## When to read this

Read this for Docker Compose, service ports, schema, render worker, asset-hosting mounts, local runtime env, GCS/service-account integration, or infra validation tasks.

## Important files and subfolders

- `README.md`: local stack setup and smoke check.
- `docker-compose.yml`: services for Postgres, Redis, MinIO, n8n, Studio UI, and render worker.
- `.env.example`: local infra env example.
- `postgres/init/001_init.sql`: core schema.
- `postgres/init/002_add_directors.sql`: director contract schema.
- `postgres/init/003_add_publish_approvals.sql`: selected-render/asset publish approval gate schema.
- `postgres/init/004_add_client_account_contexts.sql`: reusable and per-content client/account context snapshot schema.
- `render-worker/app.py`: Flask render worker and FFmpeg implementation.
- `render-worker/Dockerfile`, `render-worker/requirements.txt`: render worker image.
- `com.n8n-insta.token-refresh.plist`: macOS launchd token refresh configuration.

## Inputs

Infra consumes repo-root `.env`, `infra/.env`, workflow and prompt mounts, `sa-key.json`, and Docker images.

## Outputs

Local containers, Postgres data, MinIO objects, n8n state, render-worker temp/state files, and hosted render outputs.

## Depends on

Docker Compose, n8n image `n8nio/n8n:1.92.2`, Postgres, Redis, MinIO, Python/Flask render worker, FFmpeg, boto3, requests, and google-auth.

## Used by

All smoke scripts, n8n workflows, Studio UI, render pipeline, and Instagram publishing tests.

## Common change patterns

- Add env example fields when code starts reading new env vars.
- Change schema in init SQL and then update workflow SQL/smoke assertions.
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
- `n8n`, `render-worker`, and `studio-ui` mount `../sa-key.json` into `/secrets/google/sa-key.json`.
- `N8N_RUNNERS_ENABLED=false` is documented as the reliable local setting for current code-node workflows.
- Render worker supports local FFmpeg only as render provider; provider selection still matters for output hosting.

## Uncertainties

- Some runtime artifacts under `infra/` are tracked or dirty. Treat them as local state unless the user explicitly asks for cleanup.

## Last reviewed

2026-06-21, git commit `0d0515b`.
