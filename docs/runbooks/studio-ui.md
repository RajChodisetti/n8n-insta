# 25 — Studio UI Runbook

This page documents the local browser UI for operating the pipeline.

The visible UI is intentionally narrow and meant to cover the normal operating loop without opening raw workflow JSON:

- inject a new idea into the default code-first Reel pipeline
- optionally require human approval before generated downstream artifacts are used by the next phase
- configure runtime providers, models, avatar settings, and collapsed provider API key inputs
- approve or edit pending review artifacts
- inspect each idea as a step-by-step pipeline
- approve the selected render before explicit publish actions

## Start the UI

Bring the stack up with the new `studio-ui` service:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis minio minio-bootstrap remotion-renderer studio-ui pipeline-worker
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

The `New Idea` form calls the idea-ingest helper, writes a new row into `content_items`, and queues a `generate_reel` pipeline run. The visible form only asks for the idea text and an optional review-mode toggle. The inserted topic still stores:

- `status = idea_approved`
- `title`, `category`, `confidence_label`
- `target_duration_seconds`
- `reel_type` (`image`, `video`, or `avatar`, selected by the submit button)
- `source_payload_json`

The target-duration field is configurable through these `.env` keys:

- `STUDIO_TOPIC_TARGET_DURATION_MIN_SECONDS`
- `STUDIO_TOPIC_TARGET_DURATION_MAX_SECONDS`
- `STUDIO_TOPIC_TARGET_DURATION_DEFAULT_SECONDS`

Current repo defaults:

- minimum: `15`
- maximum: `180`
- default: `45`

With review mode off, the code-first pipeline worker can claim it immediately and run without human intervention.

### Runtime settings

The `Runtime Settings` panel renders the visible subset of `/api/config`:

- `Narration & Voice` for voice style, TTS voice, speed, and extra delivery instructions
- `Adapters & Models` for OpenAI/Anthropic provider routing, premium text routing, stage models, image/video/TTS provider defaults, render provider, and default Reel type
- `Provider API Keys`, collapsed by default, for OpenAI, Anthropic, Fal, Fish Audio, Smallest AI, and related stage-specific keys
- `Avatar Video` for HeyGen identity, polling, consent fallback URI, and offline mock avatar outputs

Secret values are masked in the browser. Keeping the mask preserves the existing value; replacing or clearing it writes the changed value to the repo-root `.env`.

### Human review mode

When review mode is enabled for a run, Studio sets `summary_json.review_mode = true` on `pipeline_runs`. The worker pauses the run with `status = awaiting_review` and writes a `pipeline_reviews` row at these checkpoints:

- `idea_ingest` before story package generation
- `story_package_generation` before asset generation
- `remotion_manifest` before rendering
- `caption_and_hashtags` before final QA

Pending reviews appear in the `Human Review` panel as editable JSON. Approving a review applies edits to the same tables the next stage reads, then resumes the run at the next pending step.

With review mode off, none of these intermediate pauses are created.

### Hidden compatibility endpoints

The server still contains prompt, upload, and legacy workflow endpoints used by older local workflows and scripts, but the visible UI no longer exposes prompt-file editing, character-reference upload, or legacy workflow launching as general operator controls.

Prompt-file changes still do not require container recreation when made through compatible endpoints or direct file edits.

## Restart boundary

New Node-side model/provider calls read the repo-root `.env` at call time through `adapter_config.mjs`, so Studio-saved LLM keys, provider choices, model names, default Reel type, and HeyGen avatar config are picked up by new text/avatar calls without recreating containers.

Still recreate affected containers after changing lower-level service settings, render service settings, Docker-only env, or anything consumed by a non-Node service:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate studio-ui pipeline-worker remotion-renderer
```

Why:

- `studio-ui` may need the new env for non-overlay UI defaults and API enqueue behavior
- `pipeline-worker` may need the new env for settings that are not routed through the runtime env overlay
- `remotion-renderer` needs the new env for render-related settings
- recreate `n8n` or `render-worker` too if you intentionally use legacy fallback paths

Google Cloud Storage note:

- if you switch any host selector to `google_cloud_storage`, configure `GOOGLE_CLOUD_STORAGE_BUCKET`, `GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH`, `GOOGLE_CLOUD_STORAGE_ENDPOINT`, and `GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL` in `.env` or through the compatibility config API
- see [docs/runbooks/google-cloud-storage-asset-host.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/google-cloud-storage-asset-host.md) for the full setup sequence

## Workflow launching

The visible UI no longer includes the legacy workflow launcher. The server endpoint still runs the same workflow exports that already live in [workflows/n8n/](/Users/rajchodisetti/n8n-insta/workflows/README.md) for fallback/debug use.

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

## Practical sequence

For normal live pipeline use:

1. Open the Studio UI.
2. Enter an idea.
3. Enable review mode only when you want human approval/editing between phases.
4. Click `Image Reel`, `Video Reel`, or `Avatar Reel`.
5. If review mode is on, approve or edit each pending review.
6. Track the idea in the `Pipeline` section.
7. Approve the selected render before any explicit publish action.
