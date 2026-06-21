# AI Video Fixtures

These fixtures support Session 2 of the AI video workflow plan. They provide sanitized baseline inputs and representative structured outputs for future prompt, schema, validator, and workflow-contract work.

## How to use

- Read `docs/ai-context/ai-video-workflow-inventory.md` first.
- Use `input_payload.json` as the source content item and prompt template data.
- Use `expected_story_package_generation.json` as a contract-shaped example for the current `story_package_generation` response schema.
- Use `expected_director_contract.json` where present as a contract-shaped example for the upgraded `director_contract` schema.
- Use `invalid_director_contract_bad_style_pack.json` to verify registry-constrained style pack validation fails.
- Use `expected_storyboard_and_shot_plan.json` where present as a contract-shaped example for the Session 8 storyboard/shot-plan schema.
- Use `expected_visual_prompt_builder.json` where present as a contract-shaped example for the Session 9 visual prompt builder schema.
- Use `invalid_visual_prompt_builder_vague.json` and `invalid_visual_prompt_builder_missing_negative_prompt.json` to verify vague/generic prompts and missing negative prompts fail validation.
- Use `expected_voice_performance_script.json` where present as a contract-shaped example for the Session 10 voice performance schema.
- Use `invalid_voice_performance_script_mutated_text.json` to verify clean spoken script preservation fails when line text is changed.
- Use `expected_music_sfx_plan.json` where present as a contract-shaped example for the Session 11 music/SFX plan schema.
- Use `invalid_music_sfx_plan_unknown_license.json` to verify unknown license metadata blocks validation.
- Use `expected_final_qa_result_pass.json` where present as a contract-shaped example for the Session 12 final QA schema.
- Use `failed_final_qa_license.json`, `failed_final_qa_avatar_consent.json`, and `failed_final_qa_caption_export.json` to verify final QA can express publish-blocking failures with upstream fix stages.
- Use `expected_publish_approval_reel.json` where present as a contract-shaped example for the Session 13 selected-render approval schema.
- Use `invalid_publish_approval_missing_selected_video.json`, `invalid_publish_approval_account_mismatch.json`, and `invalid_publish_approval_unapproved_render.json` to verify approval records fail closed.
- Use `expected_client_account_context.json` where present as a contract-shaped example for the Session 14 per-account policy snapshot.
- Use `invalid_client_account_context_safety_override.json` and `invalid_client_account_context_style_conflict.json` to verify account policies cannot override global safety or contradict style-pack allow/block lists.
- Use `expected_model_provider_route.json` where present as a contract-shaped example for the Session 15 provider-router plan.
- Use `invalid_model_provider_route_runtime_change.json` and `invalid_model_provider_route_boundary_mismatch.json` to verify router output stays planning-only and keeps providers inside implemented boundaries.
- Use `expected_render_manifest_v2.json` where present as a contract-shaped example for the Session 16 renderer-neutral render manifest bridge.
- Use `invalid_render_manifest_v2_renderer_replacement.json` and `invalid_render_manifest_v2_timeline_gap.json` to verify the render bridge does not replace the current renderer and keeps scene timing contiguous.
- Use `expected_remotion_edit_plan.json` where present as a contract-shaped example for the Session 17 Remotion-compatible edit-plan contract.
- Use `invalid_remotion_edit_plan_runtime_install.json` and `invalid_remotion_edit_plan_frame_gap.json` to verify the edit plan stays contract-only and frame timing stays contiguous.
- Use `expected_avatar_decision.json` where present as a contract-shaped example for the Session 18 avatar/presenter selector contract.
- Use `invalid_avatar_decision_missing_consent.json` to verify avatar routes fail closed when consent metadata is missing.
- Treat outputs as hand-authored examples, not provider-generated goldens.

## Scenarios

| Scenario | Purpose |
|---|---|
| `founder_explainer` | Founder-led explainer with credible, reflective narration. |
| `fast_reel_hook` | Short high-retention Reel with fast hook pacing. |
| `product_demo` | Product walkthrough with clear feature beats. |
| `local_business_promo` | Local service promo with community tone. |
| `avatar_sales_outreach` | Consent-aware avatar sales outreach candidate. |

