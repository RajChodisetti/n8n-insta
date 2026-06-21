# 25 — Studio UI Runbook

This page documents the local browser UI for operating the pipeline.

The UI is meant to cover the common local tasks without opening raw workflow JSON:

- inject a new idea into the first pipeline step
- edit prompt files under `prompts/`
- tune env-backed placeholder defaults, timing guidance, models, providers, voice, and host settings
- launch one-click or individual workflows
- inspect recent pipeline items

## Start the UI

Bring the stack up with the new `studio-ui` service:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis minio minio-bootstrap n8n render-worker studio-ui
```

Open:

```text
http://localhost:${STUDIO_UI_HOST_PORT}
```

With the default example env, that is:

```text
http://localhost:7780
```

## What the UI edits

### Topic injection

The `New Idea` form writes a new row directly into `content_items` with:

- `status = idea_approved`
- `title`, `category`, `confidence_label`
- `target_duration_seconds`
- `source_payload_json`

The target-duration field is configurable through these `.env` keys:

- `STUDIO_TOPIC_TARGET_DURATION_MIN_SECONDS`
- `STUDIO_TOPIC_TARGET_DURATION_MAX_SECONDS`
- `STUDIO_TOPIC_TARGET_DURATION_DEFAULT_SECONDS`

Current repo defaults:

- minimum: `15`
- maximum: `180`
- default: `45`

That means the next run of `wf_research_and_script` or the one-click Reel workflow can claim it immediately.

### Prompt files

The prompt editor writes directly to files in [prompts/](/Users/rajchodisetti/n8n-insta/prompts/README.md).

Examples:

- [prompts/research_and_script/system.md](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/system.md)
- [prompts/storyboard_and_prompts/user.md](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/user.md)
- [prompts/scene_asset_generation/prompt.md](/Users/rajchodisetti/n8n-insta/prompts/scene_asset_generation/prompt.md)

Prompt-file changes do not require container recreation. They apply on the next workflow run because the helper scripts read the prompt files at runtime.

The prompt editor is now organized by workflow step and shows:

- active prompt files grouped by stage
- a runtime placeholder catalog for the selected file
- tooltips and example values for each placeholder

Prompt-save proof:

- saving a prompt through `POST /api/prompt` updates the same file bundle read by [build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) and the image or narration helpers
- prompt edits apply immediately on the next run without recreating containers

### Env-backed runtime settings

The `Runtime Settings` panel edits the repo-root `.env`.

These settings are now split into collapsible sections for:

- Studio UI range/default settings
- global prompt defaults like `CONTENT_LANGUAGE`
- stage-specific placeholder defaults for research, storyboard, scene images, narration, captions, and post images
- adapter and model selection in a separate section
- asset-host, publish, and render-timing settings
- Google Cloud Storage hosting fields for GCS-backed public delivery

Each editable env field now includes:

- a tooltip that explains what it controls
- two example entries you can click into the field

Env-backed changes do require recreating the relevant containers before workflow runs use the new values.

## Restart boundary

After changing `.env` through the UI, recreate:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n render-worker studio-ui
```

Why:

- `studio-ui` needs the new env if you launch workflows from the browser
- `n8n` needs the new env if you launch workflows from the n8n editor
- `render-worker` needs the new env for render-related settings

Google Cloud Storage note:

- if you switch any host selector to `google_cloud_storage`, the same `Runtime Settings` panel exposes `GOOGLE_CLOUD_STORAGE_BUCKET`, `GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH`, `GOOGLE_CLOUD_STORAGE_ENDPOINT`, and `GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL`
- see [27-google-cloud-storage-asset-host-runbook.md](/Users/rajchodisetti/n8n-insta/27-google-cloud-storage-asset-host-runbook.md) for the full setup sequence

## Workflow launching

The `Workflow Launcher` panel runs the same workflow exports that already live in [workflows/n8n/](/Users/rajchodisetti/n8n-insta/workflows/README.md).

Important entries:

- `wf_end_to_end_reel_generate_and_publish`
- `wf_research_and_script`
- `wf_storyboard_and_prompts`
- `wf_asset_generation`
- `wf_narration_generation`
- `wf_caption_and_hashtags`
- `wf_instagram_reel_publish`

The launcher uses [execute_workflow_by_name.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/execute_workflow_by_name.mjs) under the hood, so it stays on the same execution path as the repo’s scripted runs.

The one-click Reel launcher is resume-aware:

- if there is exactly one unfinished Reel candidate, it resumes from that candidate’s current safe checkpoint
- if there are zero unfinished candidates, it fails and tells you to inject a new idea
- if there are multiple unfinished candidates, it fails and tells you to clear the queue first
- if the render worker is not running in `webhook` mode, it switches to the sync render workflow automatically instead of waiting on the old stub queue path

## Current placeholder-default env keys

These are the main prompt-default keys the UI is designed around:

- `CONTENT_LANGUAGE`
- `RESEARCH_LANGUAGE`
- `RESEARCH_BRAND_TONE`
- `RESEARCH_NARRATOR_STYLE`
- `RESEARCH_ENDING_SIGNATURE_FAMILY`
- `RESEARCH_TIMING_GUIDANCE`
- `STORYBOARD_LANGUAGE`
- `STORYBOARD_BRAND_TONE`
- `STORYBOARD_VISUAL_STYLE_RULES`
- `STORYBOARD_SUBTITLE_STYLE_RULES`
- `STORYBOARD_TIMING_GUIDANCE`
- `STORYBOARD_NARRATION_ALIGNMENT_GUIDANCE`
- `STORYBOARD_RENDER_TIMING_GUIDANCE`
- `CAPTION_LANGUAGE`
- `CAPTION_BRAND_TONE`
- `CAPTION_LANGUAGE_GUIDANCE`
- `SCENE_IMAGE_LANGUAGE`
- `SCENE_STYLE_NOTES_DEFAULT`
- `SCENE_IMAGE_TIMING_GUIDANCE`
- `SCENE_IMAGE_STORY_ALIGNMENT_GUIDANCE`
- `NARRATION_LANGUAGE`
- `NARRATION_TIMING_GUIDANCE`
- `POST_IMAGE_COVER_PROMPT_DIRECTION_DEFAULT`
- `POST_IMAGE_STYLE_NOTES_DEFAULT`
- `POST_IMAGE_LANGUAGE`
- `POST_IMAGE_STORY_ALIGNMENT_GUIDANCE`

These are now consumed directly in:

- [wf_research_and_script.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_research_and_script.json:1)
- [wf_storyboard_and_prompts.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_storyboard_and_prompts.json:1)
- [wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json:1)
- [wf_asset_generation.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_asset_generation.json:1)
- [wf_simple_post_image_asset.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_simple_post_image_asset.json:1)

Prompt editing note:

- prompt file edits in the Studio UI are hot-loaded and apply on the next workflow run
- `.env` edits in the Studio UI still require recreating `n8n`, `render-worker`, and `studio-ui`
- the prompt list now shows only the prompt files that are actively wired into the live workflows, so the visible caption prompt is the one used by `wf_caption_and_hashtags`

## Practical sequence

For prompt-tuning plus live pipeline use:

1. Open the Studio UI.
2. Edit the relevant prompt file.
3. If needed, edit runtime defaults, model, provider, voice, or host settings.
4. Recreate `n8n`, `render-worker`, and `studio-ui` if you changed `.env`.
5. Inject a new topic.
6. Run `wf_end_to_end_reel_generate_and_publish` or run stages one by one.
7. Check the `Recent Pipeline Items` table in the UI or validate in Postgres.
