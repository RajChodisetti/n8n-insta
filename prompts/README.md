# Prompt Templates

This folder stores the file-backed prompt assets used by the adapter-driven workflows and helper scripts.

Current prompt groups:

- `idea_ingest/`
- `director/`
- `research_and_script/`
- `storyboard_and_prompts/`
- `caption_and_hashtags/`
- `scene_asset_generation/`
- `narration_generation/`
- `post_image_generation/`
- `prompt_builder/` for the Studio UI prompt generator
- `rules/` for reusable global rule assets and stage routing metadata
- `style_packs/` for reusable creative style contracts and `style_pack_registry.json`
- `schemas/` for shared prompt contract schemas, including active `director_contract.schema.json` and contract assets such as `client_account_context.schema.json`, `model_route.schema.json`, `render_manifest_v2.schema.json`, `remotion_edit_plan.schema.json`, `avatar_decision.schema.json`, and `presenter_profile.schema.json`
- `workflow/` for workflow-level prompt contracts
- `examples/` for sanitized contract examples

How prompt loading works:

- text-generation workflows load `system.md`, `user.md`, and `response-schema.json` through [build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs)
- image and narration helpers load `prompt.md` or `instructions.md` through [prompt_utils.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/prompt_utils.mjs)
- the Studio UI prompt generator uses `prompt_builder/*` through [build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) and [invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)
- v1 abstract idea ingest now stores `creative_defaults` directly on the topic row; those defaults feed research/script, director_contract, storyboard, narration, images, and music without a separate prompt-profile call
- Docker mounts this folder into `n8n` at `/prompts`, and `PROMPTS_ROOT` can override that location if needed
- the runtime prompt-builder configuration is file-backed at `prompts/.runtime-prompt-builder.json`, so it can change live workflow prompt wording without editing the saved prompt templates
- legacy prompt-profile files remain for older flows, but the optimized v1 path uses `creative_defaults` from `idea_ingest`
- `rules/` is a reusable rule asset layer; active prompts use summaries where helper wiring supplies them
- `style_packs/` is a reusable creative asset layer; the active `director_contract` stage now selects registry IDs
- `workflow/director_contract*.md` is the active prompt path for the `director_contract` stage
- `workflow/storyboard_and_shot_plan.md` is a contract-only storyboard planning asset; the active `storyboard_and_prompts/` path still creates legacy `visual_prompt`, cover, subtitle metadata, and render seed fields
- `workflow/visual_prompt_builder.md` is a contract-only visual prompt builder asset; the active scene asset flow still consumes legacy `storyboard_json.visual_prompt` until a later wiring session
- `workflow/voice_performance_script.md` is a contract-only voice performance asset; the active narration flow still uses `narration_generation/instructions.md` and per-scene clean script text until a later wiring session
- `workflow/music_sfx_plan.md` is a contract-only music/SFX planning asset; the active render worker still selects from `workflows/assets/music/library.json`
- `workflow/final_qa_validator.md` is a contract-only final QA asset; the active publish workflows do not require this QA result until a later approval-gate wiring session
- `workflow/model_provider_router.md` is a contract-only provider routing planner; it does not change adapter selection behavior or call providers
- `workflow/render_manifest_v2.md` is a contract-only renderer-neutral manifest bridge; the active render manifest workflow and local FFmpeg worker are unchanged until a later wiring session
- `workflow/remotion_edit_plan.md` is a contract-only Remotion-compatible edit-plan asset; no Remotion dependency, app, Studio, or render command is added by this contract
- `workflow/avatar_video_selector.md` is a contract-only avatar/presenter selector asset; it keeps avatar output as an asset route, requires consent metadata, and does not generate avatar videos or call providers
- `workflow/story_package_generation_v2*.md` can be loaded only when `STORY_PACKAGE_GENERATION_STAGE=story_package_generation_v2` or `STORY_PACKAGE_STAGE=v2`; the default story package workflow still uses `story_package_generation/`

