# studio-ui Context

## Purpose

This folder contains the local browser control panel for injecting ideas, selecting reel type, editing prompt files, editing selected runtime settings, queueing code-first pipeline runs, launching legacy n8n workflows, managing hosted objects, and inspecting recent pipeline items/costs.

## When to read this

Read this for Studio UI routes, local frontend changes, reel-type selection, prompt editor behavior, runtime settings UI, code-first pipeline enqueue/status behavior, legacy workflow launcher behavior, character-reference upload, cleanup, or recent item/cost display work.

## Important files and subfolders

- `server.mjs`: local HTTP server, DB access, prompt/env editing, client/account context snapshots, selected-render approval, reel-type aware code-first pipeline enqueue/status endpoints, legacy workflow launcher, hosted-object cleanup, cost aggregation.
- `public/index.html`: UI markup.
- `public/app.js`: browser behavior.
- `public/styles.css`: UI styling.

## Inputs

Studio UI consumes Postgres env vars, repo-root `.env`, prompt files, workflow exports, adapter helpers, hosted assets, client/account context payloads, and user form submissions.

## Outputs

It can write `content_items`, `client_account_contexts`, `content_account_contexts`, `publish_approvals`, `pipeline_runs`, `pipeline_steps`, `pipeline_events`, prompt files, repo-root `.env`, hosted character-reference objects, legacy workflow jobs, and cleanup requests.

## Depends on

- Root `pg` dependency from `package.json`; it still has an n8n bundled `pg` fallback for legacy containers.
- `workflows/scripts/*` helpers for adapters, prompt tools, costs, and workflow execution.
- `pipeline/` for code-first enqueue/status behavior.
- Local Docker services from `infra/docker-compose.yml`.

## Used by

Local operators who want to use the pipeline without editing raw workflow JSON or SQL.

## Common change patterns

- Add or adjust a visible runtime setting when a new env-backed field is introduced.
- Add code-first pipeline actions in `pipeline/` before making them the recommended Studio route; keep legacy workflow launcher entries clearly fallback-oriented.
- Keep the Studio reel-type selector in sync with `pipeline/runs.mjs` valid `reel_type` values.
- Show avatar setup requirements, but do not bypass the worker-side avatar consent gate.
- Update prompt file group metadata when active prompt files change.
- Adjust UI rendering in `public/` while keeping server write behavior explicit.
- Keep selected-render approval explicit; approval writes must require a reviewer and Instagram account ID.
- Keep account context policy separate from global rules; Studio can attach snapshots, but it should not turn into a full CRM.

## Do not do

- Do not expose secret values in UI, logs, or docs.
- Do not make Studio UI the source of business logic if an existing workflow/helper owns that logic.
- Do not confuse prompt-builder runtime rewrites with abstract-idea `creative_defaults` or legacy prompt profiles.
- Do not auto-approve selected renders or bypass `publish_approvals`.
- Do not let client/account context override global safety, consent, license, factuality, or platform rules.

## Validation

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis minio minio-bootstrap remotion-renderer studio-ui pipeline-worker
```

Then inspect the local UI at `http://localhost:7780` when the stack is running. No automated Studio UI test was found.

## Gotchas

- Prompt edits apply on the next workflow run without container recreation.
- `.env` edits require recreating affected containers.
- Runtime settings mask secret-like keys (`API_KEY`, token, password, secret). Leaving the mask unchanged must not overwrite the real value.
- The fast path queues code-first `pipeline_runs`; the legacy workflow launcher still uses `execute_workflow_by_name.mjs`, which interacts with the running n8n instance.
- Server code protects prompt paths against path traversal; keep that boundary if adding file-edit routes.

## Uncertainties

- No dedicated frontend build/test tool was found.

## Last reviewed

2026-06-21, git commit `0d0515b`.
