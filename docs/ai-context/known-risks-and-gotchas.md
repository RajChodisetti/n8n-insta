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
- Code-first orchestration now exists in `pipeline/`; do not assume n8n workflow JSON is the only executor for the fast path.
- Smoke scripts often sync workflow JSON into the n8n DB and rewrite Postgres credential bindings.
- Prompt wording should usually change in `prompts/`, not workflow JSON.
- Workflow queues must often be clear before smoke scripts run.

## Prompt/schema risks

- Removing or renaming placeholders breaks runtime prompt rendering unless the supplying workflow/helper code changes too.
- Response schema changes can break structured text parsing and DB persistence.
- `prompt_builder` runtime config may affect prompt rendering without changing the saved template text.
- Legacy prompt files exist beside current active files; confirm wiring before editing.
- Voice performance metadata must not mutate clean narration text or leak provider-specific TTS control tags into generic contract fixtures.
- Final QA fixtures are contract examples, not active approval state. Publish workflows do not require `qa_result` until a later wiring session.
- Model provider router fixtures are planning examples, not active runtime routing. Recommendations must not be treated as `.env` changes, adapter changes, provider calls, render changes, approval changes, or publish changes.
- Render manifest v2 fixtures are bridge examples, not active render workflow state. They must not be treated as changes to `wf_render_manifest_construction.json`, dispatch workflows, or `infra/render-worker/app.py`.
- Remotion edit-plan fixtures are planning examples, not the active renderer implementation. Active renderer code lives in `infra/remotion-renderer/`; keep prompt-contract edits separate from runtime renderer edits.
- Avatar decision fixtures are consent-gated planning examples, not provider account setup, publish approval, or consent evidence. Runtime avatar generation is gated in `pipeline/stages.mjs`.
- The aggregate AI video contract regression runner is intended to stay offline. Do not add Docker, n8n, provider API, render execution, token, or publish requirements to `scripts/validate_ai_video_contract_regressions.mjs`.

## Provider/API risks

- Many smoke tests call paid text, image, TTS, or hosting APIs when configured.
- Provider docs in older runbooks may lag adapter code. Inspect adapter files when provider behavior matters.
- Unsupported providers intentionally fail fast. Do not add silent fallback behavior.
- `model_provider_router` may rank providers, but active provider selection still lives in `workflows/scripts/adapter_config.mjs` and adapter helper scripts until a later wiring session explicitly changes that behavior.
- Google Cloud Storage paths depend on a mounted service-account key and public bucket URL.
- Background music catalog entries with `license_status: unknown` or `publish_allowed: false` are skipped by the render worker and should fail catalog validation.
- Uploaded character-reference images are not consent records. A consent-gated avatar/presenter route still needs explicit consent status, consent record URI, allowed/disallowed use cases, usage restrictions, provider avatar ID, and provider voice ID before any future runtime generation.

## Render risks

- Remotion renderer downloads/loads remote media through Remotion SSR and uploads MP4 output. FFmpeg fallback worker still downloads remote assets, runs FFmpeg, may add subtitles/title overlay/music, uploads MP4, and posts callbacks.
- Background music failure has fallback behavior, but bad audio/video assets can still fail render attempts.
- Per-scene narration mode requires `narration_url` on each scene.
- Changing render request shape may require workflow export and render worker changes together.
- `render_manifest_v2` can describe captions and overlays, but active dispatch defaults may still disable or transform these fields. Verify wiring before assuming renderer-neutral fields are live.
- `remotion_edit_plan` can describe Remotion composition data and frame timing, but active code-first rendering now uses `infra/remotion-renderer/`; do not assume every fixture field is wired to runtime.

## Database/state risks

- Init SQL under `infra/postgres/init/` applies on fresh Postgres state; an existing `infra/state/postgres` volume may not re-run it.
- `pipeline_runs`, `pipeline_steps`, `pipeline_events`, `content_items.reel_type`, and `avatar_generations` are also ensured by Studio/worker startup paths, but migrations should still be kept in `infra/postgres/init/*.sql`.
- Table/status contracts are hard-coded across workflow JSON, helper scripts, smoke scripts, and Studio UI.
- The default code-first `generate_reel` action ends with `pipeline_runs.status = awaiting_approval` and keeps `content_items.status = render_complete` so existing Studio selected-render approval still works.
- `content_id` relationships cascade deletes through many tables. Smoke scripts delete temporary content rows to clean fixtures.
- Reel publish now fails closed without a matching `publish_approvals` row. If a rendered Reel does not publish, check `selected_video_id`, `qa_status`, `approval_status`, `approved_by`, `approved_at`, and `platform_account_id` before checking Meta API behavior.
- When `content_account_contexts.context_snapshot_json.publishing_policy.platform_account_id` is present, Reel publish and Studio approval require that account to match the approval account. Account mismatch is a policy failure, not a Meta API failure.
- Client/account context is preference and policy metadata only. Do not let it override global safety, consent, license, factuality, or platform rules, and do not move client-specific preferences into `prompts/rules/`.

## Frontend/backend coupling

- Studio UI directly edits prompt files and repo-root `.env`.
- Studio UI fast path queues code-first pipeline runs. The legacy workflow launcher still uses `execute_workflow_by_name.mjs`, so launcher changes can affect n8n fallback runs.
- `.env` edits require recreating affected containers; prompt edits are hot-loaded on next run.
- Studio UI can write selected-render approval records. It should not auto-approve; approvals should come from an explicit user action.

## Files future agents should usually avoid

- `.env`, `.env.bak.*`, `infra/.env`
- `sa-key.json`
- `infra/state/**`
- `logs/**`
- `infra/render-worker/__pycache__/**`
- `.claude/worktrees/**`
- generated media outputs and storage caches
