# prompts Context

## Purpose

This folder stores file-backed prompt templates, response schemas, and prompt-builder assets used by n8n workflows and the Studio UI.

## When to read this

Read this before prompt wording, response schema, placeholder, model-output, narrative style, image prompt, caption, storyboard, narration, or prompt-builder changes.

## Important files and subfolders

- `README.md`: current prompt loading model and editing rules.
- `idea_ingest/`, `story_package_generation/`, `director/`, `research_and_script/`, `storyboard_and_prompts/`, `caption_and_hashtags/`: structured text stages.
- `scene_asset_generation/prompt.md`: scene image/video asset prompt source.
- `narration_generation/instructions.md`: TTS instruction source.
- `post_image_generation/prompt.md`: simple post image prompt source.
- `prompt_builder/`: Studio UI prompt rewrite/generation stage.
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
- Validate with the smoke test for the affected stage.

## Do not do

- Do not remove, rename, or add `{{placeholder}}` tokens casually.
- Do not put secrets, API keys, or private URLs in prompt files.
- Do not edit workflow JSON for prompt wording when the prompt stage is already file-backed.
- Do not assume legacy caption subpass files are active without checking workflow wiring.

## Validation

- Research/storyboard: `bash scripts/test_phase2_topic_to_storyboard_smoke.sh`
- Caption/hashtags: `bash scripts/test_phase2_caption_iteration_smoke.sh`
- Scene assets: `bash scripts/test_phase3_scene_asset_generation_smoke.sh`
- Narration: `bash scripts/test_phase3_narration_generation_smoke.sh`

## Gotchas

- Prompt files are static in git but rendered dynamically at runtime.
- Prompt edits are hot-loaded on the next workflow run.
- `.env` default changes require container recreation, but prompt-file changes do not.
- The Studio UI may write runtime prompt-builder config under `prompts/.runtime-prompt-builder.json` when used.

## Uncertainties

- Some prompt groups appear newer than the committed runbooks. Confirm active workflow wiring before deleting or renaming any group.

## Last reviewed

2026-06-21, git commit `0d0515b`.
