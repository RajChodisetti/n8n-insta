# Current Focus

Last reviewed: 2026-06-21 at git commit `0d0515b`.

This summary is inferred from README/runbooks, `16-engineering-backlog.md`, current workflow files, and the dirty working tree. Treat uncertain items as leads to verify, not guaranteed roadmap.

## Clear current workflow areas

- MVP simple-post flow is documented as complete.
- Phase 2 content packaging, captioning, hashtag ranking, image generation, and approval flows are documented as complete.
- Phase 3 scene assets, narration, render manifest, render dispatch, and render callback are documented as complete.
- Phase 3 live Reel publish, prompt externalization/one-click orchestration, and adapter-first provider/host architecture are marked `implemented_awaiting_test`.
- Phase 4 Instagram metrics collection is the recommended next build item and is also marked `implemented_awaiting_test`.

## Prominent active areas

- The active IDE file is `workflows/scripts/generate_and_rehost_scene_assets_v3.mjs`.
- The working tree includes untracked/newer v3 and v2 files such as `wf_asset_generation_v3.json`, `wf_render_worker_dispatch_v2.json`, `wf_render_sync_completion_v2.json`, `wf_validation_check.json`, `run_resume_aware_reel_pipeline_v3.mjs`, and `generate_and_rehost_scene_video.mjs`.
- Newer prompt groups/docs include `director/`, `story_package_generation/`, Face Image docs, and Fish Audio docs.
- This suggests current work is expanding from image-only scenes toward director-guided, character-aware, image/video generation with richer TTS. This is inferred from file names and code, not from a single authoritative roadmap line.

## Likely upcoming integration areas

- Validating v3 scene asset/video generation and deciding which workflow export is the active path.
- Keeping provider documentation aligned with adapter code, especially Fal AI, Fish Audio, Smallest AI, and Wan.
- Testing live Reel publish and Phase 4 metrics collection.
- Reconciling tracked runtime/secret-looking files with ignore policy.

## Known TODOs or awaiting-test items

From `16-engineering-backlog.md`:

- `P3-06 Live reel publish path`: `implemented_awaiting_test`
- `P3-07 Prompt externalization and one-click Reel orchestration`: `implemented_awaiting_test`
- `P3-08 Adapter-first provider and host architecture`: `implemented_awaiting_test`
- `P4-01 Instagram metrics collection`: `implemented_awaiting_test`

## Ambiguities

- Some docs say OpenAI is the implemented provider for text/image/narration, but current code supports more providers for image and TTS.
- Several v2/v3 files are untracked, so future agents should check `git status` before treating them as committed baseline.
- The repo has many root runbooks. Prefer task routing over reading them all.
