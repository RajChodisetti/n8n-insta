# AI Video Workflow Session Implementation Plan

Last reviewed: 2026-06-21
Source plan: docs/roadmaps/ai-video-workflow-session-plan.md

This is the canonical implementation plan for moving the repo from loose creative prompts to a contract-based AI video production pipeline. It replaces the long architecture plan as the day-to-day execution guide.

Use this plan one session at a time. Each session should have a narrow scope, a commit, and a short handoff note before moving on.

## Operating Rules

- Work in small validated slices.
- Do not add paid provider integrations until the contract layer is stable.
- Do not call paid external APIs in tests.
- Do not publish anything automatically.
- Do not replace the current FFmpeg renderer until Remotion parity is proven.
- Do not hardcode client or brand taste globally.
- Do not use avatar or presenter routes without consent metadata.
- Keep old prompts/workflows in place until compatibility is proven.
- Prefer schemas, fixtures, adapters, and validation gates before new provider behavior.
- Update this file after every session with status, commit, and remaining risks.

## Context Control Protocol

At the start of each session, read only:

1. `AGENTS.md`
2. `docs/ai-context/README.md`
3. `docs/ai-context/task-routing.md`
4. This file
5. The nearest folder `AGENTS.md` or `CONTEXT.md` for touched areas
6. The specific files listed in that session

Do not reload the whole repo unless the session requires inventory. If uncertainty appears, record it in the session handoff instead of guessing.

## Completion Definition

The full initiative is complete when:

- Existing fixtures still complete the workflow.
- `story_package_generation_v2` can replace `research_and_script`.
- Director always selects a valid style pack.
- Storyboard planning is separate from visual prompt generation.
- Voice output preserves clean script and line-level performance metadata.
- Music/SFX license uncertainty blocks publish.
- Final QA blocks unsafe or incomplete packages.
- Publish executor cannot post without approved selected video.
- Client/account profile drives brand, style, avatar, music, and posting behavior.
- `render_manifest_v2` can map to the current FFmpeg renderer.
- Remotion edit plans can be generated without replacing FFmpeg yet.
- Avatar route is optional and consent-gated.
- Model/provider router can output candidates without changing creative direction.
- Prompt outputs validate against schemas.
- Fixtures catch regressions.

## Session Map

| Session | Scope | Expected Size | Behavior Change |
|---|---|---:|---|
| 0 | Adopt this plan and baseline repo state | Small | No |
| 1 | Inventory current workflow contracts | Medium | No |
| 2 | Create baseline fixtures | Medium | No |
| 3 | Add rule registry | Medium | No |
| 4 | Add style pack registry | Medium | No or minimal |
| 5 | Add `story_package_generation_v2` contract | Medium | No |
| 6 | Wire `story_package_generation_v2` compatibility | Large | Controlled |
| 7 | Upgrade director contract | Medium | Controlled |
| 8 | Split storyboard contract | Medium | Controlled |
| 9 | Add visual prompt builder contract | Medium | Controlled |
| 10 | Add voice performance script | Medium | Controlled |
| 11 | Add music/SFX plan and license metadata | Medium | Controlled |
| 12 | Add final QA validator | Medium | Controlled |
| 13 | Add approval gate | Large | Yes, publish-blocking |
| 14 | Add client/account context | Large | Controlled |
| 15 | Add model/provider router contract | Medium | No or controlled |
| 16 | Add `render_manifest_v2` bridge | Large | Controlled |
| 17 | Add Remotion edit-plan contract | Medium | No renderer replacement |
| 18 | Add avatar/presenter selector | Medium | No provider call |
| 19 | Add automated evaluation tests | Large | No product behavior |
| 20 | Stabilize, document, and push | Medium | No new behavior |

## Session 0 - Plan Adoption and Safety Baseline

Goal: Make this plan the active implementation guide and confirm the repo is safe to work on.

Read first:

- `AGENTS.md`
- `docs/ai-context/README.md`
- `docs/ai-context/task-routing.md`
- `docs/roadmaps/ai-video-workflow-session-plan.md`
- `docs/roadmaps/ai-video-workflow-session-plan.md`

Tasks:

