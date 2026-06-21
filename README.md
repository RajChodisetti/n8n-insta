# n8n-insta

Instagram-focused AI storytelling pipeline orchestrated with n8n. The repo covers topic intake, prompt-driven content packaging, generated visual/audio assets, local rendering, Instagram publishing, metrics collection, and a small local Studio UI.

## Start Here

- [Agent context](AGENTS.md)
- [Documentation index](docs/README.md)
- [AI context system](docs/ai-context/README.md)
- [AI video workflow session plan](docs/roadmaps/ai-video-workflow-session-plan.md)
- [Delivery tracker](docs/delivery/delivery-and-testing-workflow.md)
- [Engineering backlog](docs/delivery/engineering-backlog.md)

## Common Local Commands

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
bash scripts/test_phase2_topic_to_storyboard_smoke.sh
bash scripts/test_phase3_render_manifest_smoke.sh
```

See [commands and validation](docs/ai-context/commands-and-validation.md) for the full command map.

## Documentation Layout

- `docs/product/` - product, content, brand, and feedback-loop docs
- `docs/architecture/` - system, workflow, data, rendering, and adapter docs
- `docs/prompts/` - prompt inventory and prompt-library docs
- `docs/integrations/` - provider and platform integration docs
- `docs/features/` - focused feature docs
- `docs/runbooks/` - operational runbooks
- `docs/delivery/` - setup, tracker, and backlog docs
- `docs/roadmaps/` - implementation plans and roadmap docs
- `docs/ai-context/` - lightweight context layer for future coding agents

## Safety Notes

Do not commit real `.env` files, local env backups, service-account keys, logs, caches, `infra/state/`, or generated runtime files. Live publish, token exchange, and paid provider calls should only be run intentionally.
