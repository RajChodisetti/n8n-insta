# 11 — Setup Checklist

Use this before development starts.

## Backlog status workflow

Use these statuses for every implementation item:

- `backlog` — not implemented yet
- `implemented_awaiting_test` — code/config is in place, but you still need to test it
- `complete` — you tested it successfully and it is ready for PR

Rule:

1. when I finish an item, I will add a full entry in [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md) with what was delivered, why you are testing it, prerequisites, exact test steps, DB checks or observable outputs, pass conditions, and cleanup if needed
2. you run the test steps locally
3. after you confirm the result, I move the item to `complete`
4. once it is `complete`, I ask you to raise a PR

Current implemented items waiting for your test:

- none

Tracking links:

- Active tracker: [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md)
- Engineering backlog: [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)
- Completed items archive: [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)

## Product decisions

- [x] Platform chosen: Instagram only
- [x] Content type chosen: faceless English story Reels
  - MVP note: the first publishable loop is a simple Instagram post, not a Reel
- [x] Orchestrator chosen: n8n
- [x] Rendering separated from n8n
- [x] Feedback loop included in scope

## Accounts and access

### Instagram
- [x] Create or convert to professional Instagram account
  - Runbook: `14-instagram-professional-account-runbook.md`
- [x] Prepare account for API-driven publishing workflow
  - Completed via `wf_instagram_publish_readiness` and the readiness checks documented in `14-instagram-professional-account-runbook.md`
- [x] Confirm the account will be the only publishing target for v1
  - Target: `@mana_andhari_kathalu` (Business account)

### n8n
- [x] Decide hosted vs self-hosted n8n
  - Current dev choice: self-hosted via Docker Compose
- [ ] Configure secrets/credentials strategy
  - Use the repo-root `.env` for local dev and the n8n credential store for runtime credentials that should not stay in env.
- [x] Enable persistent storage/logging
  - Completed locally through Docker volumes in `infra/state/`

### Storage
- [x] Choose asset storage provider
  - Current dev choice: MinIO for local object storage
- [x] Define folder structure for assets and final outputs
  - Current local runtime paths use `infra/state/` and bucket bootstrap via MinIO
- [ ] Confirm file retention approach

### Database
- [x] Choose content metadata database
  - Current dev choice: PostgreSQL
- [x] Create initial schema/tables
  - Completed locally in `infra/postgres/init/001_init.sql`
- [ ] Define migration/versioning strategy

## AI providers

- [x] Select LLM provider for research, scripts, prompts, and analysis
  - Selected: **OpenAI** (free models for MVP, upgrade to premium later)
- [x] Select voice provider for narration
  - Selected: **OpenAI TTS** (consistent with LLM provider, flexible for future changes)
- [x] Select image/video providers for scene generation
  - Selected: **DALL-E 3** (via OpenAI API, consistent provider stack)
- [x] Finalize brand tone, voice, visual style, and content guidelines
  - Document: [17-brand-identity.md](/Users/rajchodisetti/n8n-insta/17-brand-identity.md)

## Rendering

- [ ] Decide render worker implementation language
- [ ] Decide render deployment model (local, container, server)
- [ ] Define render manifest schema
- [ ] Test one sample 9:16 render with subtitles and voiceover

## Content design

- [x] Finalize brand tone
  - Document: [17-brand-identity.md](/Users/rajchodisetti/n8n-insta/17-brand-identity.md)
- [x] Finalize narrator style
  - Document: [17-brand-identity.md](/Users/rajchodisetti/n8n-insta/17-brand-identity.md)
- [ ] Finalize subtitle design rules
- [x] Finalize cover image style
  - Document: [17-brand-identity.md](/Users/rajchodisetti/n8n-insta/17-brand-identity.md)
- [ ] Finalize ending signature line family

## Workflow implementation

### Story discovery
- [ ] define source inputs
- [ ] define scoring logic
- [ ] create `story_discovery` workflow

### Research and scripts
- [x] create script prompt templates
  - Completed in `prompts/research_and_script/`
- [x] create `research_and_script` workflow
  - Initial workflow scaffold created and import-tested
- [x] persist scripts to DB
  - Completed in `wf_research_script_stub`

### Storyboards
- [x] create storyboard prompt template
  - Completed in `prompts/storyboard_and_prompts/`
- [x] create `storyboard_and_prompts` workflow
  - Completed in `workflows/n8n/wf_storyboard_and_prompts.json`
- [x] store scene JSON and subtitle plan
  - Persisted in `storyboards.storyboard_json` and `storyboards.subtitle_lines_json`

### Assets
- [x] create simple post image asset path
  - Completed in `wf_simple_post_image_asset`
- [ ] integrate scene visual generation
- [ ] integrate narration generation
- [ ] persist asset references

### Rendering
- [ ] trigger render worker from n8n
- [ ] persist output URLs
- [ ] validate final files

### Publishing
- [x] generate caption and hashtag draft
  - Completed in `wf_caption_and_hashtags`
- [x] implement Instagram publish flow
  - Completed in `wf_instagram_simple_post_publish`
- [x] store publish metadata
  - Persisted in `publishes` and `workflow_runs`
- [x] implement retry-safe publishing rules
  - Implemented through atomic claiming, duplicate guards, and failure-state writeback

### Insights
- [ ] create metrics collection workflow
- [ ] define 24h / 72h / 7d collection timing
- [ ] build normalized insight storage

### Reviews
- [ ] implement AI-based performance review
- [ ] generate next-content suggestions

## QA and operations

- [x] define failure states
  - Documented in `09-instagram-publishing.md` and `18-mvp-smoke-test-and-publish-runbook.md`
- [x] define retry strategy
  - Documented and validated for the Instagram MVP publish path
- [x] add workflow logging
  - `wf_instagram_simple_post_publish` writes to `workflow_runs`
- [ ] add manual approval path
- [x] add duplicate publish prevention
  - Existing publish identifiers block duplicate claims

## Prototype success definition

Working MVP is complete when you can:
- submit a story topic
- generate a caption draft
- generate a hashtag set
- attach one image asset
- publish one Instagram post
- persist publish metadata

Current local result:
- [x] Working MVP achieved on `2026-04-20` UTC / `2026-04-19` `America/Phoenix`

Longer-term V1 is complete when you can:
- submit a story topic
- generate a script
- generate a storyboard
- produce a rendered Reel package
- approve it
- publish it to Instagram
- collect a first metrics snapshot
