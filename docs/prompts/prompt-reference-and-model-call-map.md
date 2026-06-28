# 21 — Prompt Reference and Model Call Map

This document is the prompt inventory for the current repo state.

Use it to answer four practical questions:

1. which prompt files exist
2. where each prompt is used
3. whether prompts are static or dynamic
4. how many model requests an end-to-end run makes

## Prompt Loading Model

Prompt storage:

- all editable prompt assets live under [prompts/](/Users/rajchodisetti/n8n-insta/prompts/README.md)

Prompt loading runtime:

- text workflows load prompt files through [workflows/scripts/build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) and execute them through [workflows/scripts/invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)
- image and narration helpers load prompt files through [workflows/scripts/prompt_utils.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/prompt_utils.mjs)
- Docker mounts the repo prompt folder into `n8n` at `/prompts`
- `PROMPTS_ROOT` can override the prompt root if needed
- provider and model choice are now selected by adapter env vars, documented in [24 — Adapter Architecture and Provider Switching](/Users/rajchodisetti/n8n-insta/docs/architecture/adapter-architecture-and-provider-switching.md)

Prompt type:

- the prompt files are static templates in git
- the final prompt sent to the model is dynamic at runtime because the helpers inject workflow data into `{{placeholders}}`
- some stages can be rewritten by the optional runtime prompt-builder when `prompts/.runtime-prompt-builder.json` exists and is enabled
- response schemas, placeholder names, prompt-builder guardrails, and safety/approval/consent/provider-secret rules should be treated as stable contracts

Current rule of thumb:

- edit prompt wording in `prompts/...`
- edit workflow code only if you need new placeholders or a new prompt stage
- read [Runtime Prompt Orchestration Strategy](/Users/rajchodisetti/n8n-insta/docs/prompts/runtime-prompt-orchestration-strategy.md) before changing runtime rewrite behavior

## Runtime Overwrite Classes

| Class | What changes at runtime | Examples | Editing policy |
| --- | --- | --- | --- |
| Stable contract | Nothing should rewrite it during a run. | Schemas, placeholders, stage wiring, prompt-builder hard rules, approval/consent/license/factuality rules. | Change only through repo edits plus validation. |
| Partial runtime guidance | Values are injected or allowlisted per idea/account. | `creative_defaults`, `prompt_profile` allowlisted fields, client/account context, env defaults. | Use for tone, pacing, style, narration, and music direction only. |
| Fully AI-built output | The model creates new stage content. | Story package, storyboard, captions, visual prompts, narration instructions, optional runtime prompt-builder draft. | Must preserve schemas, placeholders, hard rules, and downstream contracts. |

Runtime prompt-builder defaults now avoid provider-facing asset/narration prompt stages (`scene_asset_generation`, `post_image_generation`, `narration_generation`) to reduce output drift. If a visual prompt file is explicitly targeted, runtime code appends a text-free renderer-owned-title appendix to the in-memory draft.

## Prompt Inventory

### `wf_research_and_script`

Used when:

- a content row moves from `idea_approved` to `scripting`

Prompt files:

- [prompts/research_and_script/system.md](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/system.md)
- [prompts/research_and_script/user.md](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/user.md)
- [prompts/research_and_script/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/response-schema.json)

Loader:

- [workflows/scripts/build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) with stage `research_and_script`
- [workflows/scripts/invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)

Runtime template data:

- `topic`
- `category`
- `target_duration_seconds`
- `content_language`
- `brand_tone`
- `narrator_style`
- `ending_signature_family`
- `confidence_context`
- `source_notes`
- `language_guidance`
- `timing_guidance`

Model requests:

- `1` text request
- selector precedence:
  `RESEARCH_LLM_PROVIDER -> TEXT_LLM_PROVIDER`
  `RESEARCH_MODEL -> TEXT_MODEL`

### `wf_director_contract`

Used when:

- a content row moves from `script_complete` to `directing`

Prompt files:

- [prompts/workflow/director_contract.md](/Users/rajchodisetti/n8n-insta/prompts/workflow/director_contract.md)
- [prompts/workflow/director_contract_user.md](/Users/rajchodisetti/n8n-insta/prompts/workflow/director_contract_user.md)
- [prompts/schemas/director_contract.schema.json](/Users/rajchodisetti/n8n-insta/prompts/schemas/director_contract.schema.json)

