# 11 — Setup Checklist

Use this before development starts.

## Backlog status workflow

Use these statuses for every implementation item:

- `backlog` — not implemented yet
- `implemented_awaiting_test` — code/config is in place, but you still need to test it
- `complete` — you tested it successfully and it is ready for PR

Rule:

1. when I finish an item, I will document what was completed and how to test it
2. you run the test steps locally
3. after you confirm the result, I move the item to `complete`
4. once it is `complete`, I ask you to raise a PR

Current implemented items waiting for your test:

- storyboard prompt templates

## Product decisions

- [x] Platform chosen: Instagram only
- [x] Content type chosen: faceless English story Reels
- [x] Orchestrator chosen: n8n
- [x] Rendering separated from n8n
- [x] Feedback loop included in scope

## Accounts and access

### Instagram
- [x] Create or convert to professional Instagram account
  - Runbook: `14-instagram-professional-account-runbook.md`
- [ ] Prepare account for API-driven publishing workflow
- [ ] Confirm the account will be the only publishing target for v1

### n8n
- [x] Decide hosted vs self-hosted n8n
  - Current dev choice: self-hosted via Docker Compose
- [ ] Configure secrets/credentials strategy
  - Use local `.env.local` for dev and n8n credential store for runtime tokens (`INSTAGRAM_GRAPH_API_TOKEN`).
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

- [ ] Select LLM provider for research, scripts, prompts, and analysis
- [ ] Select voice provider for narration
- [ ] Select image/video providers for scene generation
- [ ] Decide whether stock media will be part of v1

## Rendering

- [ ] Decide render worker implementation language
- [ ] Decide render deployment model (local, container, server)
- [ ] Define render manifest schema
- [ ] Test one sample 9:16 render with subtitles and voiceover

## Content design

- [ ] Finalize brand tone
- [ ] Finalize narrator style
- [ ] Finalize subtitle design rules
- [ ] Finalize cover image style
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
- [ ] create storyboard prompt template
  - Implemented and awaiting your test in `prompts/storyboard_and_prompts/`
- [ ] create `storyboard_and_prompts` workflow
- [ ] store scene JSON and subtitle plan

### Assets
- [ ] integrate scene visual generation
- [ ] integrate narration generation
- [ ] persist asset references

### Rendering
- [ ] trigger render worker from n8n
- [ ] persist output URLs
- [ ] validate final files

### Publishing
- [ ] implement Instagram publish flow
- [ ] store publish metadata
- [ ] implement retry-safe publishing rules

### Insights
- [ ] create metrics collection workflow
- [ ] define 24h / 72h / 7d collection timing
- [ ] build normalized insight storage

### Reviews
- [ ] implement AI-based performance review
- [ ] generate next-content suggestions

## QA and operations

- [ ] define failure states
- [ ] define retry strategy
- [ ] add workflow logging
- [ ] add manual approval path
- [ ] add duplicate publish prevention

## Prototype success definition

V1 is complete when you can:
- submit a story topic
- generate a script
- generate a storyboard
- produce a rendered Reel package
- approve it
- publish it to Instagram
- collect a first metrics snapshot
