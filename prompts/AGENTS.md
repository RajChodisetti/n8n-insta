# prompts Context

## Purpose

This folder stores file-backed prompt templates, response schemas, and prompt-builder assets used by n8n workflows and the Studio UI.

## When to read this

Read this before prompt wording, response schema, placeholder, model-output, narrative style, image prompt, caption, storyboard, narration, or prompt-builder changes.

## Important files and subfolders

- `README.md`: current prompt loading model and editing rules.
- `docs/prompts/runtime-prompt-orchestration-strategy.md`: immutable, partial, and fully runtime-built prompt layers plus short-form quality strategy.
- `idea_ingest/`, `story_package_generation/`, `director/`, `research_and_script/`, `storyboard_and_prompts/`, `caption_and_hashtags/`: structured text stages.
- `scene_asset_generation/prompt.md`: scene image/video asset prompt source.
- `narration_generation/instructions.md`: TTS instruction source.
- `post_image_generation/prompt.md`: simple post image prompt source.
- `prompt_builder/`: Studio UI prompt rewrite/generation stage.
- `rules/`: reusable rule files plus `rule_registry.json`; contract assets only until a later wiring session loads them.
- `style_packs/`: reusable creative style contracts plus `style_pack_registry.json`; director contract now selects registry IDs.
- `schemas/`: shared schemas for prompt contracts, including active `director_contract.schema.json`, visual prompt, voice performance, avatar decision, final QA, performance guidance, and contract-only storyboard, music/SFX, approval, client/account context, model route, render manifest v2, Remotion edit-plan, and presenter profile schemas.
- `workflow/`: workflow-level prompt contracts; `director_contract`, `visual_prompt_builder`, `voice_performance_script`, `avatar_video_selector`, `final_qa_validator`, and `performance_feedback_analysis` are active in code-first paths, `storyboard_and_shot_plan`, `music_sfx_plan`, `model_provider_router`, `render_manifest_v2`, and `remotion_edit_plan` are contract-only, and `story_package_generation_v2` is opt-in only through stage selection env.
- `examples/`: sanitized example outputs for contract and schema work.
- `caption_and_hashtags/caption_first_pass/`, `caption_final_pass/`, `hashtag_ranking/`: older/legacy caption subpass assets still present in the repo.

## Inputs

Prompt rendering consumes workflow payloads, DB-derived fields, `.env` defaults, `creative_defaults`, and `prompt_template_data`.

## Outputs

Rendered prompts and JSON schemas consumed by text, image, narration, and prompt-builder helpers.

## Depends on

- `workflows/scripts/build_prompt_request.mjs`
- `workflows/scripts/prompt_utils.mjs`
- `workflows/scripts/prompt_stage_defaults.mjs`
- `workflows/scripts/prompt_hard_rules.mjs`
- `workflows/scripts/invoke_structured_text_adapter.mjs`

## Used by

n8n workflows in `workflows/n8n/`, helper scripts in `workflows/scripts/`, and prompt editing/preview flows in `studio-ui/`.

## Common change patterns

- Change wording, tone, examples, or constraints inside an existing prompt file.
- Adjust a response schema only when downstream workflow persistence expects the new shape.
- Add a placeholder only with matching changes to the workflow/helper code that supplies it.
- Add or adjust reusable rules in `rules/` before duplicating the same policy across multiple prompts.
- Add or adjust reusable style guidance in `style_packs/` before hardcoding style taste in a stage prompt.
- Keep `workflow/` contracts and `examples/` schema-shaped; verify helper wiring before assuming a workflow contract is active.
- Validate with the smoke test for the affected stage.

## Do not do