Loader:

- [workflows/scripts/build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) with stage `director_contract`
- [workflows/scripts/invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)

Runtime template data:

- `title`
- `category`
- `target_duration_seconds`
- `narration_script`
- `script_scene_guidance_json`
- `scene_count`
- `creative_defaults_json`
- `style_pack_registry_summary`
- `rule_registry_summary`

Model requests:

- `1` text request
- selector precedence:
  `DIRECTOR_LLM_PROVIDER -> TEXT_LLM_PROVIDER`
  `DIRECTOR_CONTRACT_MODEL -> DIRECTOR_MODEL -> TEXT_MODEL`

### `wf_storyboard_and_prompts`

Used when:

- a content row moves from `script_complete` to `storyboarding`

Prompt files:

- [prompts/storyboard_and_prompts/system.md](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/system.md)
- [prompts/storyboard_and_prompts/user.md](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/user.md)
- [prompts/storyboard_and_prompts/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/response-schema.json)

Loader:

- [workflows/scripts/build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) with stage `storyboard_and_prompts`
- [workflows/scripts/invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)

Runtime template data:

- `title`
- `category`
- `target_duration_seconds`
- `narration_script`
- `content_language`
- `brand_tone`
- `visual_style_rules`
- `subtitle_style_rules`
- `language_guidance`
- `storyboard_timing_guidance`
- `narration_alignment_guidance`
- `render_timing_guidance`

Model requests:

- `1` text request
- selector precedence:
  `STORYBOARD_LLM_PROVIDER -> TEXT_LLM_PROVIDER`
  `STORYBOARD_MODEL -> TEXT_MODEL`

Session 8/9 contract note:

- [prompts/workflow/storyboard_and_shot_plan.md](/Users/rajchodisetti/n8n-insta/prompts/workflow/storyboard_and_shot_plan.md) and [prompts/schemas/storyboard.schema.json](/Users/rajchodisetti/n8n-insta/prompts/schemas/storyboard.schema.json) define a prompt-free storyboard/shot-plan contract for future splitting.
- [prompts/workflow/visual_prompt_builder.md](/Users/rajchodisetti/n8n-insta/prompts/workflow/visual_prompt_builder.md) and [prompts/schemas/visual_prompt.schema.json](/Users/rajchodisetti/n8n-insta/prompts/schemas/visual_prompt.schema.json) define the separate scene-level visual prompt contract.
- The active `wf_storyboard_and_prompts` path still uses the legacy files above and still outputs `visual_prompt`, cover prompt, subtitle metadata, and render seed fields.
- The active scene asset flow still consumes legacy `storyboard_json.visual_prompt`; the Session 9 contract is not wired into runtime asset generation yet.

### `wf_caption_and_hashtags`

Used when:

- a content row is ready for a publish draft or a rendered Reel caption package

Prompt stages:

- single-pass caption and hashtag generation

Prompt files:

- [prompts/caption_and_hashtags/system.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/system.md)
- [prompts/caption_and_hashtags/user.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/user.md)
- [prompts/caption_and_hashtags/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/response-schema.json)

Loader:

- [workflows/scripts/build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs)
- [workflows/scripts/invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)

Runtime template data:

- `title`
- `category`
- `content_language`
- `content_status`
- `selected_hook`
- `narration_script`
- `caption_draft_or_none`
- `cta_line_or_none`
- `cover_prompt_or_none`
- `brand_tone`
- `language_guidance`

Model requests:

- `1` text request
- selector precedence:
  `CAPTION_LLM_PROVIDER -> TEXT_LLM_PROVIDER`
  `CAPTION_MODEL -> TEXT_MODEL`

### `wf_asset_generation`

Used when:

- a content row moves from `storyboard_complete` to `generating_assets`

Prompt file:

- [prompts/scene_asset_generation/prompt.md](/Users/rajchodisetti/n8n-insta/prompts/scene_asset_generation/prompt.md)

Loader:

- [workflows/scripts/generate_and_rehost_scene_assets.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_scene_assets.mjs)
- [workflows/scripts/image_generation_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/image_generation_adapters.mjs)
- [workflows/scripts/asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs)

Runtime template data:

- `title`
- `category`
- `content_language`
- `scene_number`
- `scene_duration_seconds`
- `narration_text`
- `visual_prompt`
- `mood`
- `transition`
- `narration_script_excerpt`
- `style_notes`
- `scene_timing_guidance`
- `story_alignment_guidance`

Model requests:

- `1` image request per storyboard scene
- selector precedence:
  `SCENE_IMAGE_PROVIDER -> IMAGE_GENERATION_PROVIDER`
  `SCENE_IMAGE_MODEL -> IMAGE_MODEL`

### `wf_narration_generation`

Used when:

- a content row moves from `assets_ready` to `generating_narration`

Prompt file:

- [prompts/narration_generation/instructions.md](/Users/rajchodisetti/n8n-insta/prompts/narration_generation/instructions.md)

Loader:

- [workflows/scripts/generate_and_rehost_narration_audio.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_narration_audio.mjs)
- [workflows/scripts/tts_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/tts_adapters.mjs)
- [workflows/scripts/asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs)

Runtime template data:

- `title`
- `narration_script`
- `content_language`
- `target_duration_seconds`
- `scene_timing_plan`
- `narration_timing_guidance`

Model requests:

- `1` TTS request
- selector precedence:
  `NARRATION_PROVIDER -> TTS_PROVIDER`
  `NARRATION_MODEL -> TTS_MODEL`
  `NARRATION_VOICE -> TTS_VOICE`

Session 10 contract note:

- [prompts/workflow/voice_performance_script.md](/Users/rajchodisetti/n8n-insta/prompts/workflow/voice_performance_script.md) and [prompts/schemas/voice_performance.schema.json](/Users/rajchodisetti/n8n-insta/prompts/schemas/voice_performance.schema.json) define a provider-neutral voice performance contract.
- The active `wf_narration_generation` path still uses the prompt file and loaders listed above, plus clean per-scene script text from storyboard rows.
- The Session 10 contract is not wired into runtime TTS generation yet; future adapter mapping should translate generic tone/pace/pause metadata without changing `clean_spoken_script`.

### `avatar_presenter_selector`

Used when:

- a code-first `avatar` Reel run finishes visual prompt building and must decide between HeyGen avatar generation or normal video fallback

Prompt files:

- [prompts/workflow/avatar_video_selector.md](/Users/rajchodisetti/n8n-insta/prompts/workflow/avatar_video_selector.md)
- [prompts/schemas/avatar_decision.schema.json](/Users/rajchodisetti/n8n-insta/prompts/schemas/avatar_decision.schema.json)

Loader:

- [workflows/scripts/build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) with stage `avatar_presenter_selector`
- [workflows/scripts/invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)

Runtime template data:

- `client_account_context_json`
- `story_package_context_json`
- `director_avatar_contract_json`
- `storyboard_plan_json`
- `character_reference_context_json`
- `presenter_profile_inventory_json`
- `avatar_provider_inventory_json`
- `avatar_rules_summary`
- `heygen_capability_summary`

Model requests:

- `1` text request for avatar runs
- selector precedence:
  `AVATAR_LLM_PROVIDER -> PREMIUM_TEXT_LLM_PROVIDER -> TEXT_LLM_PROVIDER`
  `AVATAR_MODEL -> PREMIUM_TEXT_MODEL -> TEXT_MODEL`

Runtime behavior:

- stores the decision in `scripts.raw_response_json.avatar_decision_json`
- `avatar_media_generation` revalidates consent/config and either creates an `avatar_video` asset or auto-downgrades to the normal video path
- direction enriches provider instructions only; it must not rewrite the spoken narration script

Session 11 contract note:

