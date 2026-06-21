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

How prompt loading works:

- text-generation workflows load `system.md`, `user.md`, and `response-schema.json` through [build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs)
- image and narration helpers load `prompt.md` or `instructions.md` through [prompt_utils.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/prompt_utils.mjs)
- the Studio UI prompt generator uses `prompt_builder/*` through [build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) and [invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)
- v1 abstract idea ingest now stores `creative_defaults` directly on the topic row; those defaults feed research/script, director_contract, storyboard, narration, images, and music without a separate prompt-profile call
- Docker mounts this folder into `n8n` at `/prompts`, and `PROMPTS_ROOT` can override that location if needed
- the runtime prompt-builder configuration is file-backed at `prompts/.runtime-prompt-builder.json`, so it can change live workflow prompt wording without editing the saved prompt templates
- legacy prompt-profile files remain for older flows, but the optimized v1 path uses `creative_defaults` from `idea_ingest`

Editing rule:

- change the prompt files here, not the workflow JSON, for any supported model stage
- keep the existing `{{placeholder_name}}` tokens unless you also update the workflow code that supplies `prompt_template_data`
- rerun the workflow or smoke test after each prompt edit to validate the new output shape
- the Studio UI now shows only the active prompt files used by live workflows, so changing a visible prompt changes the real runtime behavior on the next run
- the Studio UI also shows per-placeholder help text and examples grouped by stage, so you can see what each `{{placeholder}}` means before editing it

Prompt model reference:

- [21-prompt-reference-and-model-call-map.md](/Users/rajchodisetti/n8n-insta/21-prompt-reference-and-model-call-map.md)
- [23-prompt-model-and-voice-tuning-runbook.md](/Users/rajchodisetti/n8n-insta/23-prompt-model-and-voice-tuning-runbook.md)
- [24-adapter-architecture-and-provider-switching.md](/Users/rajchodisetti/n8n-insta/24-adapter-architecture-and-provider-switching.md)
