# 13 — Provider Strategy

This document tracks your AI and media provider selections for v1 and future upgrades.

## LLM Provider (Text Generation)

### Current Selection: OpenAI

**Current MVP approach:** use OpenAI text models through the API, starting with cost-conscious models for workflow development and upgrading later only if quality requires it

**Use cases:**
- Topic research and script generation
- Caption and hashtag generation
- Storyboard generation
- Content analysis and recommendations

**Why OpenAI:**
- one provider across text, voice, and image generation
- simpler credential management in n8n for the MVP
- strong support for structured outputs and iterative prompt work
- easier path from simple-post MVP into later Reel automation

**Cost strategy:**
- start with lower-cost text models for MVP testing
- move to higher-quality paid models only if output quality or throughput requires it

**Upgrade path:**
- keep provider fixed on OpenAI for now
- change model tier later without changing workflow ownership
- revisit exact model choice after the first publish loop is stable

**n8n integration:**
- OpenAI node is available in n8n
- local development secrets live in the repo-root `.env`
- runtime credentials can move into the n8n credential store as the workflows harden
- Environment variable: `OPENAI_API_KEY`
- Current local compatibility note: the new Phase 2 OpenAI code-node workflows also accept legacy `LLL_API_KEY`, and local `n8n 1.92.2` testing is currently more reliable with `N8N_RUNNERS_ENABLED=false`

---

## Voice Provider (Narration)

**Status:** `selected`

**Selection:** OpenAI Text-to-Speech

**Why:**
- matches the selected LLM provider
- keeps the provider stack simpler during MVP buildout
- works for later narration automation without introducing a second vendor early

**Implementation note:**
- narration is still deferred until the Reel/video pipeline
- the voice/style source of truth is [17-brand-identity.md](/Users/rajchodisetti/n8n-insta/17-brand-identity.md)

---

## Image/Video Provider (Scene Assets)

**Status:** `selected`

**Selection:** OpenAI image generation with GPT Image models, rehosted to a public delivery host for publish delivery

**Why:**
- consistent provider stack with text and TTS
- GPT image models can return JPEG output directly, which fits the Instagram publish path better than temporary OpenAI-hosted URLs
- generated assets can be rehosted to a stable public URL before Instagram publish, instead of relying on short-lived OpenAI URLs

**Current Phase 2 note:**
- `wf_simple_post_image_asset` now generates the image with OpenAI, uploads the JPEG to ImageKit when `IMAGE_HOST_PROVIDER=imagekit`, and uses that public ImageKit URL as the live Instagram delivery asset
- the object-storage path still exists as a fallback, but it requires `REELS_STORAGE_PUBLIC_BASE_URL` to point at a Meta-reachable public host

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
4. [ ] Configure narrator voice in the later narration workflow
5. [ ] Plan upgrade timing based on usage, cost, and quality requirements

---

## Cost Tracking

Track your spending across providers:

| Provider | Service | Monthly Limit | Current Spend | Status |
|----------|---------|---------------|---------------|--------|
| OpenAI | LLM | MVP dev budget | — | Selected |
| OpenAI | TTS | Deferred until Reel pipeline | — | Selected |
| OpenAI | Images (GPT Image) | MVP dev budget | — | Selected |
| ImageKit | Public image hosting | Free tier during local live-post testing | — | Temporary |
