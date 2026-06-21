# 13 — Provider Strategy

This document tracks your AI and media provider selections for v1 and future upgrades.

## Adapter-First Direction

The repo is no longer designed around one permanently hardcoded provider.

Current rule:

- defaults still point at OpenAI for text, image, and narration
- defaults still point at `local_ffmpeg` for render
- defaults now point at `google_cloud_storage` for delivery
- provider choice is now resolved through adapter selectors in `.env`
- unsupported providers fail fast until their adapter branch is implemented

Reference:

- [24 — Adapter Architecture and Provider Switching](/Users/rajchodisetti/n8n-insta/docs/architecture/adapter-architecture-and-provider-switching.md)

## LLM Provider (Text Generation)

### Current Selection: OpenAI

**Current MVP approach:** default to OpenAI text models through the adapter layer, starting with cost-conscious models for workflow development and upgrading later only if quality requires it

**Use cases:**
- Topic research and script generation
- Caption and hashtag generation
- Storyboard generation
- Content analysis and recommendations

**Why OpenAI as the current default:**
- one provider across text, voice, and image generation
- simpler credential management in n8n for the MVP
- strong support for structured outputs and iterative prompt work
- easier path from simple-post MVP into later Reel automation

**Cost strategy:**
- start with lower-cost text models for MVP testing
- move to higher-quality paid models only if output quality or throughput requires it

**Upgrade path:**
- switch text provider per stage through `RESEARCH_LLM_PROVIDER`, `STORYBOARD_LLM_PROVIDER`, and `CAPTION_LLM_PROVIDER`
- switch model tier through `RESEARCH_MODEL`, `STORYBOARD_MODEL`, `CAPTION_MODEL`, or the shared `TEXT_MODEL`
- add new provider branches in [invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs) when needed

**n8n integration:**
- OpenAI node is available in n8n
- local development secrets live in the repo-root `.env`
- runtime credentials can move into the n8n credential store as the workflows harden
- Environment variable: `OPENAI_API_KEY`
- Primary selectors: `TEXT_LLM_PROVIDER`, `RESEARCH_LLM_PROVIDER`, `STORYBOARD_LLM_PROVIDER`, `CAPTION_LLM_PROVIDER`, `HASHTAG_LLM_PROVIDER`
- the production prompt text is now file-backed under [prompts/](/Users/rajchodisetti/n8n-insta/prompts/README.md), with runtime placeholder binding handled by workflow helper scripts instead of hard-coded workflow JSON
- Current local compatibility note: the new Phase 2 OpenAI code-node workflows also accept legacy `LLL_API_KEY`, and local `n8n 1.92.2` testing is currently more reliable with `N8N_RUNNERS_ENABLED=false`

---

## Voice Provider (Narration)

**Status:** `selected`

**Selection:** OpenAI Text-to-Speech through the narration adapter

**Why:**
- matches the selected LLM provider
- keeps the provider stack simpler during MVP buildout
- works for later narration automation without introducing a second vendor early

**Implementation note:**
- the narration workflow currently uses the OpenAI speech endpoint through [tts_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/tts_adapters.mjs)
- current default voice is `onyx`, with `echo` as the documented backup
- narration assets are rehosted through the asset-host adapter so later render steps can read a stable delivery URL
- future selector path:
  `NARRATION_PROVIDER`, `NARRATION_MODEL`, `NARRATION_VOICE`
- future provider example:
  ElevenLabs can be added without changing the workflow JSON once its adapter branch exists

---

## Image/Video Provider (Scene Assets)

**Status:** `selected`

**Selection:** OpenAI image generation with GPT Image models, rehosted through the asset-host adapter to a public delivery host

**Why:**
- consistent provider stack with text and TTS
- GPT image models can return JPEG output directly, which fits the Instagram publish path better than temporary OpenAI-hosted URLs
- generated assets can be rehosted to a stable public URL before Instagram publish, instead of relying on short-lived OpenAI URLs

**Current Phase 2 note:**
- `wf_simple_post_image_asset` now generates through [image_generation_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/image_generation_adapters.mjs) and uploads through [asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs)
- you can switch the simple-post generator with `POST_IMAGE_PROVIDER`
- you can switch the host with `POST_IMAGE_HOST_PROVIDER` or the shared `ASSET_HOST_PROVIDER`
- Google Cloud Storage is now the primary public-host path for generated JPG, MP3, and MP4 assets
- the generic object-storage path still exists as a fallback, but it requires `REELS_STORAGE_PUBLIC_BASE_URL` to point at a Meta-reachable public host

**Current Phase 3 note:**
- `wf_asset_generation` uses the same adapter pattern for storyboard scene images, but defaults to portrait `1024x1536` scene frames so the later render pipeline starts from Reel-oriented assets
- you can switch only that component with `SCENE_IMAGE_PROVIDER`
- you can override the scene model and quality with `SCENE_IMAGE_MODEL`, `SCENE_IMAGE_SIZE`, `SCENE_IMAGE_QUALITY`, and `SCENE_IMAGE_COMPRESSION`

---

## Stock Media in v1

**Decision:** Not included in MVP v1

**Reasoning:**
- MVP focuses on proving the publish loop end-to-end
- Static image post is sufficient for v1 proof-of-concept
- Video/reel generation deferred to Phase 3

---

## Next Steps

1. [x] Set up `OPENAI_API_KEY` or legacy `LLL_API_KEY` in the repo-root `.env`
2. [x] Choose the first local Phase 2 text model default: `gpt-4o-mini`
3. [x] Replace the Phase 2 research/storyboard scaffolds with live OpenAI calls in n8n workflow code nodes
4. [x] Configure narrator voice in the later narration workflow
5. [x] Introduce adapter-first provider and asset-host selection across text, image, narration, render, and delivery paths
6. [ ] Plan the first non-OpenAI adapter implementation based on usage, cost, and quality requirements

---

## Cost Tracking

Track your spending across providers:

| Provider | Service | Monthly Limit | Current Spend | Status |
|----------|---------|---------------|---------------|--------|
| OpenAI | LLM | MVP dev budget | — | Selected |
| OpenAI | TTS | Deferred until Reel pipeline | — | Selected |
| OpenAI | Images (GPT Image) | MVP dev budget | — | Selected |
| Google Cloud Storage | Public object delivery | Bucket + service-account cost profile | — | Selected |
| local FFmpeg | Reel render engine | Local-only | — | Selected |
