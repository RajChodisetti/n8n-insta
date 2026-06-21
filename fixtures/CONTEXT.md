# fixtures Context

## Purpose

This folder contains sanitized, static fixtures for prompt and workflow contract work.

## When to read this

Read this before creating, editing, or validating baseline fixtures for AI video sessions.

## Important files and subfolders

- `ai-video/README.md`: explains how to use the AI video fixtures.
- `ai-video/*/input_payload.json`: sanitized source payloads.
- `ai-video/*/expected_story_package_generation.json`: representative `story_package_generation` outputs shaped like the current response schema.
- `ai-video/*/expected_director_contract.json`: representative upgraded `director_contract` outputs where present.
- `ai-video/*/invalid_director_contract_*.json`: intentionally invalid negative fixtures where present.
- `ai-video/*/expected_storyboard_and_shot_plan.json`: representative Session 8 storyboard/shot-plan outputs where present.
- `ai-video/*/expected_visual_prompt_builder.json`: representative Session 9 visual prompt builder outputs where present.
- `ai-video/*/invalid_visual_prompt_builder_*.json`: intentionally invalid visual prompt fixtures where present.
- `ai-video/*/expected_voice_performance_script.json`: representative Session 10 voice performance outputs where present.
- `ai-video/*/invalid_voice_performance_script_*.json`: intentionally invalid voice performance fixtures where present.
- `ai-video/*/expected_music_sfx_plan.json`: representative Session 11 music/SFX plan outputs where present.
- `ai-video/*/invalid_music_sfx_plan_*.json`: intentionally invalid music/SFX fixtures where present.
- `ai-video/*/expected_final_qa_result_pass.json`: representative Session 12 approved final QA output where present.
- `ai-video/*/failed_final_qa_*.json`: representative Session 12 blocked final QA outputs where present.
- `ai-video/*/expected_publish_approval_reel.json`: representative Session 13 selected-render approval record where present.
- `ai-video/*/invalid_publish_approval_*.json`: intentionally invalid Session 13 approval records where present.
- `ai-video/*/expected_client_account_context.json`: representative Session 14 account context snapshot where present.
- `ai-video/*/invalid_client_account_context_*.json`: intentionally invalid Session 14 account policy records where present.
- `ai-video/*/expected_model_provider_route.json`: representative Session 15 planning-only provider route where present.
- `ai-video/*/invalid_model_provider_route_*.json`: intentionally invalid Session 15 provider route records where present.
- `ai-video/*/expected_render_manifest_v2.json`: representative Session 16 renderer-neutral render manifest bridge where present.
- `ai-video/*/invalid_render_manifest_v2_*.json`: intentionally invalid Session 16 render manifest records where present.
- `ai-video/*/expected_remotion_edit_plan.json`: representative Session 17 Remotion-compatible edit-plan contract where present.
- `ai-video/*/invalid_remotion_edit_plan_*.json`: intentionally invalid Session 17 edit-plan records where present.
- `ai-video/*/expected_avatar_decision.json`: representative Session 18 avatar/presenter selector decision where present.
- `ai-video/*/invalid_avatar_decision_*.json`: intentionally invalid Session 18 avatar decision records where present.

## Inputs

Fixture data is hand-authored from sanitized fictional or generic scenarios. It should not come from live customer data, real credentials, provider responses, or private local state.

## Outputs

Parseable JSON examples for future prompt/schema regression checks.

## Depends on

- `prompts/story_package_generation/response-schema.json`
- `prompts/schemas/director_contract.schema.json`
- `prompts/schemas/storyboard.schema.json`
- `prompts/schemas/visual_prompt.schema.json`
- `prompts/schemas/voice_performance.schema.json`
- `prompts/schemas/music_sfx_plan.schema.json`
- `prompts/schemas/qa_result.schema.json`
- `prompts/schemas/approval.schema.json`
- `prompts/schemas/client_account_context.schema.json`
- `prompts/schemas/model_route.schema.json`
- `prompts/schemas/render_manifest_v2.schema.json`
- `prompts/schemas/remotion_edit_plan.schema.json`
- `prompts/schemas/avatar_decision.schema.json`
- `prompts/schemas/presenter_profile.schema.json`
- `docs/ai-context/ai-video-workflow-inventory.md`

## Used by

Future roadmap sessions that compare prompt contracts, create validators, add tests, or build prompt fixture harnesses.

## Common change patterns

- Add a scenario folder with one input payload and one expected stage output.
- Update fixtures when prompt response schemas intentionally change.
- Keep scenario text short and clearly synthetic.

## Do not do

- Do not include secrets, tokens, env values, service account data, or private customer content.
- Do not call providers just to refresh fixtures.
- Do not treat fixture wording as production prompt wording.

## Validation

