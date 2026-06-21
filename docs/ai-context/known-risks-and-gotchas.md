# Known Risks and Gotchas

Last reviewed: 2026-06-21 at git commit `0d0515b`.

## Secrets and sensitive files

- Do not open, print, or edit real `.env`, `.env.bak.*`, `infra/.env`, or `sa-key.json` unless explicitly required.
- `sa-key.json` appears tracked. Treat it as secret material anyway.
- `scripts/check_instagram_permissions.sh` prints token length and fingerprints, not full tokens, but it calls Meta APIs.
- `scripts/exchange_instagram_long_lived_token.sh` can rewrite repo-root `.env`.

## Runtime/generated files

Avoid manual edits to:

- `infra/state/`
- `logs/token-refresh.log`
- `infra/render-worker/__pycache__/`
- `.DS_Store`
- `.claude/worktrees/`
- `workflows/exports/`
- local storage/output folders

Some of these are currently tracked or present in the working tree; do not normalize them during unrelated tasks.

## Workflow JSON risks

- n8n workflow JSON is source-controlled logic, but credentials are bound inside the running n8n instance.
- Smoke scripts often sync workflow JSON into the n8n DB and rewrite Postgres credential bindings.
- Prompt wording should usually change in `prompts/`, not workflow JSON.
- Workflow queues must often be clear before smoke scripts run.

## Prompt/schema risks

- Removing or renaming placeholders breaks runtime prompt rendering unless the supplying workflow/helper code changes too.
- Response schema changes can break structured text parsing and DB persistence.
- `prompt_builder` runtime config may affect prompt rendering without changing the saved template text.
- Legacy prompt files exist beside current active files; confirm wiring before editing.

## Provider/API risks

- Many smoke tests call paid text, image, TTS, or hosting APIs when configured.
- Provider docs in older runbooks may lag adapter code. Inspect adapter files when provider behavior matters.
- Unsupported providers intentionally fail fast. Do not add silent fallback behavior.
- Google Cloud Storage paths depend on a mounted service-account key and public bucket URL.

## Render risks

- Render worker downloads remote assets, runs FFmpeg, may add subtitles/title overlay/music, uploads MP4, and posts callbacks.
- Background music failure has fallback behavior, but bad audio/video assets can still fail render attempts.
- Per-scene narration mode requires `narration_url` on each scene.
- Changing render request shape may require workflow export and render worker changes together.

## Database/state risks

- Init SQL under `infra/postgres/init/` applies on fresh Postgres state; an existing `infra/state/postgres` volume may not re-run it.
- Table/status contracts are hard-coded across workflow JSON, helper scripts, smoke scripts, and Studio UI.
- `content_id` relationships cascade deletes through many tables. Smoke scripts delete temporary content rows to clean fixtures.

## Frontend/backend coupling

- Studio UI directly edits prompt files and repo-root `.env`.
- Studio UI workflow launcher uses `execute_workflow_by_name.mjs`, so launcher changes can affect actual pipeline runs.
- `.env` edits require recreating affected containers; prompt edits are hot-loaded on next run.

## Files future agents should usually avoid

- `.env`, `.env.bak.*`, `infra/.env`
- `sa-key.json`
- `infra/state/**`
- `logs/**`
- `infra/render-worker/__pycache__/**`
- `.claude/worktrees/**`
- generated media outputs and storage caches
