# Glossary

Last reviewed: 2026-06-21 at git commit `0d0515b`.

| Term | Meaning |
| --- | --- |
| n8n | Local automation/orchestration engine; workflow exports live in `workflows/n8n/`. |
| Studio UI | Local browser control panel in `studio-ui/` for topic injection, prompt/env edits, workflow launch, and recent item inspection. |
| content item | Main story/post record in `content_items`. |
| workflow run | Audit/log row in `workflow_runs` for n8n/helper execution details. |
| prompt template data | Runtime values used to fill `{{placeholder}}` tokens in prompt files. |
| creative defaults | Idea-ingest defaults stored on content payloads to guide downstream tone, visuals, narration, and music. |
| prompt profile | Older per-stage placeholder override concept retained for legacy flows. |
| director contract | Direction layer stored in `directors`, with voice, visual strategy, pacing, and music direction. |
| face image | Scene 1 opening image/title-card concept for Reel visual identity. |
| scene asset | Per-scene visual asset, usually `scene_image` and in v3 possibly `scene_video`. |
| narration audio | TTS output persisted as an `assets` row with role `narration_audio`. |
| render manifest | Canonical render payload stored in `renders.render_manifest_json`. |
| local_ffmpeg | Current render provider implemented by `infra/render-worker/app.py`. |
| object_storage | S3-compatible/MinIO asset host mode. |
| google_cloud_storage | GCS asset host mode using a mounted service-account key. |
| MinIO | Local object storage service in Docker Compose. |
| GCS | Google Cloud Storage. |
| Fish Audio | TTS provider supported by `tts_adapters.mjs`. |
| Smallest AI | TTS provider supported by `tts_adapters.mjs`. |
| Fal AI | Image/video generation provider paths in image and v3 scene asset helpers. |
| Wan | Fal-hosted video model path used by `generate_and_rehost_scene_assets_v3.mjs`. |
| `idea_approved` | Status that can be claimed by research/script workflows. |
| `script_complete` | Status after research/script output is persisted. |
| `storyboard_complete` | Status after storyboard output is persisted. |
| `assets_ready` | Status after scene/post assets are generated and hosted. |
| `narration_ready` | Status after narration audio is generated and hosted. |
| `render_manifest_ready` | Status after a render manifest exists and is ready to dispatch. |
| `render_queued` | Status after render request is queued/dispatched. |
| `render_complete` | Status after render callback/sync completion records final output. |
| `qa_approved` | Status used by publish paths after manual approval. |
| `published` | Status after Instagram publish succeeds. |
| webhook render mode | Render worker posts completion back to n8n callback webhook. |
| stub render mode | Older/non-live render path used for smoke/queue behavior. |
| `LLL_API_KEY` | Legacy fallback env var accepted by some OpenAI paths. |
