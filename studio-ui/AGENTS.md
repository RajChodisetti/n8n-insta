# studio-ui Context

## Purpose

This folder contains the local browser control panel for injecting ideas, editing prompt files, editing selected runtime settings, launching workflows, managing hosted objects, and inspecting recent pipeline items/costs.

## When to read this

Read this for Studio UI routes, local frontend changes, prompt editor behavior, runtime settings UI, workflow launcher behavior, character-reference upload, cleanup, or recent item/cost display work.

## Important files and subfolders

- `server.mjs`: local HTTP server, DB access, prompt/env editing, workflow launcher, hosted-object cleanup, cost aggregation.
- `public/index.html`: UI markup.
- `public/app.js`: browser behavior.
- `public/styles.css`: UI styling.

## Inputs

Studio UI consumes Postgres env vars, repo-root `.env`, prompt files, workflow exports, adapter helpers, hosted assets, and user form submissions.

## Outputs

It can write `content_items`, prompt files, repo-root `.env`, hosted character-reference objects, workflow jobs, and cleanup requests.

## Depends on

- n8n's bundled `pg` module in container, or local `pg` fallback.
- `workflows/scripts/*` helpers for adapters, prompt tools, costs, and workflow execution.
- Local Docker services from `infra/docker-compose.yml`.

## Used by

Local operators who want to use the pipeline without editing raw workflow JSON or SQL.

## Common change patterns

- Add or adjust a visible runtime setting when a new env-backed field is introduced.
- Add workflow launcher entries when a workflow export becomes an intended user-facing route.
- Update prompt file group metadata when active prompt files change.
- Adjust UI rendering in `public/` while keeping server write behavior explicit.

## Do not do

- Do not expose secret values in UI, logs, or docs.
- Do not make Studio UI the source of business logic if an existing workflow/helper owns that logic.
- Do not confuse prompt-builder runtime rewrites with abstract-idea `creative_defaults` or legacy prompt profiles.

## Validation

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis minio minio-bootstrap n8n render-worker studio-ui
```

Then inspect the local UI at `http://localhost:7780` when the stack is running. No automated Studio UI test was found.

## Gotchas

- Prompt edits apply on the next workflow run without container recreation.
- `.env` edits require recreating affected containers.
- The workflow launcher uses `execute_workflow_by_name.mjs`, which interacts with the running n8n instance.
- Server code protects prompt paths against path traversal; keep that boundary if adding file-edit routes.

## Uncertainties

- No dedicated frontend build/test tool was found.

## Last reviewed

2026-06-21, git commit `0d0515b`.