- Decide whether to keep, archive, or delete `docs/roadmaps/ai-video-workflow-session-plan.md`.
- Add this session plan to git.
- Confirm current branch and remote.
- Confirm local-only secret/runtime files remain untracked.
- Create or update a progress section at the bottom of this file.

Likely files:

- `docs/roadmaps/ai-video-workflow-session-plan.md`
- optionally `docs/roadmaps/ai-video-workflow-session-plan.md`

Validation:

- `git status --short --branch`
- `git diff --check`

Exit criteria:

- This plan is tracked or intentionally left untracked by user decision.
- No secrets, logs, caches, or env backups are staged.
- Next session has a clear starting point.

Do not do:

- Do not edit prompts or workflow behavior.
- Do not delete the old plan unless explicitly approved.

## Session 1 - Workflow Contract Inventory

Goal: Document current prompt stages, workflow data flow, render manifest shape, publish trigger shape, and provider boundaries before changing behavior.

Read first:

- `docs/ai-context/repo-map.md`
- `docs/ai-context/architecture-summary.md`
- `prompts/AGENTS.md`
- `workflows/AGENTS.md`

Tasks:

- List all prompt stages currently supported by `workflows/scripts/build_prompt_request.mjs`.
- List all n8n workflow exports and their likely stage responsibilities.
- Identify where `research_and_script` outputs are consumed.
- Identify where `story_package_generation` outputs are consumed.
- Identify where render manifests are built and consumed.
- Identify where publish workflows enforce or skip approval.
- Identify current provider selectors and environment variables.
- Save findings in a short inventory doc.

Likely files:

- `docs/ai-context/current-focus.md`
- `docs/ai-context/architecture-summary.md`
- new optional `docs/ai-context/ai-video-workflow-inventory.md`

Validation:

- Docs-only diff review
- `jq empty docs/ai-context/context-manifest.json` if manifest is edited

Exit criteria:

- Current workflow assumptions are documented.
- Unknowns are marked as unknown.
- No runtime behavior changed.

Do not do:

- Do not refactor prompts.
- Do not alter n8n workflow JSON.

## Session 2 - Baseline Fixtures

Goal: Capture stable sample inputs and expected structured outputs so future prompt changes can be compared.

Read first:

- Session 1 inventory
- `scripts/CONTEXT.md`
- `delivery-testing/CONTEXT.md`

Tasks:

- Create fixture folders for:
  - founder explainer
  - fast reel hook
  - product demo walkthrough
  - local business promo
  - avatar sales outreach candidate
- Store input payloads and representative expected outputs.
- Prefer sanitized local fixtures; do not include real secrets or private client data.
- Add a fixture README explaining how fixtures should be used.

Likely files:

- `fixtures/ai-video/founder_explainer/`
- `fixtures/ai-video/fast_reel_hook/`
- `fixtures/ai-video/product_demo/`
- `fixtures/ai-video/local_business_promo/`
- `fixtures/ai-video/avatar_sales_outreach/`
- `fixtures/ai-video/README.md`

Validation:

- `find fixtures/ai-video -type f`
- JSON fixtures: `find fixtures/ai-video -name '*.json' -print0 | xargs -0 -n1 jq empty`
- Secret scan over fixtures

Exit criteria:

- Fixtures exist and are parseable.
- Fixtures do not contain secrets or private tokens.
- Existing runtime behavior is unchanged.

Do not do:

- Do not call providers to create new fixture outputs.
- Do not include live customer data unless sanitized.

## Session 3 - Rule Registry

Goal: Add reusable rule files with severity levels and stage routing.

Read first:

- `prompts/AGENTS.md`
- `docs/roadmaps/ai-video-workflow-session-plan.md` section 5
- Existing prompt files that already contain hard rules

Tasks:

- Create `prompts/rules/rule_registry.json`.
- Create global rules files:
  - `brand_safety_rules.md`
  - `visual_consistency_rules.md`
  - `voice_rules.md`
  - `music_sfx_rules.md`
  - `avatar_rules.md`
  - `editing_rules.md`
  - `provider_routing_rules.md`
  - `platform_publishing_rules.md`
  - `approval_rules.md`
- Assign each rule a severity: `blocking`, `must`, `should`, or `preference`.
- Map rules to stages that should load them.

Likely files:

