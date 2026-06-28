# pipeline Context

## Purpose

This folder contains the code-first orchestration layer that runs typed Reel pipeline stages without n8n as the executor.

## When to read this

Read this for worker behavior, `reel_type` stage plans, pipeline run/step/event/review state, Studio enqueue/status endpoints, code-first stage migration, Remotion render dispatch, avatar gating, or approval-gated publish execution.

## Important files and subfolders

- `worker.mjs`: always-on worker loop; claims one pending stage at a time and idles when no jobs exist.
- `runs.mjs`: pipeline actions, `image`/`video`/`avatar` stage plans, enqueue/status helpers, step claiming, terminal-state handling, and event logging.
- `reviews.mjs`: opt-in human review checkpoints, editable artifact snapshots, approval application, and run resume behavior.
- `stages.mjs`: concrete code-first stage handlers through story package quality gating, image/video/avatar asset generation, Remotion manifest/render, caption/approval, plus explicit approved-Reel publish.
- `schema.mjs`, `db.mjs`: schema install and Postgres connection helpers.

## Inputs

Consumes Postgres rows, prompt files, `.env`/container env, existing workflow helper scripts, hosted assets, render worker responses, and explicit Studio/API enqueue requests.

## Outputs

Writes `pipeline_runs`, `pipeline_steps`, `pipeline_events`, `pipeline_reviews`, existing content/status tables, `workflow_runs`, assets, renders, publishes, and pending/approved publish records.

## Depends on

Root `package.json` dependencies, `infra/postgres/init/005_add_pipeline_orchestration.sql`, `infra/postgres/init/006_add_reel_types_avatar_generations.sql`, `infra/postgres/init/007_add_pipeline_reviews.sql`, existing `workflows/scripts/*` provider helpers, the Remotion renderer for default sync render execution, and the FFmpeg render worker as rollback fallback.

## Used by

Studio fast-path idea submission and the `pipeline-worker` Docker Compose service.

## Common change patterns

- Add or reorder a stage in `PIPELINE_STAGE_PLANS`, then implement one handler in `stages.mjs`.
- Keep provider-specific generation inside existing adapter helpers where possible.
- Add reviewable artifact checkpoints in `reviews.mjs`; review mode must remain opt-in and default pipeline runs must not pause.
- Add schema fields in init SQL and `schema.mjs` only when run/step/event tracking needs them.

## Do not do

- Do not put prompt wording here.
- Do not call live provider/render/publish stages in tests unless explicitly requested.
- Do not make the default generate action publish automatically.
- Do not remove n8n workflow exports until parity is proven and documented.
- Do not let avatar provider calls run without HeyGen env plus explicit account avatar policy and consent metadata.
- Do not change `pipeline_runs.reel_type` mid-flight; avatar auto-downgrade may set the content item's effective `reel_type` to `video` while preserving the requested run intent as `avatar`.

## Validation

```bash
npm run check
node scripts/test_pipeline_reel_type_plans.mjs
node -e "await import('./pipeline/db.mjs'); await import('./pipeline/schema.mjs'); await import('./pipeline/runs.mjs'); await import('./pipeline/stages.mjs'); console.log('pipeline imports ok')"
```

With a running stack, also check `docker compose --env-file infra/.env -f infra/docker-compose.yml ps`.

## Gotchas

- The default `generate_reel` action ends with `pipeline_runs.status = 'awaiting_approval'`; it intentionally leaves Instagram publish to an explicit approval-gated action.
- Opt-in review mode pauses at review checkpoints with `pipeline_runs.status = 'awaiting_review'`; approving the pending `pipeline_reviews` row resumes the next pending step.
- `story_package_quality_gate` runs after story package generation and before media generation; it uses `validating` -> `validation_complete`, promotes stronger `scene_guidance_json.image_prompt` values into storyboard scenes, and blocks weak story packages before provider spend.
- `director_contract` and `visual_prompt_builder` now run before media generation; `voice_performance_script` runs before image/video narration and must keep spoken text separate from delivery instructions.
- `final_qa_approval_gate` invokes the `final_qa_validator` prompt and only `qa_status = 'passed'` records are publishable. `analyze_performance` is a separate action for stored insight snapshots and future account guidance.
- `image`, `video`, and `avatar` use different stage lists. `video` remains the default for backward compatibility.
- `avatar` runs use `avatar_presenter_selector` and `avatar_media_generation`; approved routes rely on HeyGen's embedded avatar audio/video asset, while blocked or unavailable routes auto-downgrade to the normal video asset, voice performance, and narration path before Remotion finishing.
- Existing `content_items.status` remains `render_complete` after generation so Studio's selected-render approval route keeps working.
- Existing Postgres volumes do not automatically rerun init SQL; `ensurePipelineSchema` applies the new schema from Studio/worker startup paths.

## Uncertainties

- Full parity with every legacy n8n workflow still needs live/stub smoke testing.

## Last reviewed

2026-06-21, git commit pending.
