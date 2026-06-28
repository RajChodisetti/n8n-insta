# Current Focus

Last reviewed: 2026-06-21 at git commit `d1e1bd0`.

This summary is inferred from README/runbooks, `docs/delivery/engineering-backlog.md`, current workflow files, and the dirty working tree. Treat uncertain items as leads to verify, not guaranteed roadmap.

## Clear current workflow areas

- MVP simple-post flow is documented as complete.
- Phase 2 content packaging, captioning, hashtag ranking, image generation, and approval flows are documented as complete.
- Phase 3 scene assets, narration, render manifest, render dispatch, and render callback are documented as complete.
- Phase 3 live Reel publish, prompt externalization/one-click orchestration, and adapter-first provider/host architecture are marked `implemented_awaiting_test`.
- Phase 4 Instagram metrics collection is the recommended next build item and is also marked `implemented_awaiting_test`.
- Code-first orchestration is being introduced beside n8n: Studio queues `pipeline_runs`, `pipeline-worker` claims `pipeline_steps`, and n8n workflow exports remain as fallback/reference until parity is proven.
- Reel type selection is now active for code-first runs: `image`, `video`, and `avatar` stage plans are selected through Studio/API and persisted as `reel_type`.
- Scene-level asset planning is now active: image reels default to `image_with_motion`, video reels directly request provider video, and v3 asset generation falls back to still images plus Remotion motion when Fal/Wan is blocked by billing, quota, or provider availability.
- Code-first generation now includes a `story_package_quality_gate` after story package generation and before media generation; it uses offline checks/repairs to promote stronger scene image prompts, normalize render-seed timeline data, and block weak packages before provider spend.
- Code-first generation now actively runs `director_contract`, `visual_prompt_builder`, `voice_performance_script` for image/video narration, and `final_qa_validator`; these were formerly contract-only prompt assets.
- A separate `analyze_performance` action now converts stored Instagram insight snapshots into `performance_reviews` and reusable `client_account_contexts.context_json.performance_guidance`.
- Remotion is now the default code-first renderer through `infra/remotion-renderer/`; the renderer consumes per-scene camera moves, pan/zoom direction, transition type, overlays, pacing, and motion-layer hints. The existing FFmpeg render worker remains rollback fallback until parity is documented.
- Avatar video support now runs through `avatar_presenter_selector` plus `avatar_media_generation`; missing consent, unsafe direction, or incomplete HeyGen config auto-downgrades the requested avatar run to the existing video reel path instead of failing generation.
- Studio now exposes runtime provider/model/avatar settings plus a collapsed provider API key section; new Node-side LLM/avatar provider calls read the repo-root `.env` through the runtime env overlay instead of requiring a restart for those values.

## Prominent active areas

- The active IDE file is `workflows/scripts/generate_and_rehost_scene_assets_v3.mjs`.
- New orchestration source lives in `pipeline/`, with Docker runtime support in `infra/node-runtime/Dockerfile` and `infra/docker-compose.yml`.
- Current v2/v3 workflow files include `wf_asset_generation_v3.json`, `wf_render_worker_dispatch_v2.json`, `wf_render_sync_completion_v2.json`, `wf_validation_check.json`, `run_resume_aware_reel_pipeline_v3.mjs`, and `generate_and_rehost_scene_video.mjs`.
- Newer prompt groups/docs include `director/`, `story_package_generation/`, `rules/`, `style_packs/`, consolidated [Face Image](../features/face-image.md), consolidated [Fish Audio](../integrations/fish-audio.md), and the [AI video workflow session plan](../roadmaps/ai-video-workflow-session-plan.md).
- Sessions 1-20 of the AI video workflow plan added workflow inventory, fixtures, rule/style pack contracts, story package v2 contracts, a style-pack-constrained director contract, a prompt-free storyboard/shot-plan contract, a separate visual prompt builder contract, a clean-script-preserving voice performance contract, music/SFX license metadata, a contract-only final QA result, a selected-render approval gate, per-content client/account context snapshots, a planning-only model provider router contract, a renderer-neutral render manifest v2 bridge, a contract-only Remotion-compatible edit plan, an active consent-gated avatar/presenter selector, an offline AI video contract regression suite, and a stabilization/push pass. Read [AI video workflow inventory](ai-video-workflow-inventory.md) before changing prompt contracts, status transitions, render manifests, provider routing, client/account policy, Remotion edit plans, avatar/presenter decisions, tests, or publish gates.
- This suggests current work is expanding from image-only scenes toward director-guided, character-aware, image/video generation with richer TTS. This is inferred from file names and code, not from a single authoritative roadmap line.

## Likely upcoming integration areas

- Validating v3 scene asset/video generation and deciding which workflow export is the active path.
- Proving code-first pipeline parity against the legacy n8n path, especially Remotion render output, caption, approval, avatar consent failures, and explicit publish behavior.
- Keeping provider documentation aligned with adapter code, especially Fal AI, Fish Audio, Smallest AI, and Wan.
- Testing live Reel publish and Phase 4 metrics collection.
- Reconciling tracked runtime/secret-looking files with ignore policy.

## Known TODOs or awaiting-test items

From `docs/delivery/engineering-backlog.md`:

- `P3-06 Live reel publish path`: `implemented_awaiting_test`
- `P3-07 Prompt externalization and one-click Reel orchestration`: `implemented_awaiting_test`
- `P3-08 Adapter-first provider and host architecture`: `implemented_awaiting_test`
- `P4-01 Instagram metrics collection`: `implemented_awaiting_test`

## Ambiguities

- Some docs say OpenAI is the implemented provider for text/image/narration, but current code supports more providers for image and TTS.
- Local-only runtime files may appear in `git status`; future agents should avoid staging env backups, logs, `sa-key.json`, `.claude/`, or `__pycache__/`.
- The repo has many runbooks under `docs/runbooks/`. Prefer task routing over reading them all.