- `prompts/rules/*.md`
- `prompts/rules/rule_registry.json`
- `prompts/README.md`
- `prompts/AGENTS.md`

Validation:

- `jq empty prompts/rules/rule_registry.json`
- Check rule IDs are unique.
- Docs/prompt review for duplicated or conflicting rules.

Exit criteria:

- Rules exist as reusable prompt assets.
- Blocking rules are explicit.
- Client-specific taste is not encoded globally.

Do not do:

- Do not paste every rule into every prompt.
- Do not make preferences blocking.

## Session 4 - Style Pack Registry

Goal: Add a structured style pack system the director can select from.

Read first:

- `prompts/AGENTS.md`
- `docs/roadmaps/ai-video-workflow-session-plan.md` section 7
- Existing `prompts/director/*`

Tasks:

- Create `prompts/style_packs/style_pack_registry.json`.
- Create one Markdown file per style pack:
  - `founder_explainer`
  - `cinematic_problem_solution`
  - `fast_reel_hook`
  - `product_demo_walkthrough`
  - `before_after_transformation`
  - `client_testimonial_case_study`
  - `educational_mini_lesson`
  - `meme_relatable_pain_point`
  - `premium_brand_film`
  - `local_business_promo`
  - `avatar_sales_outreach`
  - `ugc_style_product_pitch`
- Include best use, poor use, pacing, visuals, captions, transitions, music, SFX, voice, avatar policy, template needs, and negative rules.
- Add a schema if useful: `prompts/schemas/style_pack.schema.json`.

Likely files:

- `prompts/style_packs/*`
- `prompts/schemas/style_pack.schema.json`
- `prompts/README.md`

Validation:

- `jq empty prompts/style_packs/style_pack_registry.json`
- `jq empty prompts/schemas/style_pack.schema.json`
- Verify registry IDs match file names.

Exit criteria:

- All 12 style packs exist.
- Registry is machine-readable.
- Director can be constrained to valid style pack IDs in later sessions.

Do not do:

- Do not wire director behavior yet unless the change is schema-only and low risk.

## Session 5 - `story_package_generation_v2` Contract

Goal: Add the new story package prompt and schema without changing downstream runtime behavior.

Read first:

- `prompts/story_package_generation/*`
- `prompts/research_and_script/*`
- `workflows/scripts/build_prompt_request.mjs`
- `workflows/scripts/prompt_stage_defaults.mjs`

Tasks:

- Create `prompts/workflow/story_package_generation_v2.md`.
- Create `prompts/schemas/story_package.schema.json`.
- Define output fields:
  - `research_brief`
  - `claim_registry`
  - `narrative_strategy`
  - `clean_script`
  - `caption_seed`
  - `downstream_constraints`
  - `risk_flags`
- Add examples from fixtures if helpful.
- Keep old `research_and_script` in place.

Likely files:

- `prompts/workflow/story_package_generation_v2.md`
- `prompts/schemas/story_package.schema.json`
- `prompts/examples/*.json`

Validation:

- `jq empty prompts/schemas/story_package.schema.json`
- Fixture examples validate against schema if examples are added.

Exit criteria:

- Contract exists and is clear.
- No workflow behavior changed.

Do not do:

- Do not remove `research_and_script`.
- Do not add render, music track, provider, or avatar generation instructions.

## Session 6 - `story_package_generation_v2` Compatibility Wiring

Goal: Make the new story package usable while preserving existing downstream expectations.

Read first:

- Session 5 contract
- `workflows/scripts/build_prompt_request.mjs`
- `workflows/scripts/prompt_stage_defaults.mjs`
- `workflows/scripts/run_story_package_generation.mjs`
- workflows that call story package or research stages

Tasks:

- Add a stage key for `story_package_generation_v2` if needed.
- Add compatibility mapping from v2 fields to old downstream fields where required.
- Run fixture-based dry checks.
- Keep old stage available as fallback.

Likely files:

- `workflows/scripts/build_prompt_request.mjs`
- `workflows/scripts/prompt_stage_defaults.mjs`
- `workflows/scripts/run_story_package_generation.mjs`
- relevant workflow JSON only if necessary

Validation:

