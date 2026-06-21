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
| voice performance script | Contract-only Session 10 output that keeps clean narration text separate from line-level tone, pace, pause, emphasis, pronunciation, duration, and music ducking metadata. |
| clean spoken script | The exact words intended for narration, without provider-specific tags or delivery metadata inserted. |
| music/SFX plan | Contract-only Session 11 output that describes background music, sparse SFX, ducking, and license requirements without selecting final providers or storage. |
| license status | Catalog field that records whether a music/SFX asset is documented, licensed, public domain, CC0, or unknown. Unknown status blocks publish. |
| final QA result | Contract-only Session 12 output that records package readiness, blocking issues, non-blocking issues, upstream fix stages, and publish requirements. |
| blocking issue | QA issue that must prevent publish until its upstream fix stage resolves it. |
| publish approval | Session 13 approval record in `publish_approvals` tying QA pass and human approval to a selected render or asset for a specific Instagram account. |
| client/account context | Session 14 policy snapshot that carries brand, style, voice, music, avatar, publishing, and safety boundaries for a specific client/platform account. Stored in `client_account_contexts`, `content_account_contexts`, and Studio-created `source_payload_json.client_account_context`. |
| model provider router | Contract-only Session 15 planner that recommends provider/model candidates, fallbacks, constraints, and assumptions without changing adapter selection or calling providers. |
| model route | Structured `model_provider_router` output shaped by `prompts/schemas/model_route.schema.json`; planning data only, not active runtime configuration. |
| face image | Scene 1 opening image/title-card concept for Reel visual identity. |
| scene asset | Per-scene visual asset, usually `scene_image` and in v3 possibly `scene_video`. |
| narration audio | TTS output persisted as an `assets` row with role `narration_audio`. |
| render manifest | Canonical render payload stored in `renders.render_manifest_json`. |
| render manifest v2 | Contract-only Session 16 bridge that defines a renderer-neutral timeline, assets, captions, overlays, safe areas, export settings, and FFmpeg lowering preview. |
| FFmpeg compatibility preview | `render_manifest_v2` section showing how the renderer-neutral contract can lower to the current local FFmpeg render-worker request shape. |
| Remotion edit plan | Contract-only Session 17 plan that describes a Remotion-compatible composition, frame-based sequences, captions, overlays, lower thirds, audio, transitions, export settings, and local FFmpeg fallback without installing Remotion. |
| duration in frames | Integer frame length used by the Remotion edit plan; derived from seconds multiplied by composition FPS. |
| avatar presenter selector | Contract-only Session 18 stage id for deciding whether avatar/presenter output is allowed as an asset route, with consent and disclosure gates. The prompt file is `prompts/workflow/avatar_video_selector.md`. |
| presenter profile | Structured profile containing consent status, consent record URI, allowed/disallowed use cases, usage restrictions, provider avatar ID, provider voice ID, disclosure policy, and asset-route policy. |
| consent record URI | Internal or external reference to the consent artifact that permits a likeness, voice, or approved synthetic presenter use. It is metadata, not a character-reference image. |
| avatar asset route | Avatar/presenter output path that may create an asset for rendering later; it is not a publish route and still requires final QA and selected-render approval. |
| AI video contract regression suite | Offline Session 19 Node runner at `scripts/validate_ai_video_contract_regressions.mjs` that executes the fixture validators for prompt contracts and publish blockers without Docker or provider calls. |
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