- `find fixtures/ai-video -type f`
- `find fixtures/ai-video -name '*.json' -print0 | xargs -0 -n1 jq empty`
- `node scripts/validate_director_contract_fixture.mjs fixtures/ai-video/founder_explainer/expected_director_contract.json`
- `node scripts/validate_director_contract_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_director_contract_bad_style_pack.json`
- `node scripts/validate_storyboard_fixture.mjs fixtures/ai-video/founder_explainer/expected_storyboard_and_shot_plan.json`
- `node scripts/validate_visual_prompt_fixture.mjs fixtures/ai-video/founder_explainer/expected_visual_prompt_builder.json`
- `node scripts/validate_visual_prompt_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_vague.json`
- `node scripts/validate_visual_prompt_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_missing_negative_prompt.json`
- `node scripts/validate_voice_performance_fixture.mjs fixtures/ai-video/founder_explainer/expected_voice_performance_script.json`
- `node scripts/validate_voice_performance_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_voice_performance_script_mutated_text.json`
- `node scripts/validate_music_sfx_fixture.mjs fixtures/ai-video/founder_explainer/expected_music_sfx_plan.json`
- `node scripts/validate_music_sfx_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_music_sfx_plan_unknown_license.json`
- `node scripts/validate_final_qa_fixture.mjs --expect-approved fixtures/ai-video/founder_explainer/expected_final_qa_result_pass.json`
- `node scripts/validate_final_qa_fixture.mjs --expect-blocked fixtures/ai-video/founder_explainer/failed_final_qa_license.json`
- `node scripts/validate_final_qa_fixture.mjs --expect-blocked fixtures/ai-video/founder_explainer/failed_final_qa_avatar_consent.json`
- `node scripts/validate_final_qa_fixture.mjs --expect-blocked fixtures/ai-video/founder_explainer/failed_final_qa_caption_export.json`
- `node scripts/validate_approval_fixture.mjs --expected-platform-account-id 17841400000000000 fixtures/ai-video/founder_explainer/expected_publish_approval_reel.json`
- `node scripts/validate_approval_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_publish_approval_missing_selected_video.json`
- `node scripts/validate_approval_fixture.mjs --expect-fail --expected-platform-account-id 17841400000000000 fixtures/ai-video/founder_explainer/invalid_publish_approval_account_mismatch.json`
- `node scripts/validate_approval_fixture.mjs --expect-fail --expect-publish-ready fixtures/ai-video/founder_explainer/invalid_publish_approval_unapproved_render.json`
- `node scripts/validate_client_account_context_fixture.mjs fixtures/ai-video/founder_explainer/expected_client_account_context.json`
- `node scripts/validate_client_account_context_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_client_account_context_safety_override.json`
- `node scripts/validate_client_account_context_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_client_account_context_style_conflict.json`
- `node scripts/validate_model_route_fixture.mjs fixtures/ai-video/founder_explainer/expected_model_provider_route.json`
- `node scripts/validate_model_route_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_model_provider_route_runtime_change.json`
- `node scripts/validate_model_route_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_model_provider_route_boundary_mismatch.json`
- `node scripts/validate_render_manifest_v2_fixture.mjs fixtures/ai-video/founder_explainer/expected_render_manifest_v2.json`
- `node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_renderer_replacement.json`
- `node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_timeline_gap.json`
- `node scripts/validate_remotion_edit_plan_fixture.mjs fixtures/ai-video/founder_explainer/expected_remotion_edit_plan.json`
- `node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_runtime_install.json`
- `node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_frame_gap.json`
- `node scripts/validate_avatar_decision_fixture.mjs fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision.json`
- `node scripts/validate_avatar_decision_fixture.mjs --expect-fail fixtures/ai-video/avatar_sales_outreach/invalid_avatar_decision_missing_consent.json`
- `node scripts/validate_ai_video_contract_regressions.mjs`
- Secret-pattern scan over `fixtures/ai-video`.

## Gotchas

- Expected outputs are representative contract examples, not model quality benchmarks.
- Fixture outputs should remain schema-shaped so they can later become automated regression inputs.
- Model provider route fixtures are planning records only; they must not imply `.env`, adapter, provider, render, approval, or publish behavior changed.
- Render manifest v2 fixtures are bridge-contract examples only; they must not imply active n8n render manifest construction, dispatch, or local FFmpeg worker behavior changed.
- Remotion edit-plan fixtures are data contracts only; they must not imply Remotion is installed, wired, or replacing FFmpeg.
- Avatar decision fixtures are consent-gated planning records only; they must not imply avatar videos, provider accounts, provider calls, or publish approval.

## Uncertainties

- Fixture validation is still narrow; upgraded director, storyboard, visual prompt, voice performance, music/SFX, final QA, approval, client/account context, model provider router, render manifest v2, Remotion edit-plan, and avatar decision contracts have local no-dependency validators.

## Last reviewed

2026-06-21, git commit `d1e1bd0`.
