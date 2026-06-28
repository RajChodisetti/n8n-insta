# AI Video Workflow Inventory

Last reviewed: 2026-06-21 at git commit `d1e1bd0`.

This inventory tracks the AI video workflow session plan as sessions change prompts, validators, provider routing, render manifests, or publish gates. It is based on `workflows/scripts/*.mjs`, `workflows/n8n/*.json`, and existing context docs.

Runtime update: code-first `generate_reel` now supports `reel_type` values `image`, `video`, and `avatar`; Remotion is the default renderer through `infra/remotion-renderer/`; video reels require provider-video assets by default unless `ALLOW_VIDEO_TO_IMAGE_FALLBACK=true`; avatar runs use `avatar_presenter_selector` and `avatar_media_generation` to either call HeyGen or auto-downgrade to the normal video path when consent/config/safety is incomplete. Older Session 17 sections remain useful contract history, not the full current runtime picture.

## Read this when

- Starting a session from `docs/roadmaps/ai-video-workflow-session-plan.md`.
- Changing prompt stage contracts, workflow status transitions, render manifests, provider adapters, or publish approval gates.
- Deciding whether the older staged path or newer story package path is active for a change.

## Prompt stages

`workflows/scripts/build_prompt_request.mjs` currently supports these stages:

| Stage | Prompt files | Output key | Model env priority | Fallback |
|---|---|---|---|---|
| `director_contract` | `prompts/workflow/director_contract*.md`, `prompts/schemas/director_contract.schema.json` | `openai_request_director_contract` | `DIRECTOR_CONTRACT_MODEL`, `DIRECTOR_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4.1-mini` |
| `director` | `prompts/director/{system,user,response-schema}.md/json` | `openai_request_director` | `DIRECTOR_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4.1-mini` |
| `research_and_script` | `prompts/research_and_script/{system,user,response-schema}.md/json` | `openai_request` | `RESEARCH_MODEL`, `OPENAI_RESEARCH_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4o-mini` |
| `idea_ingest` | `prompts/idea_ingest/{system,user,response-schema}.md/json` | `openai_request_idea_ingest` | `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4o-mini` |
| `idea_prompt_profile` | `prompts/idea_prompt_profile/{system,user,response-schema}.md/json` | `openai_request_idea_prompt_profile` | `PROMPT_BUILDER_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4o-mini` |
| `story_package_generation` | `prompts/story_package_generation/{system,user,response-schema}.md/json` | `openai_request_story_package_generation` | `STORY_PACKAGE_MODEL`, `PREMIUM_TEXT_MODEL`, `OPENAI_STORY_PACKAGE_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4.1` |
| `story_package_generation_v2` | `prompts/workflow/story_package_generation_v2*.md`, `prompts/schemas/story_package.schema.json` | `openai_request_story_package_generation_v2` | `STORY_PACKAGE_V2_MODEL`, `STORY_PACKAGE_MODEL`, `PREMIUM_TEXT_MODEL`, `OPENAI_STORY_PACKAGE_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4.1` |
| `storyboard_and_prompts` | `prompts/storyboard_and_prompts/{system,user,response-schema}.md/json` | `openai_request` | `STORYBOARD_MODEL`, `OPENAI_STORYBOARD_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4o-mini` |
| `caption_and_hashtags` | `prompts/caption_and_hashtags/{system,user,response-schema}.md/json` | `openai_request_caption_and_hashtags` | `CAPTION_MODEL`, `OPENAI_CAPTION_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4o-mini` |
| `prompt_builder` | `prompts/prompt_builder/{system,user,response-schema}.md/json` | `openai_request_prompt_builder` | `PROMPT_BUILDER_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4o-mini` |
| `visual_prompt_builder` | `prompts/workflow/visual_prompt_builder.md`, `prompts/schemas/visual_prompt.schema.json` | `openai_request_visual_prompt_builder` | `VISUAL_PROMPT_MODEL`, `PROMPT_BUILDER_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4.1-mini` |
| `voice_performance_script` | `prompts/workflow/voice_performance_script.md`, `prompts/schemas/voice_performance.schema.json` | `openai_request_voice_performance_script` | `VOICE_PERFORMANCE_MODEL`, `PREMIUM_TEXT_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4.1-mini` |
| `avatar_presenter_selector` | `prompts/workflow/avatar_video_selector.md`, `prompts/schemas/avatar_decision.schema.json` | `openai_request_avatar_presenter_selector` | `AVATAR_MODEL`, `PREMIUM_TEXT_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4.1-mini` |
| `final_qa_validator` | `prompts/workflow/final_qa_validator.md`, `prompts/schemas/qa_result.schema.json` | `openai_request_final_qa_validator` | `FINAL_QA_MODEL`, `PREMIUM_TEXT_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4.1` |
| `performance_feedback_analysis` | `prompts/workflow/performance_feedback_analysis.md`, `prompts/schemas/performance_guidance.schema.json` | `openai_request_performance_feedback_analysis` | `PERFORMANCE_FEEDBACK_MODEL`, `PREMIUM_TEXT_MODEL`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL` | `gpt-4.1-mini` |

`build_prompt_request.mjs` chooses the text provider through `selectTextProvider(stageKey)`. `invoke_structured_text_adapter.mjs` supports OpenAI and Anthropic/Claude structured text calls; other text providers still throw `providerNotImplemented`.

Session 8 adds contract-only storyboard/shot-plan assets at `prompts/workflow/storyboard_and_shot_plan.md` and `prompts/schemas/storyboard.schema.json`. Visual prompt builder, voice performance, avatar presenter selection, and final QA contracts are now active code-first stages; music/SFX planning, provider routing, render manifest v2, and Remotion edit-plan remain contract/reference layers. `performance_feedback_analysis` is active only through the explicit `analyze_performance` action.

## n8n workflow exports

| File | Workflow name | Likely responsibility | Notes |
|---|---|---|---|
| `wf_manual_topic_ingest.json` | `wf_manual_topic_ingest` | Manual topic intake | Produces candidate content rows for downstream stages. |
| `wf_research_and_script.json` | `wf_research_and_script` | Older script generation path | Claims `idea_approved`, writes `scripts`, marks `script_complete`. |
| `wf_director.json` | `wf_director_contract` | Director contract generation | Claims `script_complete`, writes `directors`, marks `directed`. |
| `wf_storyboard_and_prompts.json` | `wf_storyboard_and_prompts` | Older storyboard and visual prompt path | Claims `directed`, writes `storyboards`, marks `storyboard_complete`. |
| `wf_story_package_generation.json` | `wf_story_package_generation` | Newer one-command story package path | Runs `run_story_package_generation.mjs`; claims `idea_approved`, writes `scripts` and `storyboards`, marks `storyboard_complete`. |
| `wf_validation_check.json` | `wf_validation_check` | Pre-asset contract validation | Validates storyboard shape, face image rules, subtitle metadata, and render seed details. |
| `wf_asset_generation.json` | `wf_asset_generation` | Older scene/post asset generation | Kept for compatibility; prefer v3 for current video scene work. |
| `wf_asset_generation_v3.json` | `wf_asset_generation_v3` | Current scene asset generation | Claims validated/storyboard-ready items, writes scene assets, marks `assets_ready`. |
| `wf_simple_post_image_asset.json` | `wf_simple_post_image_asset` | Simple post image asset generation | Used by image-post path, not the Reel render path. |
| `wf_narration_generation.json` | `wf_narration_generation` | Per-scene narration generation | Claims `assets_ready`, writes `scene_narration` assets, marks `narration_ready`. |
| `wf_render_manifest_construction.json` | `wf_render_manifest_construction` | Render manifest builder | Claims `narration_ready`, inserts/updates `renders`, marks `render_manifest_ready`. |
| `wf_render_worker_dispatch.json` | `wf_render_worker_dispatch` | Older async render dispatch | Kept for compatibility. |
| `wf_render_worker_dispatch_v2.json` | `wf_render_worker_dispatch_v2` | Current async render dispatch | Claims `render_manifest_ready`, sends render request, marks `render_queued`. |
| `wf_render_sync_completion.json` | `wf_render_sync_completion` | Older sync render completion | Kept for compatibility. |
| `wf_render_sync_completion_v2.json` | `wf_render_sync_completion_v2` | Current sync render completion | Claims `render_manifest_ready`, calls render worker, marks `render_complete` or `render_failed`. |
| `wf_render_status_callback.json` | `wf_render_status_callback` | Async render callback | Updates render status from worker callback. |
| `wf_caption_and_hashtags.json` | `wf_caption_and_hashtags` | Publish draft text | Claims publish draft candidates and upserts caption/hashtags in `publishes`. |
| `wf_content_approval.json` | `wf_content_approval` | Manual simple-post approval | Claims `approval_pending`, records approve/reject, marks `qa_approved` or `approval_rejected`. |
| `wf_instagram_simple_post_publish.json` | `wf_instagram_simple_post_publish` | Live image post publisher | Publishes ready image posts through Meta Graph API when enabled. |
| `wf_instagram_reel_publish.json` | `wf_instagram_reel_publish` | Live Reel publisher | Publishes rendered MP4 Reels through Meta Graph API when enabled. |
| `wf_instagram_publish_readiness.json` | `wf_instagram_publish_readiness` | Publish/account readiness checks | Checks Instagram Graph/API readiness. |
| `wf_instagram_metrics_collection.json` | `wf_instagram_metrics_collection` | Metrics ingestion | Collects Instagram metrics after publish. |
| `wf_end_to_end_reel_generate_and_publish.json` | `wf_end_to_end_reel_generate_and_publish` | Older one-click orchestration | Compatibility path. |
| `wf_end_to_end_reel_generate_and_publish_v2.json` | `wf_end_to_end_reel_generate_and_publish_v2` | Newer one-click orchestration | Current one-click path should be verified before edits. |

## Current control flow

There are two story creation paths:

1. Older staged path: `idea_approved` -> `wf_research_and_script` -> `script_complete` -> `wf_director` -> `directed` -> `wf_storyboard_and_prompts` -> `storyboard_complete`.
2. Newer package path: `idea_approved` -> `wf_story_package_generation` -> `storyboard_complete`.

After `storyboard_complete`, the legacy n8n Reel flow is inferred from v3 workflow names and status transitions:

`storyboard_complete` or validated storyboard -> asset generation -> `assets_ready` -> narration generation -> `narration_ready` -> render manifest construction -> `render_manifest_ready` -> render dispatch/sync -> `render_queued` or `render_complete`/`render_failed` -> caption and Reel publish.

The active code-first `generate_reel` plans insert `story_package_quality_gate`, `director_contract`, and `visual_prompt_builder` before media generation for `image`, `video`, and `avatar` runs. Image/video runs also insert `voice_performance_script` after scene assets and before narration. Avatar runs insert `avatar_presenter_selector` and `avatar_media_generation`; approved avatar routes produce `avatar_ready`, while fallback routes set the effective content route to `video`, promote storyboard scenes to provider-video plans, reuse only ready `scene_video` assets, and internally run v3 scene assets, voice performance, and narration to `narration_ready`. The gate uses the existing `validating` -> `validation_complete` status pair, blocks weak packages before media provider spend, and can promote stronger `scene_guidance_json.image_prompt` values into storyboard scenes before asset generation.

`workflows/scripts/run_resume_aware_reel_pipeline_v3.mjs` lists these active statuses: `idea_approved`, `scripting`, `script_complete`, `directing`, `directed`, `storyboarding`, `storyboard_complete`, `generating_assets`, `assets_ready`, `generating_narration`, `narration_ready`, `building_render_manifest`, `render_manifest_ready`, `dispatching_render`, `render_queued`, `render_complete`, and `render_failed`.

## `research_and_script` outputs and consumers

`wf_research_and_script.json` writes `scripts` fields including hook options, `selected_hook`, `narration_script`, `short_script`, `caption_draft`, `cta_line`, `onscreen_text_json`, `generation_model`, and `raw_response_json`. Its raw response also carries `scene_guidance_json`.

Known consumers:

- `wf_director.json` consumes `scripts.narration_script` and `scripts.raw_response_json->'scene_guidance_json'`.
- `wf_storyboard_and_prompts.json` consumes `scripts.narration_script`, `short_script`, `onscreen_text_json`, and `raw_response_json->'scene_guidance_json'`, plus `directors.director_json`.
- `wf_caption_and_hashtags.json` consumes script draft fields to create `publishes` rows.
- Render dispatch v2 reads `scripts.selected_hook`, `scripts.narration_script`, and music direction from `scripts.raw_response_json`.
- Asset and narration generation workflows rely on storyboard rows produced downstream from this path.

## `director_contract` outputs and consumers

Session 7 wires the `director_contract` stage to `prompts/workflow/director_contract*.md` and `prompts/schemas/director_contract.schema.json`. The older `director` stage still uses `prompts/director/*` as a fallback path.

Important current behavior:

- Requires one registry-backed `selected_style_pack`.
- Allows one `secondary_influence` or `style_pack_id: "none"`.
- Requires `rejected_styles`, visual/voice/music/caption/edit/avatar/routing/risk/QA contract blocks, and legacy top-level fields.
- Keeps legacy fields such as `voice_role`, `tts_delivery`, `global_visual_style`, `visual_strategy`, `global_pacing`, and `global_music_direction` because n8n SQL and downstream prompts still read them directly.
- Does not choose final providers, models, hosts, storage, render implementations, or publish accounts.

Known consumers:

- `wf_director.json` validates legacy fields, writes the full contract to `directors.director_json`, stores selected top-level fields in columns, and marks `directed`.
- `wf_storyboard_and_prompts.json` reads `directors.director_json` and the legacy top-level director fields through prompt template defaults.
- `wf_narration_generation.json` reads `director_json.voice_role`, `director_json.tts_delivery`, and `director_json.scenes`.
- Render dispatch workflows read `director_json.global_music_direction`, `global_visual_style`, and `visual_strategy` for render music/style context.

## `storyboard_and_shot_plan` contract assets

Session 8 introduces a plan-only storyboard contract that separates scene planning from final visual prompt generation. It is not the active runtime storyboard stage yet.

Important current behavior:

- `prompts/workflow/storyboard_and_shot_plan.md` defines scenes, beats, timing, shot intent, asset needs, voice line IDs, caption intent, music/SFX intent, transition intent, risks, and QA focus.
- `prompts/schemas/storyboard.schema.json` intentionally does not include `visual_prompt`, `image_prompt`, `video_prompt`, `cover_prompt`, `render_manifest_seed_json`, provider fields, model fields, host fields, or storage fields.
- `scripts/validate_storyboard_fixture.mjs` validates shape, contiguous timing, duration sum, voice-line references, asset-sequence alignment, Session 9 delegation, and absence of prompt/render/provider fields.
- `wf_storyboard_and_prompts.json` still uses `prompts/storyboard_and_prompts/*` and still produces legacy `storyboard_json.visual_prompt`, cover prompt, subtitle metadata, and render seed fields.

Known consumers:

- No active n8n workflow consumes the Session 8 contract yet.
- The Session 9 visual prompt builder contract is the planned consumer of this storyboard/shot-plan shape, but it is not wired into active workflow execution yet.

## `visual_prompt_builder` contract assets

Session 9 introduced a visual prompt builder that converts storyboard/shot-plan scenes into concrete scene-level asset prompts. It is now wired into active code-first generation before asset generation.

Important current behavior:

- `prompts/workflow/visual_prompt_builder.md` writes final `visual_prompt`, `image_prompt`, `negative_prompt`, and `fallback_prompt` fields into `storyboard_json` before asset generation.
- `prompts/schemas/visual_prompt.schema.json` requires subject, environment, composition, camera, motion, lighting, style, duration, aspect ratio, continuity, text policy, visual prompt, negative prompt, fallback prompt, safety notes, and QA checks per scene.
- `scripts/validate_visual_prompt_fixture.mjs` validates schema shape, sequential scene numbers, prompt specificity, text-free generated asset policy, negative prompts that exclude readable text artifacts, and absence of provider/model/render/storage choices.
- `fixtures/ai-video/founder_explainer/expected_visual_prompt_builder.json` is the representative valid fixture.
- `fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_vague.json` is intentionally vague and should fail validation.
- Critical readable text remains reserved for later renderer metadata/layers; image/video prompts should keep generated assets text-free by default.

Known consumers:

- No active n8n workflow consumes the Session 9 visual prompt contract yet.
- Code-first `visual_prompt_builder` consumes the contract and updates `storyboard_json` before `image_asset_generation` or `asset_generation_v3`.
- Code-first `story_package_quality_gate` can copy stronger `scene_guidance_json.image_prompt` values into `storyboard_json[].image_prompt`; `visual_prompt_builder` then performs the final prompt refinement before asset generation.

## `voice_performance_script` contract assets

Session 10 introduced a voice performance script that separates clean spoken narration from line-level delivery metadata. It is now wired into image/video code-first narration before TTS generation.

Important current behavior:

- `prompts/workflow/voice_performance_script.md` defines provider-neutral line-level tone, pace, pause, emphasis, pronunciation, estimated duration, and music ducking fields.
- `prompts/schemas/voice_performance.schema.json` preserves `clean_spoken_script` separately from `lines[].line_text` and performance metadata.
- `scripts/validate_voice_performance_fixture.mjs` validates schema shape, joined line text matching the clean script, total duration math, emphasis/pronunciation references, no provider/model/storage keys, and no provider-specific parenthetical performance tags.
- `fixtures/ai-video/founder_explainer/expected_voice_performance_script.json` is the representative valid fixture.
- `fixtures/ai-video/founder_explainer/invalid_voice_performance_script_mutated_text.json` intentionally changes line text and should fail validation.
- `prompts/narration_generation/instructions.md` remains the base TTS instruction source; `voice_performance_script` now enriches per-scene `tts_instructions` as delivery metadata without mutating spoken text.

Known consumers:

- No active n8n workflow consumes the Session 10 voice performance contract yet.
- `wf_narration_generation.json`, `workflows/scripts/generate_and_rehost_narration_audio.mjs`, and `workflows/scripts/tts_adapters.mjs` still generate per-scene narration from clean `dialogue_lines`/`narration_text` and existing director scene instructions.

## `music_sfx_plan` contract assets and music license metadata

Session 11 introduces a contract-only music/SFX planning stage and explicit license metadata for the active background music catalog.

Important current behavior:

- `prompts/workflow/music_sfx_plan.md` defines provider-neutral music and SFX planning guidance, with track selection kept separate from planning.
- `prompts/schemas/music_sfx_plan.schema.json` requires license policy, a music selection brief, SFX policy, scene-level audio notes, asset license review, publish safety, and QA focus.
- `prompts/schemas/music_asset.schema.json` defines the active background music catalog entry shape.
- `prompts/schemas/sfx_asset.schema.json` defines a future SFX asset shape, but no SFX catalog exists yet.
- `scripts/validate_music_sfx_fixture.mjs` validates that unknown-license or non-publishable referenced assets fail.
- `scripts/validate_music_library.mjs` validates `workflows/assets/music/library.json` and requires exactly one default track, explicit license status, and `publish_allowed: true`.
- `workflows/assets/music/library.json` now records `license_status`, `publish_allowed`, `license_scope`, `license_notes`, `allowed_uses`, and `disallowed_uses` on each track.
- `infra/render-worker/app.py` skips catalog entries where `license_status` is `unknown` or `publish_allowed` is not true before scoring music.

Known consumers:

- No active n8n workflow consumes the Session 11 `music_sfx_plan` prompt contract yet.
- The active render worker still chooses background music from `workflows/assets/music/library.json` using category/tone/mood scoring.
- Render request construction still sends `music_context` from director/script/style metadata; it does not consume the Session 11 plan yet.

## `final_qa_validator` contract assets

Session 12 introduced a final QA result that can express publish-blocking and non-blocking issues. It is now the active code-first approval gate before Studio approval/publish.

Important current behavior:

- `prompts/workflow/final_qa_validator.md` defines the final package review contract.
- `prompts/schemas/qa_result.schema.json` requires explicit `blocking_issues`, `non_blocking_issues`, `stage_fix_references`, and `publish_requirements`.
- `scripts/validate_final_qa_fixture.mjs` validates blocker consistency, issue-to-fix-stage references, and category-specific upstream fix stages.
- Fixture cases cover an approved package plus blocked license, avatar consent, and caption/export failures.
- Code-first `final_qa_approval_gate` invokes `final_qa_validator`; publish still requires a selected-render approval row with `qa_status = 'passed'`.

Known consumers:

- No active n8n workflow consumes `final_qa_validator` yet.
- Current Reel publish still claims `render_complete` rows with successful render output and draft/failed publish rows.
- Session 13 is expected to wire an approval queue and publish gate.

## `story_package_generation` outputs and consumers

`run_story_package_generation.mjs` calls the `story_package_generation` prompt stage by default, requires script fields, normalizes `scene_guidance_json`, `storyboard_json`, `onscreen_text_json`, and `subtitle_lines_json`, then writes both `scripts` and `storyboards`.

Session 6 added an opt-in `story_package_generation_v2` stage. Enable it only with `STORY_PACKAGE_GENERATION_STAGE=story_package_generation_v2` or `STORY_PACKAGE_STAGE=v2`. When v2 is selected, `workflows/scripts/story_package_v2_compat.mjs` maps the v2 contract back to the legacy script/storyboard response shape before the existing database writes and downstream workflows run.

Important current behavior:

- Claims `content_items.status = 'idea_approved'` and temporarily sets `scripting`.
- Upserts `scripts` with hook/script/caption fields and `raw_response_json.v2_story_package = true`.
- Upserts `storyboards` with `storyboard_json`, `cover_prompt`, `subtitle_lines_json`, `style_notes`, and `render_manifest_seed_json`.
- Forces scene 1 to `is_face_image = true`, `asset_type = image`, and a max 4 second duration.
- Clears `face_image_title` on scenes after scene 1 and sets their `asset_type = video`.
- Sets `render_manifest_seed_json.subtitles.enabled = false`.
- Marks the item `storyboard_complete`.
- Code-first runs then execute `story_package_quality_gate`, which marks passing packages `validation_complete`, normalizes the render-seed timeline, fills asset-plan/remotion defaults, and promotes stronger per-scene image prompts from `scripts.raw_response_json.scene_guidance_json` into storyboard scenes before asset generation. Blocking issues leave the pipeline failed before image/video/TTS provider calls.

Known consumers are the same downstream consumers as the older storyboard path: validation, asset generation, narration generation, render manifest construction, render dispatch/sync, captions, and publish.

## Render manifest contract

`wf_render_manifest_construction.json` is the current manifest builder.

Inputs:

- `content_items` with status `narration_ready`.
- `storyboards.storyboard_json`, `subtitle_lines_json`, and `render_manifest_seed_json`.
- Ready scene visual assets with `asset_role in ('scene_image', 'scene_video')`.
- Ready per-scene narration assets with `asset_role = 'scene_narration'`.

Outputs:

- `renders.render_manifest_json` with `manifest_version: 2`.
- `renders.render_status = 'manifest_ready'`.
- `content_items.status = 'render_manifest_ready'`.
- Manifest fields include `output`, `audio.narration`, `subtitles.enabled = false`, `timing`, `scenes`, `timeline`, `total_duration_seconds`, `cover_image_url`, and original `seed`.
- If a scene has `face_image_title`, the builder emits renderer-owned `title_overlay` metadata with that text enabled for 2 seconds.

Consumers:

- `wf_render_worker_dispatch_v2.json` reads `render_manifest_json`, creates a render request, and updates status to `render_queued`.
- `wf_render_sync_completion_v2.json` reads the same manifest, calls the render worker synchronously, and marks `render_complete` or `render_failed`.
- `wf_instagram_reel_publish.json` requires a successful row in `renders` with `output_video_url`.

## `render_manifest_v2` bridge assets

Session 16 introduces a renderer-neutral bridge contract that can lower into the current local FFmpeg request shape without replacing the active renderer.

Important current behavior:

- `prompts/workflow/render_manifest_v2.md` is contract-only and is not an active prompt stage in `build_prompt_request.mjs`.
- `prompts/schemas/render_manifest_v2.schema.json` defines scenes, visual/narration/music assets, timeline tracks, captions, overlays, transitions, safe areas, export settings, storage, quality gates, and FFmpeg compatibility.
- `fixtures/ai-video/founder_explainer/expected_render_manifest_v2.json` is the representative valid bridge fixture.
- `scripts/validate_render_manifest_v2_fixture.mjs` validates renderer-neutral policy, public media URLs, contiguous scene timing, asset/overlay references, caption timing, publish-safe music/SFX metadata, and `ffmpeg_compatibility.render_request_preview`.
- The bridge does not change `wf_render_manifest_construction.json`, `wf_render_worker_dispatch_v2.json`, `wf_render_sync_completion_v2.json`, or `infra/render-worker/app.py`.

Known consumers:

- No active n8n workflow consumes `render_manifest_v2` yet.
- The current local FFmpeg worker still consumes the lowered render request built by render dispatch/sync workflows.

Validation:

- `jq empty prompts/schemas/render_manifest_v2.schema.json`
- `node scripts/validate_render_manifest_v2_fixture.mjs fixtures/ai-video/founder_explainer/expected_render_manifest_v2.json`
- `node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_renderer_replacement.json`
- `node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_timeline_gap.json`

## `remotion_edit_plan` contract assets

Session 17 introduces a contract-only Remotion-compatible edit plan that can be derived from `render_manifest_v2` without installing or running Remotion.

Important current behavior:

- `prompts/workflow/remotion_edit_plan.md` is contract-only and is not an active prompt stage in `build_prompt_request.mjs`.
- `prompts/schemas/remotion_edit_plan.schema.json` defines composition metadata, frame-based sequences, captions, overlays, lower thirds, audio tracks, ducking, SFX, transitions, brand elements, export settings, render environment notes, and a fallback plan.
- The contract uses Remotion concepts as data only: composition `id`, `component_name`, dimensions, FPS, `duration_in_frames`, and `default_props`.
- `fixtures/ai-video/founder_explainer/expected_remotion_edit_plan.json` is the representative valid edit-plan fixture.
- `scripts/validate_remotion_edit_plan_fixture.mjs` validates plan-only policy, no dependency/runtime changes, contiguous frame timing, public hosted media URLs, renderer-owned text overlays, publish-safe audio metadata, and an active `local_ffmpeg` fallback.
- Future-only Remotion setup commands may appear under `render_environment.commands_for_future_runtime_only`; they are not current setup instructions.
- The contract does not change `wf_render_manifest_construction.json`, render dispatch/sync workflows, `infra/render-worker/app.py`, package files, or dependencies.

Known consumers:

- No active n8n workflow consumes `remotion_edit_plan` yet.
- The current local FFmpeg worker remains the active renderer.

Validation:

- `jq empty prompts/schemas/remotion_edit_plan.schema.json`
- `node scripts/validate_remotion_edit_plan_fixture.mjs fixtures/ai-video/founder_explainer/expected_remotion_edit_plan.json`
- `node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_runtime_install.json`
- `node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_frame_gap.json`

## `avatar_presenter_selector` contract assets

Session 18 introduced the avatar/presenter selector; it is now an active code-first structured text stage. The prompt file is `prompts/workflow/avatar_video_selector.md`, and its structured `source_stage` is `avatar_presenter_selector` to match final QA upstream-fix routing.

Important current behavior:

- `prompts/workflow/avatar_video_selector.md` is active through `build_prompt_request.mjs`, with provider routing priority `AVATAR_LLM_PROVIDER`, then premium/text fallbacks.
- `prompts/schemas/avatar_decision.schema.json` defines a consent-gated active runtime decision, inputs, presenter profile, consent evaluation, selected route, effective reel type, non-avatar fallback, disclosure, provider-safe request options, presenter direction, quality gates, and implementation notes.
- `prompts/schemas/presenter_profile.schema.json` defines consent status, consent record URI, allowed/disallowed use cases, usage restrictions, provider avatar ID, provider voice ID, disclosure policy, and asset-route policy.
- `fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision.json` is the representative valid avatar decision fixture.
- `fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision_active_heygen.json` is the active provider-call fixture.
- `fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision_fallback_video.json` is the valid auto-downgrade fixture.
- `fixtures/ai-video/avatar_sales_outreach/invalid_avatar_decision_missing_consent.json` intentionally enables an avatar route without consent metadata and should fail validation.
- `fixtures/ai-video/avatar_sales_outreach/invalid_avatar_decision_character_reference_consent.json` intentionally treats an uploaded character reference as consent and should fail validation.
- `scripts/validate_avatar_decision_fixture.mjs` validates both schemas plus repo-specific consent gates: provider calls only for active version `1.1` decisions with consent/provider identity, no dependencies, no publish route, provider identity present for enabled avatar routes, non-avatar fallback active, uploaded character references rejected as consent, and final QA required.
- Character-reference uploads in `studio-ui/server.mjs` create hosted source media only; they are not consent records.

Known consumers:

- Code-first avatar runs consume `avatar_presenter_selector` before `avatar_media_generation`.
- Final QA receives avatar decision, actual route, effective reel type, disclosure evidence, and fallback reason.
- Avatar provider integration still must pass final QA and selected-render approval before publish.

Validation:

- `jq empty prompts/schemas/avatar_decision.schema.json prompts/schemas/presenter_profile.schema.json`
- `node scripts/validate_avatar_decision_fixture.mjs fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision.json`
- `node scripts/validate_avatar_decision_fixture.mjs fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision_active_heygen.json`
- `node scripts/validate_avatar_decision_fixture.mjs fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision_fallback_video.json`
- `node scripts/validate_avatar_decision_fixture.mjs --expect-fail fixtures/ai-video/avatar_sales_outreach/invalid_avatar_decision_missing_consent.json`
- `node scripts/validate_avatar_decision_fixture.mjs --expect-fail fixtures/ai-video/avatar_sales_outreach/invalid_avatar_decision_character_reference_consent.json`

## Offline contract regression suite

Session 19 introduces `scripts/validate_ai_video_contract_regressions.mjs` as the aggregate local test entrypoint for prompt contracts and publish blockers.

Important current behavior:

- The runner parses contract JSON under `prompts/schemas`, `prompts/rules`, `prompts/style_packs`, `prompts/examples`, and `fixtures/ai-video`.
- It runs the no-dependency fixture validators for invalid style pack, missing music license, missing avatar consent, unapproved render, missing visual negative prompt, changed clean spoken script, renderer-neutral manifest behavior, Remotion plan-only behavior, and avatar consent gating.
- It runs `scripts/validate_publish_gate_workflow.mjs` to keep selected-render approval gates covered.
- It uses local Node processes only; it does not require Docker, n8n, credentials, provider APIs, Remotion, render execution, or publish APIs.

Validation:

- `node scripts/validate_ai_video_contract_regressions.mjs`

## Publish and approval gates

Current gates are not a final video QA gate.

- `wf_content_approval.json` handles simple-post approval candidates where `content_items.status = 'approval_pending'`, then sets `qa_approved` or `approval_rejected`.
- `wf_instagram_simple_post_publish.json` can claim rows where `content_items.status in ('assets_ready', 'qa_approved')`, `publishes.publish_status in ('draft', 'failed')`, and a ready post image asset exists. This means `qa_approved` is allowed but not strictly required for the simple-post publisher.
- `wf_instagram_reel_publish.json` can claim rows where `content_items.status = 'render_complete'`, `renders.render_status = 'success'`, `output_video_url` is present, and `publishes.publish_status in ('draft', 'failed')`. It does not currently require `qa_approved` or a selected-video approval status.
- Both live publish workflows require `INSTAGRAM_PUBLISH_ENABLED=true`, Instagram credentials, caption text, duplicate publish protection, and public non-local asset URLs.

Session 13 adds a stricter selected-render approval gate.

Current approval gate behavior:

- `publish_approvals` stores selected-render approval records with `selected_video_id`, `qa_status`, `approval_status`, `approved_by`, `approved_at`, and `platform_account_id`.
- `wf_instagram_reel_publish.json` now claims only rows with an approved `publish_approvals` record where `selected_video_id = renders.render_id`, `qa_status = 'passed'`, and the account metadata is present.
- The Reel publish code verifies the approval account against `INSTAGRAM_IG_USER_ID` when set and against the selected Instagram account before creating a media container.
- `wf_instagram_simple_post_publish.json` now requires `content_items.status = 'qa_approved'`; it no longer publishes directly from `assets_ready`.
- Studio UI can record an explicit selected-render approval for rendered Reels through `POST /api/topics/:content_id/approval`.

## Client/account context snapshots

Session 14 adds account-level policy as a separate snapshot, not as global prompt rules.

Current behavior:

- `client_account_contexts` stores reusable account policy documents keyed by `account_context_key`.
- `content_account_contexts` stores the per-content snapshot used by a job.
- Studio-created topics write the snapshot both to `content_account_contexts.context_snapshot_json` and to `content_items.source_payload_json.client_account_context`.
- The context schema covers brand, style, voice, music, avatar, publishing, and safety boundaries.
- `safety_policy.global_rules_override_allowed` must remain false; client/account preferences do not override global safety, consent, license, factuality, or platform rules.
- `workflows/scripts/prompt_stage_defaults.mjs` can derive prompt defaults from `client_account_context` when a workflow supplies one.
- `workflows/scripts/run_story_package_generation.mjs` loads the per-content snapshot and passes it into `story_package_generation` / opt-in `story_package_generation_v2`.
- `wf_instagram_reel_publish.json` still requires `publish_approvals`; when `content_account_contexts.context_snapshot_json.publishing_policy.platform_account_id` is present, that account must match the approval account before publish.

Validation:

- `node scripts/validate_client_account_context_fixture.mjs fixtures/ai-video/founder_explainer/expected_client_account_context.json`
- `node scripts/validate_client_account_context_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_client_account_context_safety_override.json`
- `node scripts/validate_client_account_context_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_client_account_context_style_conflict.json`
- `node scripts/validate_publish_gate_workflow.mjs`

## Model provider router contract assets

Session 15 introduces a planning-only model/provider router contract. It records candidates, fit scores, constraints, fallbacks, cost/speed/quality assumptions, availability notes, and fail-closed conditions across the provider boundaries that are already represented in this repo.

Important current behavior:

- `prompts/workflow/model_provider_router.md` is contract-only and is not an active prompt stage in `build_prompt_request.mjs`.
- `prompts/schemas/model_route.schema.json` requires `planning_only: true` and `changes_runtime_behavior: false` in route summaries.
- `scripts/validate_model_route_fixture.mjs` checks planning-only behavior, boundary/provider compatibility, uppercase env key names, no env assignments, fallback references, and no adapter behavior changes.
- The router can recommend `recommended_env_settings`, but fixture validation requires every recommendation to keep `apply_now: false`.
- The provider route must preserve upstream creative direction, style packs, client/account policy, license rules, avatar consent, approval gates, render behavior, and publish behavior.

Known consumers:

- No active n8n workflow consumes `model_provider_router` yet.
- Adapter selection still comes from `workflows/scripts/adapter_config.mjs` and the provider adapters listed below.

Validation:

- `jq empty prompts/schemas/model_route.schema.json`
- `node scripts/validate_model_route_fixture.mjs fixtures/ai-video/founder_explainer/expected_model_provider_route.json`
- `node scripts/validate_model_route_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_model_provider_route_runtime_change.json`
- `node scripts/validate_model_route_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_model_provider_route_boundary_mismatch.json`

## Provider selectors and env vars

`workflows/scripts/adapter_config.mjs` defines provider selection:

| Boundary | Selector | Env priority | Fallback |
|---|---|---|---|
| Text, idea ingest | `selectTextProvider('idea_ingest')` | `IDEA_INGEST_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, research | `selectTextProvider('research_and_script')` | `RESEARCH_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, story package | `selectTextProvider('story_package_generation')` | `STORY_PACKAGE_LLM_PROVIDER`, `PREMIUM_TEXT_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, story package v2 | `selectTextProvider('story_package_generation_v2')` | `STORY_PACKAGE_V2_LLM_PROVIDER`, `STORY_PACKAGE_LLM_PROVIDER`, `PREMIUM_TEXT_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, director | `selectTextProvider('director'/'director_contract')` | `DIRECTOR_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, visual prompt | `selectTextProvider('visual_prompt_builder')` | `VISUAL_PROMPT_LLM_PROVIDER`, `PREMIUM_TEXT_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, voice performance | `selectTextProvider('voice_performance_script')` | `VOICE_PERFORMANCE_LLM_PROVIDER`, `PREMIUM_TEXT_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, final QA | `selectTextProvider('final_qa_validator')` | `FINAL_QA_LLM_PROVIDER`, `PREMIUM_TEXT_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, performance feedback | `selectTextProvider('performance_feedback_analysis')` | `PERFORMANCE_FEEDBACK_LLM_PROVIDER`, `PREMIUM_TEXT_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, prompt profile/builder | `selectTextProvider('idea_prompt_profile'/'prompt_builder')` | `IDEA_PROMPT_PROFILE_LLM_PROVIDER`, `PROMPT_BUILDER_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, storyboard | `selectTextProvider('storyboard_and_prompts')` | `STORYBOARD_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Text, caption | `selectTextProvider('caption_and_hashtags')` | `CAPTION_LLM_PROVIDER`, `TEXT_LLM_PROVIDER` | `openai` |
| Scene image | `selectImageProvider('scene_image')` | `SCENE_IMAGE_PROVIDER`, `IMAGE_GENERATION_PROVIDER` | `openai` |
| Post image | `selectImageProvider('post_image')` | `POST_IMAGE_PROVIDER`, `IMAGE_GENERATION_PROVIDER` | `openai` |
| Narration | `selectNarrationProvider()` | `NARRATION_PROVIDER`, `TTS_PROVIDER` | `fish_audio` |
| Scene asset host | `selectAssetHostProvider('scene_image')` | `SCENE_IMAGE_HOST_PROVIDER`, `ASSET_HOST_PROVIDER`, `IMAGE_HOST_PROVIDER` | `object_storage` |
| Post asset host | `selectAssetHostProvider('post_image')` | `POST_IMAGE_HOST_PROVIDER`, `ASSET_HOST_PROVIDER`, `IMAGE_HOST_PROVIDER` | `object_storage` |
| Narration host | `selectAssetHostProvider('narration_audio')` | `NARRATION_HOST_PROVIDER`, `ASSET_HOST_PROVIDER`, `IMAGE_HOST_PROVIDER` | `object_storage` |
| Render output host | `selectAssetHostProvider('render_output')` | `RENDER_OUTPUT_HOST_PROVIDER`, `ASSET_HOST_PROVIDER`, `IMAGE_HOST_PROVIDER` | `object_storage` |
| Render | `selectRenderProvider()` | `RENDER_PROVIDER` | configured and helper default is `remotion`; `local_ffmpeg` is rollback only |

Implemented providers found in helper scripts:

- Structured text: `openai`.
- Image generation: `openai`, `fal_ai` aliases.
- Scene video generation: Fal/Wan helper paths in `generate_and_rehost_scene_assets_v3.mjs` and `generate_and_rehost_scene_video.mjs`.
- TTS: `openai`, `fish_audio` aliases, `smallest_ai` aliases.
- Asset hosting: `object_storage`, `google_cloud_storage`; aliases map `gcs`/`google-cloud-storage` to `google_cloud_storage` and `minio`/`s3` to `object_storage`.
- Render: configured code-first default is `remotion`; `local_ffmpeg` remains fallback/rollback.
- Provider API keys now resolve by stage/component before falling back globally. Text stages use `*_OPENAI_API_KEY` then `TEXT_OPENAI_API_KEY` then `OPENAI_API_KEY`; image/video use component-specific OpenAI/Fal keys before global provider keys; narration uses `NARRATION_*_API_KEY` then `TTS_*_API_KEY` then provider-global keys.

## Do not change during later sessions without tests

- Status transition names; many workflows claim rows by exact status.
- `scripts.raw_response_json` shape; downstream queries read nested fields directly.
- Face-image rules for scene 1; validation and render title overlay depend on them.
- `render_manifest_json.manifest_version = 2`; render worker paths consume the manifest shape.
- Publish workflow gates; current workflows can publish live content when `INSTAGRAM_PUBLISH_ENABLED=true`.
- Provider selector env names; adapters and docs refer to them directly.
- The default story package stage; v2 is currently an explicit opt-in compatibility path.
- Director contract style pack IDs; they must stay aligned with `prompts/style_packs/style_pack_registry.json`.
- The Session 8 storyboard contract must stay prompt-free; Session 9 owns final visual prompt construction.
- The Session 9 visual prompt contract must stay provider-neutral and renderer-neutral until a later wiring session intentionally chooses integration boundaries.
- The Session 10 voice performance contract must preserve `clean_spoken_script`; provider-specific TTS tags belong in adapter mapping, not generic spoken text.
- The Session 11 music/SFX plan must keep track planning separate from final selection and must treat unknown license metadata as publish-blocking.
- The active avatar/presenter selector must keep avatar output as an asset route, require consent metadata, revalidate provider config before calls, and auto-downgrade to video when unsafe or unavailable.
- The Session 19 aggregate regression runner must stay offline and fixture-based; do not add provider calls, Docker dependencies, live publish steps, or paid API requirements to it.

## Uncertainties

- The active one-click path among `wf_end_to_end_reel_generate_and_publish*.json` and `run_resume_aware_reel_pipeline_v*.mjs` should be verified immediately before behavior changes.
- The exact claim status for `wf_asset_generation_v3.json` is validation-dependent and should be rechecked when editing validation or asset generation.
- `wf_asset_generation.json`, `wf_render_worker_dispatch.json`, and `wf_render_sync_completion.json` appear to be compatibility exports, but no authoritative deprecation marker was found.
- Some older docs still describe OpenAI-only generation; current scripts support more image, video, TTS, and host adapters.

## Validation for inventory changes

- Docs-only diff review.
- `jq empty docs/ai-context/context-manifest.json` when manifest links change.
- For Session 6/v2 wiring, run `node --check workflows/scripts/story_package_v2_compat.mjs` and build prompt requests locally; do not invoke live providers for fixture checks.
- For Session 7/director contract wiring, run `node scripts/validate_director_contract_fixture.mjs fixtures/ai-video/founder_explainer/expected_director_contract.json` and the matching `--expect-fail` invalid fixture.
- For Session 8/storyboard contract work, run `node scripts/validate_storyboard_fixture.mjs fixtures/ai-video/founder_explainer/expected_storyboard_and_shot_plan.json`.
- For Session 9/visual prompt contract work, run `node scripts/validate_visual_prompt_fixture.mjs fixtures/ai-video/founder_explainer/expected_visual_prompt_builder.json` and `node scripts/validate_visual_prompt_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_vague.json`.
- For Session 10/voice performance contract work, run `node scripts/validate_voice_performance_fixture.mjs fixtures/ai-video/founder_explainer/expected_voice_performance_script.json` and `node scripts/validate_voice_performance_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_voice_performance_script_mutated_text.json`.
- For Session 11/music-SFX contract work, run `node scripts/validate_music_sfx_fixture.mjs fixtures/ai-video/founder_explainer/expected_music_sfx_plan.json`, `node scripts/validate_music_sfx_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_music_sfx_plan_unknown_license.json`, and `node scripts/validate_music_library.mjs workflows/assets/music/library.json`.
- For Session 14/client-account context work, run `node scripts/validate_client_account_context_fixture.mjs fixtures/ai-video/founder_explainer/expected_client_account_context.json`, both invalid client-account fixtures with `--expect-fail`, and `node scripts/validate_publish_gate_workflow.mjs`.
- For Session 17/Remotion edit-plan contract work, run `node scripts/validate_remotion_edit_plan_fixture.mjs fixtures/ai-video/founder_explainer/expected_remotion_edit_plan.json`, both invalid Remotion edit-plan fixtures with `--expect-fail`, and `jq empty prompts/schemas/remotion_edit_plan.schema.json`.
- For Session 18/avatar presenter selector work, run the avatar decision fixtures, including active HeyGen, fallback video, missing-consent invalid, character-reference invalid, and `jq empty prompts/schemas/avatar_decision.schema.json prompts/schemas/presenter_profile.schema.json`.
- For Session 19/regression test work, run `node scripts/validate_ai_video_contract_regressions.mjs`.
- Do not run live provider, render, or publish commands for this inventory.
