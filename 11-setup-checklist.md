# 11 — Setup Checklist

Use this before development starts.

## Product decisions

- [x] Platform chosen: Instagram only
- [x] Content type chosen: faceless English story Reels
- [x] Orchestrator chosen: n8n
- [x] Rendering separated from n8n
- [x] Feedback loop included in scope

## Accounts and access

### Instagram
- [ ] Create or convert to professional Instagram account
- [ ] Prepare account for API-driven publishing workflow
- [ ] Confirm the account will be the only publishing target for v1

### n8n
- [ ] Decide hosted vs self-hosted n8n
- [ ] Configure secrets/credentials strategy
- [ ] Enable persistent storage/logging

### Storage
- [ ] Choose asset storage provider
- [ ] Define folder structure for assets and final outputs
- [ ] Confirm file retention approach

### Database
- [ ] Choose content metadata database
- [ ] Create initial schema/tables
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
- [ ] create script prompt templates
- [ ] create `research_and_script` workflow
- [ ] persist scripts to DB

### Storyboards
- [ ] create storyboard prompt template
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

