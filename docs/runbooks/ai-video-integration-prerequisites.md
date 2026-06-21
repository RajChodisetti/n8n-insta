# AI Video Integration Prerequisites

Last reviewed: 2026-06-21

This runbook tracks what the repo owner needs to do before live provider, Remotion, avatar, storage, or publishing integration work.

## Current status

For Sessions 0-20, no new account, API key, model selection, Remotion install, avatar provider setup, avatar video generation, or live publish setup is required.

The current sessions are mostly contract work: prompts, schemas, fixtures, local validators, publish gates, planning documents, and offline regression tests. They should run without paid provider calls.

## Do not do yet

- Do not install Remotion yet.
- Do not replace the current local FFmpeg render worker yet.
- Do not create avatar videos yet.
- Do not create provider accounts solely for contract fixtures.
- Do not paste API keys into docs, prompts, fixtures, or chat.
- Do not use a real person's likeness without consent metadata.

## Needed before live model/provider tests

Decide and provide credentials only when a live test session explicitly asks for them.

| Area | Decision or account needed | Typical env keys | Needed now? |
| --- | --- | --- | --- |
| Text generation | OpenAI project and chosen text model. | `OPENAI_API_KEY`, `TEXT_MODEL`, stage-specific model envs | No |
| Image generation | OpenAI image or Fal image provider choice. | `IMAGE_GENERATION_PROVIDER`, `SCENE_IMAGE_PROVIDER`, `OPENAI_API_KEY`, `FAL_AI_API_KEY` | No |
| Video generation | Fal/Wan model choice for scene video generation. | `FAL_AI_API_KEY`, `WAN_VIDEO_MODEL`, `WAN_REFERENCE_VIDEO_MODEL` | No |
| Narration/TTS | Fish Audio, Smallest AI, or OpenAI TTS choice and voice. | `NARRATION_PROVIDER`, `TTS_PROVIDER`, `FISH_AUDIO_API_KEY`, `SMALLEST_AI_API_KEY`, `OPENAI_API_KEY` | No |
| Asset hosting | Local object storage or Google Cloud Storage. | `ASSET_HOST_PROVIDER`, `GOOGLE_CLOUD_STORAGE_*`, `REELS_STORAGE_*` | No |
| Instagram publish | Instagram professional account, app/token, IG user ID. | `INSTAGRAM_GRAPH_API_TOKEN`, `INSTAGRAM_IG_USER_ID`, `INSTAGRAM_PUBLISH_ENABLED` | No |

## Needed before Remotion runtime integration

Session 17 only creates a Remotion edit-plan contract. A future runtime session should handle actual setup.

Before that future session, decide:

- whether Remotion should live inside this repo or a separate render package
- whether Remotion should run locally only or also in a cloud render path
- whether FFmpeg remains the fallback while Remotion reaches parity
- which templates/components should exist first, such as `FounderExplainerComposition`

Future install/setup commands should be run only in the Remotion runtime session. The contract fixtures may mention commands such as `npx create-video@latest`, but they are not instructions to run now.

## Needed before avatar/presenter integration

Session 18 adds a consent-gated selector contract only. Real avatar video generation comes later.

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

Until a later Remotion runtime session changes behavior, the active renderer remains `local_ffmpeg` through `infra/render-worker/app.py`.
