# Instagram AI Storytelling Workflow — Documentation Pack

This repository contains the starter documentation for building an Instagram-only, n8n-orchestrated AI storytelling workflow for faceless Reel creation.

## Objective

Build a system that can:

1. Discover or accept story ideas
2. Research and structure them into short-form scripts
3. Convert scripts into scene-by-scene storyboards
4. Generate or source visuals and narration
5. Render final 9:16 Reels
6. Publish to Instagram
7. Pull insights and improve future content

## Guiding principle

The target is **high automation with controlled quality**, not blind full automation.

Recommended operating model:
- 85–90% automated
- 10–15% human approval

## What has been decided

- Platform focus: **Instagram only**
- Primary format: **Reels**
- Content style: **English, faceless, AI-narrated, visually cinematic interesting stories**
- Brand identity: **consistent voice, pacing, subtitle style, and ending signature**
- Orchestrator: **n8n**
- Video rendering: **external render worker / FFmpeg service triggered by n8n**
- Storage: **cloud drive or object storage**
- Data tracking: **content database + metrics history**
- Improvement loop: **Instagram insights are analyzed and fed back into the topic/script generator**

## Suggested folder usage

Read in this order:

1. `01-product-overview.md`
2. `02-architecture.md`
3. `03-content-strategy.md`
4. `04-workflows.md`
5. `05-data-model.md`
6. `06-n8n-build-plan.md`
7. `07-prompt-library.md`
8. `08-rendering-contract.md`
9. `09-instagram-publishing.md`
10. `10-insights-and-feedback-loop.md`
11. `11-setup-checklist.md`
12. `12-roadmap.md`

## Recommended build approach

Do not implement everything at once.

### Phase 1
- Topic discovery
- Research + script
- Storyboard generation
- Manual asset generation
- Manual render review

### Phase 2
- AI narration generation
- Automated asset generation
- Render worker integration

### Phase 3
- Instagram publishing automation
- Metadata persistence
- Insights collection

### Phase 4
- Performance analysis
- Recommendation engine
- Semi-autonomous content planning

## Core success metric

The system is successful when it can produce a repeatable flow:

`story -> script -> storyboard -> assets -> reel -> publish -> analyze -> improve`