- [prompts/workflow/music_sfx_plan.md](/Users/rajchodisetti/n8n-insta/prompts/workflow/music_sfx_plan.md), [prompts/schemas/music_sfx_plan.schema.json](/Users/rajchodisetti/n8n-insta/prompts/schemas/music_sfx_plan.schema.json), [prompts/schemas/music_asset.schema.json](/Users/rajchodisetti/n8n-insta/prompts/schemas/music_asset.schema.json), and [prompts/schemas/sfx_asset.schema.json](/Users/rajchodisetti/n8n-insta/prompts/schemas/sfx_asset.schema.json) define provider-neutral music/SFX planning and license metadata contracts.
- The active render path still selects background music from [workflows/assets/music/library.json](/Users/rajchodisetti/n8n-insta/workflows/assets/music/library.json), not from the Session 11 prompt contract.
- The render worker now skips catalog entries with `license_status: "unknown"` or `publish_allowed: false`.

Session 12 contract note:

- [prompts/workflow/final_qa_validator.md](/Users/rajchodisetti/n8n-insta/prompts/workflow/final_qa_validator.md) and [prompts/schemas/qa_result.schema.json](/Users/rajchodisetti/n8n-insta/prompts/schemas/qa_result.schema.json) define a final package QA result contract.
- The contract can express blocking and non-blocking issues, exact upstream fix stages, and publish requirements.
- The active publish workflows do not consume this contract yet; Session 13 is reserved for approval and publish-gate wiring.

### `wf_simple_post_image_asset`

Used when:

- the simple-post path needs one generated cover image for a feed post

Prompt file:

- [prompts/post_image_generation/prompt.md](/Users/rajchodisetti/n8n-insta/prompts/post_image_generation/prompt.md)

Loader:

- [workflows/scripts/generate_and_rehost_post_image.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_post_image.mjs)
- [workflows/scripts/image_generation_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/image_generation_adapters.mjs)
- [workflows/scripts/asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs)

Runtime template data:

- `title`
- `category`
- `content_language`
- `selected_hook`
- `caption_final`
- `narration_script_excerpt`
- `cover_prompt_direction`
- `style_notes`
- `story_alignment_guidance`

Model requests:

- `1` image request
- selector precedence:
  `POST_IMAGE_PROVIDER -> IMAGE_GENERATION_PROVIDER`
  `POST_IMAGE_MODEL -> IMAGE_MODEL`

## End-to-End Model Request Count

### Narrated Reel path

Current one-click Reel workflow:

- [workflows/n8n/wf_end_to_end_reel_generate_and_publish.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_end_to_end_reel_generate_and_publish.json)

Model request formula:

- research and script: `1`
- storyboard: `1`
- caption workflow: `1`
- narration TTS: `1`
- scene assets: `N`, where `N = number of storyboard scenes`

Total:

- `N + 4`

Typical real range:

- `10` requests for `4` scenes
- `12` requests for `6` scenes
- `14` requests for `8` scenes

### Simple post path

If you run the richer simple-post package flow:

- research and script: `1`
- storyboard: `1`
- caption workflow: `3`
- post image generation: `1`

Total:

- `6`

## Non-Model Requests in the One-Click Reel Workflow

These are not prompt/model calls, but they still happen in the full workflow:

- one render-worker dispatch request
- render callback webhook registration and callback delivery
- one Reel container creation request to Meta
- repeated Meta container status polls
- one final Meta `media_publish` request

The exact Meta request count varies because container polling is time-dependent.

## How To Change Prompt Text

Workflow-safe prompt edits:

1. edit the file under `prompts/`
2. keep every existing `{{placeholder}}` unless you also change the supplying workflow/helper code
3. rerun the relevant smoke test or workflow

No code change needed for:

- changing wording
- changing tone
- changing examples
- changing response constraints inside the existing schema files

Code change required for:

- adding a new placeholder
- removing a placeholder that the runtime still supplies
- adding a new prompt stage
- moving a workflow to a different prompt file path

## Practical Answer

Are prompts static or dynamic?

- static in storage
- dynamic in execution

More precisely:

- the repo stores static prompt templates
- the workflow builds the final prompt dynamically from those templates plus live DB/runtime values

Practical tuning guide:

- [23 — Prompt, Model, and Voice Tuning Runbook](/Users/rajchodisetti/n8n-insta/docs/runbooks/prompt-model-and-voice-tuning.md)
