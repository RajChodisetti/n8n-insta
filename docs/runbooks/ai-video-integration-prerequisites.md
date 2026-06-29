# AI Video Integration Prerequisites

Last reviewed: 2026-06-21

This runbook tracks what the repo owner needs to do before live provider, Remotion, avatar, storage, or publishing integration work.

## Current status

Sessions 0-20 were mostly contract/offline work. Current code-first runtime now includes reel-type selection, Remotion rendering, and a HeyGen avatar stage, but live provider calls still require explicit credentials and operator approval.

Offline checks should still run without paid provider calls. Live generation or publish tests require the relevant env keys and explicit approval.

## Do not do yet

- Do not create provider accounts solely for contract fixtures.
- Do not paste API keys into docs, prompts, fixtures, or chat.
- Do not use a real person's likeness without consent metadata.
- Do not run HeyGen, image/video, narration, render, or Instagram publish provider calls casually.

## Needed before live model/provider tests

Decide and provide credentials only when a live test session explicitly asks for them.

| Area | Decision or account needed | Typical env keys | Needed now? |
| --- | --- | --- | --- |
| Text generation | OpenAI or Anthropic project, one shared prompt-generation model, and optional caption/QA model overrides. | `OPENAI_API_KEY`, `TEXT_OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TEXT_ANTHROPIC_API_KEY`, `TEXT_LLM_PROVIDER`, `TEXT_MODEL`, `TEXT_ANTHROPIC_MODEL`, `CAPTION_MODEL`, `FINAL_QA_MODEL` | No |
| Image generation | OpenAI image or Fal image provider choice. | `IMAGE_GENERATION_PROVIDER`, `SCENE_IMAGE_PROVIDER`, `IMAGE_OPENAI_API_KEY`, `SCENE_IMAGE_OPENAI_API_KEY`, `FAL_AI_API_KEY` | No |
| Video generation | Fal Veo 3.1 Fast model choice for storyboard image-to-video scene generation. | `FAL_AI_API_KEY`, `SCENE_VIDEO_FAL_AI_API_KEY`, `VEO_VIDEO_MODEL`, `VEO_REFERENCE_VIDEO_MODEL`, `VEO_VIDEO_RESOLUTION`, `VEO_VIDEO_DURATION_SECONDS` | No |
| Narration/TTS | Fish Audio, Smallest AI, or OpenAI TTS choice and voice. | `NARRATION_PROVIDER`, `TTS_PROVIDER`, `NARRATION_FISH_AUDIO_API_KEY`, `NARRATION_SMALLEST_AI_API_KEY`, `NARRATION_OPENAI_API_KEY` | No |
| Avatar video | HeyGen account, avatar ID, voice ID, and consent policy. | `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `HEYGEN_VOICE_ID`, `HEYGEN_AVATAR_CONSENT_RECORD_URI` | Only for live avatar runs |
| Asset hosting | Local object storage or Google Cloud Storage. | `ASSET_HOST_PROVIDER`, `GOOGLE_CLOUD_STORAGE_*`, `REELS_STORAGE_*` | No |
| Instagram publish | Instagram professional account, app/token, IG user ID. | `INSTAGRAM_GRAPH_API_TOKEN`, `INSTAGRAM_IG_USER_ID`, `INSTAGRAM_PUBLISH_ENABLED` | No |

## Remotion runtime

Remotion now lives in this repo at `infra/remotion-renderer/` and is the default code-first render provider. The FFmpeg worker remains in `infra/render-worker/` as rollback fallback until parity is documented.

Operator checks:

- ensure Docker can build the `remotion-renderer` service
- use `REMOTION_RENDER_STUB=true` only for offline smoke checks
- keep `RENDER_WORKER_SYNC_URL=http://remotion-renderer:8081/render-sync` for default code-first runs
- switch to the FFmpeg endpoint only as an intentional rollback

## Needed before live avatar generation

Before live avatar/provider work, collect:

- consent status
- consent record URI or internal record ID
- allowed use cases
- disallowed use cases
- usage restrictions and expiration if any
- presenter profile metadata
- provider avatar ID if a provider is chosen
- provider voice ID if a provider voice is chosen
- provider account/API key only when live generation is approved

No avatar route should publish directly. Avatar output should be treated as an asset route that still goes through QA and selected-render approval.

Uploaded character-reference images are not consent records. They can help future visual generation, but they do not prove likeness, voice, or endorsement rights.

## Needed before live publish testing

Confirm:

- the Instagram account is a professional account
- the app/token has the required permissions
- the selected platform account matches the client/account context
- `INSTAGRAM_PUBLISH_ENABLED=true` is intentionally set for the test
- a selected-render approval exists for the exact render
- the output video URL is public and non-local

## Secret handling

- Keep secrets in local env files or the existing secure setup flow, not in docs or fixtures.
- Do not open or print `.env`, `.env.bak.*`, `infra/.env`, or `sa-key.json` during normal contract work.
- When adding a new required env key, update `.env.example` or the appropriate runbook without values.

## Current fallback

The active code-first renderer is Remotion. `local_ffmpeg` through `infra/render-worker/app.py` remains the fallback path.