- `node --check` on changed `.mjs` files
- `jq empty` on changed JSON files
- fixture dry run or targeted smoke test without paid API calls

Exit criteria:

- New contract can be built.
- Old workflow path still works.
- Compatibility assumptions are documented.

Do not do:

- Do not delete old prompt or workflow.
- Do not call live text generation providers unless explicitly approved.

## Session 7 - Director Contract Upgrade

Goal: Make director output a structured contract with required style pack selection.

Read first:

- `prompts/director/*`
- `prompts/style_packs/style_pack_registry.json`
- `prompts/rules/rule_registry.json`

Tasks:

- Create or update `prompts/workflow/director_contract.md`.
- Create or update `prompts/schemas/director_contract.schema.json`.
- Require exactly one `selected_style_pack`.
- Allow one non-conflicting `secondary_influence`.
- Require `rejected_styles`.
- Include visual, voice, music, caption, edit, avatar, routing hints, risk flags, and QA focus.
- Prevent final provider selection inside director.

Likely files:

- `prompts/director/*`
- `prompts/workflow/director_contract.md`
- `prompts/schemas/director_contract.schema.json`
- `workflows/scripts/build_prompt_request.mjs`

Validation:

- `jq empty` on schemas and changed workflow JSON.
- Fixture director outputs validate against schema.
- Invalid style pack fixture fails validation.

Exit criteria:

- Director is constrained to style pack registry IDs.
- Director contract is structured enough for storyboard and visual prompt stages.

Do not do:

- Do not let director generate provider-specific prompts.
- Do not let director rewrite clean script.

## Session 8 - Storyboard and Shot Plan Split

Goal: Separate scene planning from image/video prompt generation.

Read first:

- `prompts/storyboard_and_prompts/*`
- `prompts/director/*`
- `workflows/n8n/wf_storyboard_and_prompts.json`

Tasks:

- Create `prompts/workflow/storyboard_and_shot_plan.md`.
- Create `prompts/schemas/storyboard.schema.json`.
- Define scenes, beats, timing, shot intent, asset needs, voice line IDs, caption intent, and transition intent.
- Keep current storyboard prompt available until downstream compatibility is proven.

Likely files:

- `prompts/workflow/storyboard_and_shot_plan.md`
- `prompts/schemas/storyboard.schema.json`
- possibly `prompts/storyboard_and_prompts/*`

Validation:

- `jq empty prompts/schemas/storyboard.schema.json`
- Fixture storyboard validates.
- Scene durations sum to expected target range.

Exit criteria:

- Storyboard contract has no provider-specific prompt fields.
- Visual prompt generation is clearly delegated to Session 9.

Do not do:

- Do not remove old `visual_prompt` consumers yet.
- Do not encode final render layout here.

## Session 9 - Visual Prompt Builder

Goal: Create a separate prompt builder for scene-level image/video prompts.

Read first:

- Session 8 storyboard schema
- `prompts/scene_asset_generation/prompt.md`
- `workflows/scripts/generate_and_rehost_scene_assets_v3.mjs`

Tasks:

- Create `prompts/workflow/visual_prompt_builder.md`.
- Create `prompts/schemas/visual_prompt.schema.json`.
- Require subject, environment, composition, camera, motion, lighting, style, duration, aspect ratio, text policy, negative prompt, and fallback prompt.
- Preserve continuity requirements.
- Reserve final readable text for renderer/Remotion by default.

Likely files:

- `prompts/workflow/visual_prompt_builder.md`
- `prompts/schemas/visual_prompt.schema.json`
- maybe `workflows/scripts/prompt_stage_defaults.mjs`

Validation:

- Schema parses with `jq`.
- Fixture visual prompts validate.
- Vague prompt fixture fails if a validator exists.

Exit criteria:

- Visual prompt contract exists separately from storyboard.
- Prompt specificity requirements match current asset generation guardrails.

Do not do:

- Do not choose final provider here.
- Do not ask image/video models to render critical text by default.

## Session 10 - Voice Performance Script

Goal: Add line-level voice performance metadata while preserving clean script.

Read first:

- `prompts/narration_generation/instructions.md`
- `workflows/scripts/generate_and_rehost_narration_audio.mjs`
- `workflows/scripts/tts_adapters.mjs`

Tasks:

- Create `prompts/workflow/voice_performance_script.md`.
- Create `prompts/schemas/voice_performance.schema.json`.
- Preserve `clean_spoken_script`.
- Add line-level fields for tone, pace, pauses, emphasis, pronunciation, estimated duration, and music ducking notes.
- Keep provider-specific tags out of the generic contract unless adapter explicitly maps them.

Likely files:

- `prompts/workflow/voice_performance_script.md`
- `prompts/schemas/voice_performance.schema.json`
- `prompts/narration_generation/instructions.md`
- `workflows/scripts/tts_adapters.mjs`

Validation:

- `jq empty prompts/schemas/voice_performance.schema.json`
- `node --check workflows/scripts/tts_adapters.mjs` if changed
- Fixture verifies clean script text is preserved.

Exit criteria:

- Clean script and performance metadata are separate.
- TTS adapters have a clear mapping path.

Do not do:

- Do not add new TTS providers.
- Do not overuse emotion tags.
- Do not change script meaning.

## Session 11 - Music/SFX Plan and License Metadata

Goal: Make music and SFX metadata publish-safe and style-aware.

Read first:

- `workflows/assets/music/README.md`
- `workflows/assets/music/library.json`
- `infra/render-worker/app.py`

Tasks:

- Create `prompts/workflow/music_sfx_plan.md`.
- Create schemas:
  - `music_sfx_plan.schema.json`
  - `music_asset.schema.json`
  - `sfx_asset.schema.json`
- Update music library metadata shape.
- Mark existing unknown license assets with `license_status: unknown` and `publish_allowed: false`.
- Add optional `assets/sfx/library.json` only if the repo has or needs SFX assets.

Likely files:

- `prompts/workflow/music_sfx_plan.md`
- `prompts/schemas/music_sfx_plan.schema.json`
- `prompts/schemas/music_asset.schema.json`
- `prompts/schemas/sfx_asset.schema.json`
- `workflows/assets/music/library.json`

Validation:

- `jq empty` on all changed JSON.
- Fixture with unknown license fails validation or QA expectation.
- Existing renderer does not break on catalog shape, or compatibility mapping is added.

Exit criteria:

- Music/SFX planning is separate from track selection.
- License uncertainty has a defined blocking representation.

Do not do:

- Do not add new music providers.
- Do not assume royalty-free means all-platform safe.

## Session 12 - Final QA Validator

Goal: Add final package QA as a structured publish gate contract.

Read first:

- `workflows/n8n/wf_validation_check.json`
- render completion workflows
- publish workflows

Tasks:

- Create `prompts/workflow/final_qa_validator.md`.
- Create `prompts/schemas/qa_result.schema.json`.
- Define blocking and non-blocking issue fields.
- Include stage-to-fix references.
- Add fixtures for failed license, failed avatar consent, failed caption/export.

Likely files:

- `prompts/workflow/final_qa_validator.md`
- `prompts/schemas/qa_result.schema.json`
- `fixtures/ai-video/*`

Validation:

- `jq empty prompts/schemas/qa_result.schema.json`
- Fixture QA outputs validate.

Exit criteria:

- QA contract can express blocking issues.
- QA names exact upstream fix stage.

Do not do:

- Do not wire publish blocking yet unless reserved for Session 13.

## Session 13 - Approval Queue and Publish Gate

Goal: Require final QA pass and selected-render approval before publishing.

Read first:

- `workflows/n8n/wf_instagram_reel_publish.json`
- `workflows/n8n/wf_instagram_simple_post_publish.json`
- `workflows/n8n/wf_instagram_publish_readiness.json`
- `studio-ui/AGENTS.md`
- `studio-ui/server.mjs`

Tasks:

- Create `prompts/schemas/approval.schema.json`.
- Define approval record fields.
- Update publish readiness/publish executor logic to require:
  - QA pass
  - `selected_video_id`
  - `approval_status: approved`
  - `approved_by`
  - `approved_at`
  - platform/account match
- Add UI/server support only if existing UI is the correct approval surface.

Likely files:

- `prompts/schemas/approval.schema.json`
- publish workflow JSON
- `studio-ui/server.mjs`
- `studio-ui/public/*`

Validation:

- `jq empty` on workflow/schema JSON.
- `node --check studio-ui/server.mjs` if changed.
- Publish-blocking fixture tests.

Exit criteria:

- Unapproved selected render cannot publish.
- Approved render can proceed through the existing path.

Do not do:

- Do not auto-approve.
- Do not publish live content during validation.

## Session 14 - Client/Account Context

Goal: Make brand, style, music, avatar, and publishing policy per client/account.

Read first:

- `studio-ui/server.mjs`
- data model docs
- database init files under `infra/postgres/init`

Tasks:

- Create `prompts/schemas/client_account_context.schema.json`.
- Define account-level policies for brand, style, voice, music, avatar, and publishing.
- Decide where the context snapshot should live based on existing storage patterns.
- Ensure global safety rules override client preferences.

Likely files:

- `prompts/schemas/client_account_context.schema.json`
- `docs/architecture/data-model.md`
- `infra/postgres/init/*.sql`
- workflow scripts that load job context

Validation:

- `jq empty` on schemas.
- Any changed SQL reviewed manually.
- No client-specific preferences added to global prompts.

Exit criteria:

- Each job can carry or reference a client/account context snapshot.
- Style/music/avatar/publish policies are no longer assumed global.

Do not do:

- Do not build a full CRM.
- Do not allow client policy to override safety/legal rules.

## Session 15 - Model Provider Router

Goal: Add provider routing as a planning contract before changing provider behavior.

Read first:

- `workflows/scripts/adapter_config.mjs`
- `workflows/scripts/image_generation_adapters.mjs`
- `workflows/scripts/tts_adapters.mjs`
- `workflows/scripts/generate_and_rehost_scene_assets_v3.mjs`

Tasks:

- Create `prompts/workflow/model_provider_router.md`.
- Create `prompts/schemas/model_route.schema.json`.
- Output provider candidates, fit scores, constraints, tradeoffs, fallbacks, cost/speed/quality assumptions, and availability notes.
- Keep router planning-only unless explicitly approved.

Likely files:

- `prompts/workflow/model_provider_router.md`
- `prompts/schemas/model_route.schema.json`
- maybe docs/context only

Validation:

- `jq empty prompts/schemas/model_route.schema.json`
- Fixture route examples validate.

Exit criteria:

- Router can recommend candidates without changing creative direction or calling providers.

Do not do:

- Do not add new provider integrations.
- Do not change adapter selection behavior yet.

## Session 16 - `render_manifest_v2` Bridge

Goal: Create a renderer-neutral manifest that can map to current FFmpeg and future Remotion.

Read first:

- `workflows/n8n/wf_render_manifest_construction.json`
- `infra/render-worker/app.py`
- `docs/architecture/rendering-contract.md`

Tasks:

- Create `prompts/workflow/render_manifest_v2.md`.
- Create `prompts/schemas/render_manifest_v2.schema.json`.
- Define scenes, assets, captions, overlays, transitions, audio tracks, ducking, SFX, brand elements, safe areas, export settings.
- Add mapper or compatibility documentation for current FFmpeg manifest.

Likely files:

- `prompts/workflow/render_manifest_v2.md`
- `prompts/schemas/render_manifest_v2.schema.json`
- `docs/architecture/rendering-contract.md`
- render manifest workflow/scripts if wiring is approved

Validation:

- `jq empty prompts/schemas/render_manifest_v2.schema.json`
- Existing render manifest fixture maps to v2 or compatibility notes are documented.

Exit criteria:

- Render contract is renderer-neutral.
- Current FFmpeg path is not broken.

Do not do:

- Do not encode Remotion-only assumptions.
- Do not replace renderer.

## Session 17 - Remotion Edit Plan Contract

Goal: Add Remotion-compatible planning without requiring Remotion as runtime.

Read first:

- Session 16 render manifest contract
- `docs/architecture/rendering-contract.md`
- `docs/ai-context/commands-and-validation.md`

Tasks:

- Create `prompts/workflow/remotion_edit_plan.md`.
- Create `prompts/schemas/remotion_edit_plan.schema.json`.
- Define template ID, composition, dimensions, FPS, scenes, captions, overlays, lower thirds, transitions, audio tracks, ducking, SFX, brand elements, safe areas, export settings, render environment, and fallback plan.
- Add one fixture edit plan for `founder_explainer` or `fast_reel_hook`.