- Do not remove, rename, or add `{{placeholder}}` tokens casually.
- Do not put secrets, API keys, or private URLs in prompt files.
- Do not edit workflow JSON for prompt wording when the prompt stage is already file-backed.
- Do not treat runtime prompt-builder rewrites as permission to alter schemas, placeholders, safety rules, approval gates, provider routing, or publish behavior.
- Do not use prompt-profile or `creative_defaults` guidance to invent facts or bypass global rules.
- Do not assume legacy caption subpass files are active without checking workflow wiring.
- Do not make style preferences blocking in `rules/rule_registry.json`.
- Do not add style pack IDs that are not present in `style_packs/style_pack_registry.json`.
- Do not treat `workflow/` contracts as default runtime prompt files unless helper code and env selection make them active.
- Do not add final image/video prompt fields to `storyboard_and_shot_plan`; Session 9 owns final visual prompt construction.
- Do not make `visual_prompt_builder` choose final providers, models, render engines, hosts, buckets, publish settings, or critical readable text rendered by image/video models.
- Do not let `voice_performance_script` change `clean_spoken_script` or embed provider-specific emotion/control tags in spoken text.
- Do not let `music_sfx_plan` treat unknown-license music/SFX as publishable or choose final providers, storage, render, or publish settings.
- Do not treat `final_qa_validator` as an active publish gate until workflow wiring is added in a dedicated approval/publish session.
- Do not bypass `publish_approvals` for Reel publish. Selected-render approval must include QA pass, `selected_video_id`, `approval_status: approved`, `approved_by`, `approved_at`, and matching Instagram account.
- Do not put client-specific preferences into global rule files. Use `client_account_context.schema.json` snapshots for account-level brand, style, voice, music, avatar, and publishing policy, and keep global safety/legal/platform rules higher priority.
- Do not treat `model_provider_router` as active adapter selection. It is a planning contract only until a later session explicitly changes `adapter_config.mjs` or workflow helper behavior.
- Do not treat `render_manifest_v2` as active render workflow wiring. It is a renderer-neutral bridge contract only until a later session explicitly changes render manifest construction or dispatch.
- Do not treat `remotion_edit_plan` as a Remotion runtime. It is a data contract only until a later session adds dependencies, components, and runtime wiring.
- Do not let `avatar_video_selector` rewrite spoken narration or bypass fallback, final QA, or Studio approval. It is now an active route decision stage, but avatar provider calls still require runtime consent/config revalidation.

## Validation

- Aggregate contract regression suite: `node scripts/validate_ai_video_contract_regressions.mjs`
- Research/storyboard: `bash scripts/test_phase2_topic_to_storyboard_smoke.sh`
- Caption/hashtags: `bash scripts/test_phase2_caption_iteration_smoke.sh`
- Scene assets: `bash scripts/test_phase3_scene_asset_generation_smoke.sh`
- Narration: `bash scripts/test_phase3_narration_generation_smoke.sh`
- Visual prompt contract: `node scripts/validate_visual_prompt_fixture.mjs fixtures/ai-video/founder_explainer/expected_visual_prompt_builder.json`
- Voice performance contract: `node scripts/validate_voice_performance_fixture.mjs fixtures/ai-video/founder_explainer/expected_voice_performance_script.json`
- Music/SFX contract: `node scripts/validate_music_sfx_fixture.mjs fixtures/ai-video/founder_explainer/expected_music_sfx_plan.json`
- Final QA contract: `node scripts/validate_final_qa_fixture.mjs fixtures/ai-video/founder_explainer/expected_final_qa_result_pass.json`
- Approval contract: `node scripts/validate_approval_fixture.mjs --expected-platform-account-id 17841400000000000 fixtures/ai-video/founder_explainer/expected_publish_approval_reel.json`
- Client/account context contract: `node scripts/validate_client_account_context_fixture.mjs fixtures/ai-video/founder_explainer/expected_client_account_context.json`
- Model provider router contract: `node scripts/validate_model_route_fixture.mjs fixtures/ai-video/founder_explainer/expected_model_provider_route.json`
- Render manifest v2 contract: `node scripts/validate_render_manifest_v2_fixture.mjs fixtures/ai-video/founder_explainer/expected_render_manifest_v2.json`
- Remotion edit-plan contract: `node scripts/validate_remotion_edit_plan_fixture.mjs fixtures/ai-video/founder_explainer/expected_remotion_edit_plan.json`
- Avatar presenter selector contract: `node scripts/validate_avatar_decision_fixture.mjs fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision.json`

## Gotchas

- Prompt files are static in git but rendered dynamically at runtime.
- Prompt edits are hot-loaded on the next workflow run.
- `.env` default changes require container recreation, but prompt-file changes do not.
- The Studio UI may write runtime prompt-builder config under `prompts/.runtime-prompt-builder.json` when used.
- Runtime prompt-builder excludes `prompt_builder`, `idea_ingest`, and `idea_prompt_profile`; selected prompt drafts must preserve placeholders and hard rules.

## Uncertainties

- Some prompt groups appear newer than the committed runbooks. Confirm active workflow wiring before deleting or renaming any group.

## Last reviewed

2026-06-21, git commit `0d0515b`.
