# Repo Map

Last reviewed: 2026-06-21 at git commit `d1e1bd0`.

| Path | Purpose | Key files | Commonly read? | Type | Ignore or avoid notes |
| --- | --- | --- | --- | --- | --- |
| `AGENTS.md` | Root agent routing and guardrails. | `AGENTS.md` | Yes | docs | Keep concise. Do not put long architecture notes here. |
| `docs/ai-context/` | Agent context layer. | `README.md`, `task-routing.md`, `context-manifest.json` | Yes | docs | Update when structure or validation changes. |
| `docs/` | Organized product, architecture, runbook, delivery, prompt, integration, feature, roadmap, and AI-context docs. | `docs/README.md`, `docs/architecture/`, `docs/runbooks/`, `docs/delivery/`, `docs/prompts/`, `docs/roadmaps/` | Sometimes | docs | Read only task-relevant docs; avoid loading whole doc tree. |
| `prompts/` | File-backed prompt templates and response schemas used by workflows and Studio UI. | `prompts/README.md`, `*/system.md`, `*/user.md`, `*/response-schema.json`, image/narration prompt files | Yes for prompt/model-output work | prompts/source | Preserve `{{placeholder}}` tokens unless updating the supplying code. |
| `pipeline/` | Code-first orchestration worker, reel-type stage plans, run/step/event tracking, and migrated pipeline stage handlers. | `AGENTS.md`, `worker.mjs`, `runs.mjs`, `stages.mjs`, `schema.mjs` | Yes for orchestration work | source/backend | Default generate action must stop at approval. Do not change active `reel_type` mid-run. Do not remove n8n fallback until parity is proven. |
| `workflows/` | n8n workflow exports, helper scripts, and media assets. | `workflows/README.md`, `workflows/n8n/*.json`, `workflows/scripts/*.mjs`, `workflows/assets/` | Yes for pipeline work | source/config/assets | Workflow credentials stay in n8n, not JSON. Avoid editing workflow JSON for prompt wording. |
| `fixtures/` | Sanitized baseline prompt/workflow contract fixtures. | `fixtures/CONTEXT.md`, `fixtures/ai-video/*/input_payload.json`, `fixtures/ai-video/*/expected_story_package_generation.json` | Yes for fixture/testing work | tests/fixtures | Keep synthetic. Do not include secrets, private client data, or provider-generated paid outputs. |
| `infra/` | Local Docker stack, Postgres schema, Remotion renderer, FFmpeg fallback render worker, launchd token refresh plist. | `infra/docker-compose.yml`, `infra/postgres/init/*.sql`, `infra/remotion-renderer/`, `infra/render-worker/` | Yes for infra/schema/render work | infra/source/config | Do not edit `infra/state/`, `infra/.env`, or `__pycache__` casually. Keep FFmpeg fallback until Remotion parity is documented. |
| `package.json`, `package-lock.json` | Explicit Node runtime dependency manifest for Studio/API, pipeline worker, and Remotion renderer. | `package.json`, `package-lock.json` | Sometimes | config | Keep dependency additions minimal; root runtime currently provides `pg`, Remotion, React, and Node scripts. |
| `scripts/` | Shell smoke tests, live-candidate prep helpers, token helpers, music upload helper. | `test_phase*.sh`, `prepare_phase*.sh`, `start.sh`, `check_instagram_permissions.sh` | Yes for validation work | tests/ops | Many scripts call containers, APIs, or mutate DB fixtures. Read before running. |
| `studio-ui/` | Local browser UI for injecting topics, editing prompts/env, launching workflows, viewing recent items/costs. | `server.mjs`, `public/index.html`, `public/app.js`, `public/styles.css` | Yes for UI/control-panel work | source/frontend/backend | Server can edit `.env` and prompt files. Treat endpoints as local ops tooling. |
| `delivery-testing/` | Completed delivery item archive. | `completed-items/*.md` | Rarely | docs/history | Historical evidence, not current routing source of truth. |
| `workflows/assets/` | Static placeholder asset and background music catalog. | `mvp_simple_post.svg`, `assets/music/library.json`, `assets/music/README.md` | Sometimes | assets/config | Keep music filenames/catalog stable. Audio binaries may be large/licensed. |
| `logs/` | Local token-refresh logs. | `logs/token-refresh.log` | Usually no | generated/logs | Currently tracked, but should be treated as runtime output. Do not use as source of truth. |
| `.claude/` | Local Claude settings/worktree artifacts. | `.claude/settings*.json`, `.claude/worktrees/` | Usually no | local tool state | Avoid unless explicitly working on local tool configuration. Contains duplicate worktree files. |
| `.env*`, `infra/.env*` | Runtime configuration examples, real local secrets, and backups. | `.env.example`, `infra/.env.example` | Examples only | config/secrets | Do not read or edit real `.env` or backups unless explicitly needed. |
| `sa-key.json` | Google service-account key used by GCS paths. | `sa-key.json` | No | secret/config | Treat as secret material. Do not open, print, or modify. |

## Generated or local-only paths

Agents should usually ignore:

- `.DS_Store`
- `.env`, `.env.bak.*`, `.env.local`, `infra/.env`
- `infra/state/`
- `storage/`
- `workflows/exports/`
- `logs/`
- `infra/render-worker/__pycache__/`
- `.claude/worktrees/`

Runtime artifacts such as `sa-key.json`, `logs/`, `.env.bak.*`, and `infra/render-worker/__pycache__/` should remain local-only and untracked.