## Validation

```bash
find fixtures/ai-video -type f
find fixtures/ai-video -name '*.json' -print0 | xargs -0 -n1 jq empty
node scripts/validate_ai_video_contract_regressions.mjs
node scripts/validate_director_contract_fixture.mjs fixtures/ai-video/founder_explainer/expected_director_contract.json
node scripts/validate_director_contract_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_director_contract_bad_style_pack.json
node scripts/validate_storyboard_fixture.mjs fixtures/ai-video/founder_explainer/expected_storyboard_and_shot_plan.json
node scripts/validate_visual_prompt_fixture.mjs fixtures/ai-video/founder_explainer/expected_visual_prompt_builder.json
node scripts/validate_visual_prompt_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_vague.json
node scripts/validate_visual_prompt_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_missing_negative_prompt.json
node scripts/validate_voice_performance_fixture.mjs fixtures/ai-video/founder_explainer/expected_voice_performance_script.json
node scripts/validate_voice_performance_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_voice_performance_script_mutated_text.json
node scripts/validate_music_sfx_fixture.mjs fixtures/ai-video/founder_explainer/expected_music_sfx_plan.json
node scripts/validate_music_sfx_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_music_sfx_plan_unknown_license.json
node scripts/validate_final_qa_fixture.mjs --expect-approved fixtures/ai-video/founder_explainer/expected_final_qa_result_pass.json
node scripts/validate_final_qa_fixture.mjs --expect-blocked fixtures/ai-video/founder_explainer/failed_final_qa_license.json
node scripts/validate_final_qa_fixture.mjs --expect-blocked fixtures/ai-video/founder_explainer/failed_final_qa_avatar_consent.json
node scripts/validate_final_qa_fixture.mjs --expect-blocked fixtures/ai-video/founder_explainer/failed_final_qa_caption_export.json
node scripts/validate_approval_fixture.mjs --expected-platform-account-id 17841400000000000 fixtures/ai-video/founder_explainer/expected_publish_approval_reel.json
node scripts/validate_approval_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_publish_approval_missing_selected_video.json
node scripts/validate_approval_fixture.mjs --expect-fail --expected-platform-account-id 17841400000000000 fixtures/ai-video/founder_explainer/invalid_publish_approval_account_mismatch.json
node scripts/validate_approval_fixture.mjs --expect-fail --expect-publish-ready fixtures/ai-video/founder_explainer/invalid_publish_approval_unapproved_render.json
node scripts/validate_client_account_context_fixture.mjs fixtures/ai-video/founder_explainer/expected_client_account_context.json
node scripts/validate_client_account_context_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_client_account_context_safety_override.json
node scripts/validate_client_account_context_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_client_account_context_style_conflict.json
node scripts/validate_model_route_fixture.mjs fixtures/ai-video/founder_explainer/expected_model_provider_route.json
node scripts/validate_model_route_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_model_provider_route_runtime_change.json
node scripts/validate_model_route_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_model_provider_route_boundary_mismatch.json
node scripts/validate_render_manifest_v2_fixture.mjs fixtures/ai-video/founder_explainer/expected_render_manifest_v2.json
node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_renderer_replacement.json
node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_timeline_gap.json
node scripts/validate_remotion_edit_plan_fixture.mjs fixtures/ai-video/founder_explainer/expected_remotion_edit_plan.json
node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_runtime_install.json
node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_frame_gap.json
node scripts/validate_avatar_decision_fixture.mjs fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision.json
node scripts/validate_avatar_decision_fixture.mjs --expect-fail fixtures/ai-video/avatar_sales_outreach/invalid_avatar_decision_missing_consent.json
rg -n "(sk-[A-Za-z0-9]|ghp[_]|AIz[a]|BEGI[N] .*PRIVAT[E] KEY|xox[baprs]-|[A-Z0-9_]*(TOKE[N]|SECRE[T]|API[_]KEY))" fixtures/ai-video
```

The `rg` command should return no matches.

## Rules

- Do not include real customer data, credentials, local env values, or service account material.
- Do not call paid providers to refresh these files.
- Update fixtures only when the contract intentionally changes.
- Keep scenario folders small enough for future agents to read one at a time.