Likely files:

- `prompts/workflow/remotion_edit_plan.md`
- `prompts/schemas/remotion_edit_plan.schema.json`
- `fixtures/ai-video/*`

Validation:

- `jq empty prompts/schemas/remotion_edit_plan.schema.json`
- Fixture validates.

Exit criteria:

- Remotion plan can be generated as data.
- No Remotion dependency is added yet.

Do not do:

- Do not install Remotion yet.
- Do not replace FFmpeg.

## Session 18 - Avatar and Presenter Selector

Goal: Add optional avatar/presenter decision contracts with consent requirements.

Read first:

- `studio-ui/AGENTS.md`
- `studio-ui/server.mjs`
- existing character reference upload support

Tasks:

- Create `prompts/workflow/avatar_video_selector.md`.
- Create schemas:
  - `avatar_decision.schema.json`
  - `presenter_profile.schema.json`
- Require consent status, consent record URI, allowed use cases, disallowed use cases, usage restrictions, provider avatar ID, and provider voice ID.
- Make avatar output an asset route, not a publish route.

Likely files:

- `prompts/workflow/avatar_video_selector.md`
- `prompts/schemas/avatar_decision.schema.json`
- `prompts/schemas/presenter_profile.schema.json`
- maybe `studio-ui` if presenter management is added

Validation:

- `jq empty` on schemas.
- Fixture with missing consent fails.

Exit criteria:

- Avatar route is optional and consent-gated.
- No provider calls are added.

Do not do:

- Do not generate avatar videos.
- Do not create provider accounts or API keys.
- Do not use likeness without consent metadata.

## Session 19 - Automated Evaluation and Regression Tests

Goal: Make prompt contracts and publish blockers testable.

Read first:

- `scripts/CONTEXT.md`
- `docs/ai-context/commands-and-validation.md`
- all schemas created so far

Tasks:

- Add schema validation scripts or tests.
- Add fixture-based tests for:
  - invalid style pack
  - missing music license
  - missing avatar consent
  - unapproved render
  - visual prompt missing negative prompt
  - voice performance changing clean script
  - renderer-neutral manifest mapping
- Keep tests offline and mocked.

Likely files:

- `tests/prompt_contract_tests/`
- `tests/schema_validation_tests/`
- `tests/qa_gate_tests/`
- `tests/music_license_tests/`
- `tests/approval_gate_tests/`
- or repo-appropriate shell scripts under `scripts/`

Validation:

- Run new targeted tests.
- Run existing smoke tests that do not call paid APIs.

Exit criteria:

- Regression tests catch the most important contract failures.
- Tests are documented in context docs.

Do not do:

- Do not call live providers.
- Do not require paid credentials for tests.

## Session 20 - Stabilization, Docs, and Push

Goal: Consolidate the initiative, update context, and push safe changes.

Read first:

- `docs/ai-context/context-maintenance.md`
- `docs/ai-context/commands-and-validation.md`
- this file progress log

Tasks:

- Update AI context docs for new folders, stages, commands, and gotchas.
- Update `AGENTS.md` only if the repo entrypoint guidance changed.
- Run full available offline validation.
- Confirm no secrets, logs, caches, generated pyc, env backups, or raw local assets are staged.
- Commit and push.

Validation:

- `git status --short --branch`
- `git diff --check`
- `jq empty` on JSON files touched
- `node --check` on `.mjs` files touched
- relevant smoke tests from `docs/ai-context/commands-and-validation.md`
- staged secret/local-artifact check

Exit criteria:

- Branch is pushed.
- Context docs match the implemented architecture.
- Progress log is complete.

Do not do:

- Do not push local secret/runtime files.
- Do not leave partial sessions undocumented.

## Recommended Commit Strategy

Use one commit per session when possible.

Suggested commit messages:

- `Add AI video workflow session plan`
- `Document AI video workflow inventory`
- `Add AI video baseline fixtures`
- `Add prompt rule registry`
- `Add AI video style packs`
- `Add story package v2 contract`
- `Wire story package v2 compatibility`
- `Upgrade director contract`
- `Split storyboard and shot plan`
- `Add visual prompt builder contract`
- `Add voice performance script contract`
- `Add music SFX license contracts`
- `Add final QA contract`
- `Gate publishing on approval`
- `Add client account context schema`
- `Add model provider router contract`
- `Add render manifest v2 contract`
- `Add Remotion edit plan contract`
- `Add avatar presenter selector`
- `Add AI video contract regression tests`
- `Update AI video context docs`

## Progress Log

Update this section after each session.

| Session | Status | Commit | Notes |
|---|---|---|---|
| 0 | Complete | Staged | Plan adopted during docs cleanup; local-only secret/runtime files remain unstaged. |
| 1 | Complete | Staged | Added `docs/ai-context/ai-video-workflow-inventory.md`; no runtime behavior changed. |
| 2 | Complete | Staged | Added sanitized `fixtures/ai-video/` baseline inputs/outputs and fixture context; no provider calls or runtime behavior changes. |
| 3 | Complete | Staged | Added reusable prompt rule packs and machine-readable rule registry; no runtime loading wired yet. |
| 4 | Complete | Staged | Added 12 style pack contract files, registry, and schema; director selection is not wired yet. |
| 5 | Complete | Staged | Added inactive `story_package_generation_v2` contract, schema, and sanitized example; no workflow wiring or provider calls. |
| 6 | Complete | Staged | Added opt-in v2 stage key and deterministic v2-to-legacy mapping; default story package path remains unchanged. |
| 7 | Complete | Staged | Wired active `director_contract` to a style-pack-constrained schema with valid/invalid fixtures and no-dependency validation. |
| 8 | Complete | Staged | Added prompt-free storyboard/shot-plan contract, schema, fixture, and duration/cross-reference validator; active storyboard prompt remains unchanged. |
| 9 | Complete | Staged | Added provider-neutral visual prompt builder contract, schema, valid/invalid fixtures, and local specificity/text-policy validator; active scene asset flow remains unchanged. |
| 10 | Complete | Staged | Added provider-neutral voice performance contract, schema, valid/invalid fixtures, and clean-script preservation validator; active narration runtime remains unchanged. |
| 11 | Complete | Staged | Added music/SFX plan contract, music/SFX schemas, valid/invalid license fixtures, catalog validator, explicit music license metadata, and render-worker skip logic for unknown/non-publishable tracks. |
| 12 | Complete | Staged | Added final QA prompt contract, QA result schema, approved/blocked fixtures, and no-dependency validator; no publish workflow wiring yet. |
| 13 | Complete | Staged | Added approval schema/table, selected-render approval fixtures/validators, Studio UI approval action, Reel publish gate requiring `publish_approvals`, simple-post `qa_approved` gate, and publish readiness notes. |
| 14 | Complete | Staged | Added client/account context schema/table snapshots, valid/invalid fixtures, no-dependency validator, Studio topic snapshot writes, story-package context loading/defaults, and Reel publish account-context matching. |
| 15 | Complete | Staged | Added planning-only model provider router prompt/schema, valid/invalid fixtures, no-dependency validator, and context docs; no adapter selection behavior changed. |
| 16 | Complete | Staged | Added renderer-neutral `render_manifest_v2` prompt/schema, valid/invalid fixtures, FFmpeg compatibility validator, and bridge documentation; active render workflow and local FFmpeg worker remain unchanged. |
| 17 | Complete | Staged | Added contract-only Remotion edit-plan prompt/schema, valid/invalid fixtures, no-dependency validator, prerequisite runbook, and context routing; no Remotion dependency installed and local FFmpeg remains the active fallback. |
| 18 | Complete | Staged | Added contract-only avatar/presenter selector prompt, avatar decision and presenter profile schemas, valid/missing-consent fixtures, no-dependency validator, rule routing, runbook notes, and context docs; no avatar provider calls or runtime generation added. |
| 19 | Complete | Staged | Added offline aggregate contract regression runner, missing-negative-prompt and unapproved-render fixtures, publish-ready approval validation mode, and validation/context docs; no provider, Docker, render, or publish commands required. |
| 20 | Complete | Pushed | Ran final offline stabilization, context/documentation updates, local-artifact guards, commit, and push. |
