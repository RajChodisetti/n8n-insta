# n8n-insta Agent Context

This repo is an Instagram-focused AI storytelling pipeline: n8n orchestrates topic intake, research/script generation, storyboards, generated visual/audio assets, local FFmpeg rendering, Instagram publishing, metrics collection, and a small local Studio UI for operating the flow.

Start with [docs/ai-context/README.md](docs/ai-context/README.md), then use [docs/ai-context/task-routing.md](docs/ai-context/task-routing.md) to read only the context needed for the task. For folder-specific work, also read the nearest `AGENTS.md` or `CONTEXT.md` in that folder. Core context docs: [repo map](docs/ai-context/repo-map.md), [architecture](docs/ai-context/architecture-summary.md), [commands](docs/ai-context/commands-and-validation.md), [glossary](docs/ai-context/glossary.md), [current focus](docs/ai-context/current-focus.md), [risks](docs/ai-context/known-risks-and-gotchas.md), [maintenance](docs/ai-context/context-maintenance.md), and [manifest](docs/ai-context/context-manifest.json).

Essential commands:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
bash scripts/test_phase2_topic_to_storyboard_smoke.sh
bash scripts/test_phase3_render_manifest_smoke.sh
```

See [docs/ai-context/commands-and-validation.md](docs/ai-context/commands-and-validation.md) for the full command map. If your shell has `rtk`, prefix shell commands with it; this environment did not have `rtk` during the 2026-06-21 context review.

Core rules: do not change product behavior for docs-only tasks, do not edit secrets or local runtime state, do not put prompt wording into workflow JSON when a prompt file is wired for that stage, do not run live publish/token/API-costing commands casually, and do not manually edit generated/cache files such as `infra/state/`, `logs/`, `.DS_Store`, or `__pycache__/`.

Update the context docs when folder responsibilities, workflow stages, provider adapters, validation commands, schema contracts, or major file locations change.
