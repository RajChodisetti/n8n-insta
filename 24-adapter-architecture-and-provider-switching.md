# 24 — Adapter Architecture and Provider Switching

This repo now treats adapters as the first design principle for AI and hosting integrations.

The practical rule is:

- prompts stay in [prompts/](/Users/rajchodisetti/n8n-insta/prompts/README.md)
- workflows prepare generic payloads
- adapter scripts choose the provider, model, voice, render engine, and asset host from `.env`
- unsupported providers fail fast with a clear adapter error instead of silently falling back

## What Is Adapterized

Current adapter layers:

- text generation
- image generation
- narration / TTS
- render engine
- asset hosting / image hosting / audio hosting / video hosting

Current adapter entry points:

- text: [workflows/scripts/invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)
- prompt request builder: [workflows/scripts/build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs)
- image generation: [workflows/scripts/image_generation_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/image_generation_adapters.mjs)
- narration / TTS: [workflows/scripts/tts_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/tts_adapters.mjs)
- asset hosting: [workflows/scripts/asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs)
- selector logic: [workflows/scripts/adapter_config.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/adapter_config.mjs)
- local render worker: [infra/render-worker/app.py](/Users/rajchodisetti/n8n-insta/infra/render-worker/app.py)

## Current Support Matrix

Implemented today:

- text generation: `openai`
- image generation: `openai`
- narration / TTS: `openai`
- render provider: `local_ffmpeg`
- asset host: `google_cloud_storage`
- asset host: `object_storage`

Pluggable but not implemented yet:

- text generation: any non-OpenAI provider you add later
- image generation: providers such as `nano`
- narration / TTS: providers such as `elevenlabs`
- render provider: providers such as `seedance`
- asset host: any CDN or storage adapter you add later

If you select a provider that is not implemented, the workflow should fail with a message like:

- `provider 'elevenlabs' is not implemented for narration`

That is intentional. It prevents half-switched pipelines.

## Selector Env Vars

These are the main knobs you change in `.env`.

### Text

- `TEXT_LLM_PROVIDER`
- `RESEARCH_LLM_PROVIDER`
- `STORYBOARD_LLM_PROVIDER`
- `CAPTION_LLM_PROVIDER`
- `TEXT_MODEL`
- `RESEARCH_MODEL`
- `STORYBOARD_MODEL`
- `CAPTION_MODEL`

Fallback compatibility:

- `OPENAI_TEXT_MODEL`
- `OPENAI_RESEARCH_MODEL`
- `OPENAI_STORYBOARD_MODEL`
- `OPENAI_CAPTION_MODEL`

### Image Generation

- `IMAGE_GENERATION_PROVIDER`
- `SCENE_IMAGE_PROVIDER`
- `POST_IMAGE_PROVIDER`
- `IMAGE_MODEL`
- `SCENE_IMAGE_MODEL`
- `POST_IMAGE_MODEL`
- `IMAGE_SIZE`
- `SCENE_IMAGE_SIZE`
- `POST_IMAGE_SIZE`
- `IMAGE_QUALITY`
- `SCENE_IMAGE_QUALITY`
- `POST_IMAGE_QUALITY`
- `IMAGE_COMPRESSION`
- `SCENE_IMAGE_COMPRESSION`
- `POST_IMAGE_COMPRESSION`
- `IMAGE_STYLE`
- `POST_IMAGE_STYLE`

Fallback compatibility:

- `OPENAI_IMAGE_MODEL`
- `OPENAI_SCENE_IMAGE_MODEL`
- `OPENAI_IMAGE_SIZE`
- `OPENAI_SCENE_IMAGE_SIZE`
- `OPENAI_IMAGE_QUALITY`
- `OPENAI_SCENE_IMAGE_QUALITY`
- `OPENAI_IMAGE_COMPRESSION`
- `OPENAI_SCENE_IMAGE_COMPRESSION`
- `OPENAI_IMAGE_STYLE`

### Narration / TTS

- `TTS_PROVIDER`
- `NARRATION_PROVIDER`
- `TTS_MODEL`
- `NARRATION_MODEL`
- `TTS_VOICE`
- `NARRATION_VOICE`
- `TTS_INSTRUCTIONS`
- `NARRATION_INSTRUCTIONS`

Fallback compatibility:

- `OPENAI_TTS_MODEL`
- `OPENAI_TTS_VOICE`
- `OPENAI_TTS_INSTRUCTIONS`

### Render

- `RENDER_PROVIDER`
- `RENDER_WORKER_MODE`
- `RENDER_WORKER_URL`
- `RENDER_WORKER_SYNC_URL`
- `RENDER_CALLBACK_URL`

Current note:

- `RENDER_PROVIDER` selects the render engine
- `RENDER_WORKER_MODE` selects how n8n talks to the worker today: `stub` or `webhook`

### Asset Hosting

- `ASSET_HOST_PROVIDER`
- `SCENE_IMAGE_HOST_PROVIDER`
- `POST_IMAGE_HOST_PROVIDER`
- `NARRATION_HOST_PROVIDER`
- `RENDER_OUTPUT_HOST_PROVIDER`
- `GOOGLE_CLOUD_STORAGE_BUCKET`
- `GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH`
- `GOOGLE_CLOUD_STORAGE_ENDPOINT`
- `GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL`

Current host implementations:

- `google_cloud_storage`
- `object_storage`

Legacy fallback:

- `IMAGE_HOST_PROVIDER`

## Which Workflow Uses Which Adapter

### Text stages

- [wf_research_and_script.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_research_and_script.json)
- [wf_storyboard_and_prompts.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_storyboard_and_prompts.json)
- [wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json)

Runtime flow:

1. workflow builds `prompt_template_data`
2. [build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) renders file-backed prompts
3. [invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs) selects the provider and executes the call

