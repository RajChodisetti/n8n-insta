# studio-ui Context

## Purpose

This folder contains the local browser control panel for injecting ideas, configuring runtime provider/model/avatar settings, entering provider API keys through a collapsed secret section, opting into human review checkpoints, queueing code-first pipeline runs, approving/editing generated review artifacts, approving selected renders, managing hosted objects, and inspecting recent pipeline status.

## When to read this

Read this for Studio UI routes, local frontend changes, runtime env/settings editing, review-mode behavior, code-first pipeline enqueue/status behavior, selected-render approval, cleanup, or recent item display work.

## Important files and subfolders

- `server.mjs`: local HTTP server, DB access, prompt/env editing endpoints, client/account context snapshots, selected-render approval, review approval endpoints, reel-type aware code-first pipeline enqueue/status endpoints, legacy workflow launcher endpoints, hosted-object cleanup, cost aggregation.
- `public/index.html`: UI markup, including the Settings panel shell.
- `public/app.js`: browser behavior, including `/api/config` rendering/saving and masked secret handling.
- `public/styles.css`: UI styling, including settings grids and collapsed secret sections.

## Inputs

Studio UI consumes Postgres env vars, repo-root `.env`, prompt files, workflow exports, adapter helpers, hosted assets, client/account context payloads, pipeline review rows, and user form submissions.

## Outputs

It can write `content_items`, `client_account_contexts`, `content_account_contexts`, `publish_approvals`, `pipeline_runs`, `pipeline_steps`, `pipeline_events`, `pipeline_reviews`, prompt files, repo-root `.env`, hosted character-reference objects, legacy workflow jobs, and cleanup requests. The visible UI is intentionally narrowed to idea injection, opt-in review approvals, pipeline status, final render approval, and delete cleanup.

## Depends on

- Root `pg` dependency from `package.json`; it still has an n8n bundled `pg` fallback for legacy containers.
- `workflows/scripts/*` helpers for adapters, prompt tools, costs, and workflow execution.
- `pipeline/` for code-first enqueue/status behavior.
- Local Docker services from `infra/docker-compose.yml`.

## Used by

Local operators who want to use the pipeline without editing raw workflow JSON or SQL.

## Common change patterns

- Keep the visible UI focused on idea injection, runtime provider/model/avatar settings, review approvals, pipeline status, and final approval; prompt and legacy workflow endpoints may exist for compatibility without being exposed as first-screen controls.
- Add code-first pipeline actions in `pipeline/` before making them the recommended Studio route; keep legacy workflow launcher entries clearly fallback-oriented.
- Keep review-mode UI in sync with `pipeline/reviews.mjs` reviewable stage keys.
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

- Prompt edit endpoints still exist, but the visible UI only exposes the curated runtime env/settings subset from `/api/config`.
- The fast path queues code-first `pipeline_runs`; the legacy workflow launcher still uses `execute_workflow_by_name.mjs`, which interacts with the running n8n instance.
- Studio allows multiple unfinished content items to have active or queued generation runs; the Pipeline list is the status surface. Same-content duplicate run protection belongs in `pipeline/runs.mjs`.
- Review-mode runs pause with `pipeline_runs.status = 'awaiting_review'` until a `pipeline_reviews` row is approved, then resume at the next pending step.
- Server code protects prompt paths against path traversal; keep that boundary if adding file-edit routes.

## Uncertainties

- No dedicated frontend build/test tool was found.

## Last reviewed

2026-06-21, git commit `0d0515b`.