Editing rule:

- change the prompt files here, not the workflow JSON, for any supported model stage
- keep the existing `{{placeholder_name}}` tokens unless you also update the workflow code that supplies `prompt_template_data`
- rerun the workflow or smoke test after each prompt edit to validate the new output shape
- the Studio UI now shows only the active prompt files used by live workflows, so changing a visible prompt changes the real runtime behavior on the next run
- the Studio UI also shows per-placeholder help text and examples grouped by stage, so you can see what each `{{placeholder}}` means before editing it
- when editing `rules/rule_registry.json`, keep rule IDs unique and use only the severities `blocking`, `must`, `should`, and `preference`
- when editing `style_packs/style_pack_registry.json`, keep registry IDs aligned with Markdown filenames
- when editing `prompts/schemas/director_contract.schema.json`, update `scripts/validate_director_contract_fixture.mjs` only if the schema features used by fixtures change
- when editing `prompts/schemas/storyboard.schema.json`, update `scripts/validate_storyboard_fixture.mjs` only if the schema features used by fixtures change
- when editing `prompts/schemas/visual_prompt.schema.json`, update `scripts/validate_visual_prompt_fixture.mjs` only if the schema features or prompt-specific guardrails used by fixtures change
- when editing `prompts/schemas/voice_performance.schema.json`, update `scripts/validate_voice_performance_fixture.mjs` only if the schema features or clean-script guardrails used by fixtures change
- when editing `prompts/schemas/music_sfx_plan.schema.json`, update `scripts/validate_music_sfx_fixture.mjs` only if the schema features or publish-safety guardrails used by fixtures change
- when editing `prompts/schemas/music_asset.schema.json`, update `scripts/validate_music_library.mjs` and the music catalog together
- when editing `prompts/schemas/qa_result.schema.json`, update `scripts/validate_final_qa_fixture.mjs` only if the schema features or blocking-issue consistency rules used by fixtures change
- when editing `prompts/schemas/approval.schema.json`, update `scripts/validate_approval_fixture.mjs` and the publish gate workflow checks together
- when editing `prompts/schemas/client_account_context.schema.json`, update `scripts/validate_client_account_context_fixture.mjs`, the account context fixtures, and any Studio/workflow snapshot code together
- when editing `prompts/schemas/model_route.schema.json`, update `scripts/validate_model_route_fixture.mjs` and model route fixtures together; do not change adapter selection behavior unless a later implementation session explicitly approves it
- when editing `prompts/schemas/render_manifest_v2.schema.json`, update `scripts/validate_render_manifest_v2_fixture.mjs`, render manifest v2 fixtures, and FFmpeg compatibility notes together; do not replace the active renderer unless a later implementation session explicitly approves it
- when editing `prompts/schemas/remotion_edit_plan.schema.json`, update `scripts/validate_remotion_edit_plan_fixture.mjs`, Remotion edit-plan fixtures, and integration prerequisite notes together; do not install Remotion unless a later runtime session explicitly approves it
- when editing `prompts/schemas/avatar_decision.schema.json` or `prompts/schemas/presenter_profile.schema.json`, update `scripts/validate_avatar_decision_fixture.mjs` and avatar decision fixtures together; do not add avatar provider calls, accounts, API keys, or publish routes unless a later runtime session explicitly approves it
- after changing AI video prompt contracts, run `node scripts/validate_ai_video_contract_regressions.mjs` to cover the offline fixture regressions

Prompt model reference:

- [docs/prompts/prompt-reference-and-model-call-map.md](/Users/rajchodisetti/n8n-insta/docs/prompts/prompt-reference-and-model-call-map.md)
- [docs/runbooks/prompt-model-and-voice-tuning.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/prompt-model-and-voice-tuning.md)
- [docs/architecture/adapter-architecture-and-provider-switching.md](/Users/rajchodisetti/n8n-insta/docs/architecture/adapter-architecture-and-provider-switching.md)