### Scene images

- [wf_asset_generation.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_asset_generation.json)
- [generate_and_rehost_scene_assets.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_scene_assets.mjs)

Runtime flow:

1. workflow prepares generic `image_request`
2. [image_generation_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/image_generation_adapters.mjs) generates the image
3. [asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs) uploads the JPEG

### Narration

- [wf_narration_generation.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_narration_generation.json)
- [generate_and_rehost_narration_audio.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_narration_audio.mjs)

Runtime flow:

1. workflow prepares generic `tts_request`
2. [tts_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/tts_adapters.mjs) generates the audio
3. [asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs) uploads the MP3

### Simple-post image

- [wf_simple_post_image_asset.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_simple_post_image_asset.json)
- [generate_and_rehost_post_image.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_post_image.mjs)

Runtime flow matches scene images, but with `POST_IMAGE_*` selector precedence.

### Reel render

- [wf_render_worker_dispatch.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_render_worker_dispatch.json)
- [wf_render_sync_completion.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_render_sync_completion.json)
- [infra/render-worker/app.py](/Users/rajchodisetti/n8n-insta/infra/render-worker/app.py)

Runtime flow:

1. workflow builds a render request with `render_provider`
2. render worker checks whether that provider is implemented
3. worker renders
4. worker uploads the MP4 through the selected host adapter path

## How To Switch a Component

### Change only the model, keep the same provider

Example: change storyboard text model.

Edit `.env`:

```env
STORYBOARD_LLM_PROVIDER=openai
STORYBOARD_MODEL=gpt-4.1-mini
```

Then recreate `n8n` and rerun the relevant smoke test.

### Change only the voice, keep the same provider

Edit `.env`:

```env
NARRATION_PROVIDER=openai
NARRATION_MODEL=gpt-4o-mini-tts
NARRATION_VOICE=echo
```

Then recreate `n8n` and rerun the narration smoke test.

### Change the asset host only

Example: keep generation local to the current adapters, move public delivery to Google Cloud Storage.

```env
ASSET_HOST_PROVIDER=google_cloud_storage
POST_IMAGE_HOST_PROVIDER=google_cloud_storage
SCENE_IMAGE_HOST_PROVIDER=google_cloud_storage
NARRATION_HOST_PROVIDER=google_cloud_storage
RENDER_OUTPUT_HOST_PROVIDER=google_cloud_storage
GOOGLE_CLOUD_STORAGE_BUCKET=your_public_bucket
GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH=/secrets/google/sa-key.json
GOOGLE_CLOUD_STORAGE_ENDPOINT=https://storage.googleapis.com
GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL=https://storage.googleapis.com
```

### Switch only one component to a future provider

Example target: ElevenLabs narration.

Step 1:

```env
NARRATION_PROVIDER=elevenlabs
NARRATION_MODEL=eleven_turbo_v2
NARRATION_VOICE=<your_voice_id>
```

Step 2:

- implement the ElevenLabs branch in [tts_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/tts_adapters.mjs)

Step 3:

- rerun `bash scripts/test_phase3_narration_generation_smoke.sh`

Until step 2 exists, the workflow should fail fast. That is the correct behavior.

## How To Add a New Adapter

### Add a new text provider

Change:

- [adapter_config.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/adapter_config.mjs)
- [invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)

Implement:

1. new provider name in `.env`
2. new `if (provider === '...')` branch in `invoke_structured_text_adapter.mjs`
3. provider-specific request/response normalization

### Add a new image provider

Change:

- [image_generation_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/image_generation_adapters.mjs)

Implement:

1. provider branch
2. normalize output to:
   - `provider`
   - `request`
   - `revisedPrompt` or `null`
   - `binary`

### Add a new narration provider

Change:

- [tts_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/tts_adapters.mjs)

Implement:

1. provider branch
2. normalize output to:
   - `provider`
   - `request`
   - `binary`
   - `estimatedDurationSeconds`

### Add a new asset host

Change:

- [asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs)
- [infra/render-worker/app.py](/Users/rajchodisetti/n8n-insta/infra/render-worker/app.py) if the render worker also needs that host

Implement:

1. upload branch
2. return normalized result shape:
   - `mode`
   - `url`
   - `objectKey`
   - provider-specific metadata

### Add a new render provider

Change:

- [wf_render_worker_dispatch.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_render_worker_dispatch.json) if the request shape changes
- [infra/render-worker/app.py](/Users/rajchodisetti/n8n-insta/infra/render-worker/app.py)

Implement:

1. render-provider branch
2. rendering logic
3. output upload path
4. callback payload shape

## Recommended Testing Order After Any Adapter Change

1. syntax check the modified adapter file
2. recreate the affected container if `.env` changed
3. run only the narrow smoke test for that component
4. inspect DB rows and `workflow_runs`
5. only then run the one-click or live publish path

Recommended smoke tests:

- text: `bash scripts/test_phase2_topic_to_storyboard_smoke.sh`
- captions: `bash scripts/test_phase2_caption_iteration_smoke.sh`
- scene images: `bash scripts/test_phase3_scene_asset_generation_smoke.sh`
- narration: `bash scripts/test_phase3_narration_generation_smoke.sh`
- render manifest: `bash scripts/test_phase3_render_manifest_smoke.sh`
- render dispatch: `bash scripts/test_phase3_render_worker_dispatch_smoke.sh`

## Current Reality

The architecture is adapter-first now, but the provider matrix is intentionally narrow today:

- OpenAI for text, image, and narration
- local FFmpeg for render
- ImageKit or object storage for delivery

That is the right intermediate state. The important change is that future provider work is now isolated to adapter files instead of spread across workflow JSON, helper scripts, and DB-writing logic.
