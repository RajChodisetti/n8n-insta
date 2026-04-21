# Instagram AI Storytelling Workflow — Documentation Pack

This repository contains the starter documentation for building an Instagram-only, n8n-orchestrated AI storytelling workflow.

## Objective

Long-term, build a system that can:

1. Discover or accept story ideas
2. Research and structure them into short-form scripts
3. Convert scripts into scene-by-scene storyboards
4. Generate or source visuals and narration
5. Render final 9:16 Reels
6. Publish to Instagram
7. Pull insights and improve future content

## Current MVP target

Before the full Reel pipeline, the immediate target is a simpler working loop:

1. accept one topic
2. generate one caption draft
3. generate one hashtag set
4. attach one simple image asset
5. publish one Instagram post
6. persist publish metadata

## Guiding principle

The target is **high automation with controlled quality**, not blind full automation.

Recommended operating model:
- 85–90% automated
- 10–15% human approval

## What has been decided

- Platform focus: **Instagram only**
- Long-term primary format: **Reels**
- Current MVP publish target: **simple Instagram post**
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
13. `13-provider-strategy.md`
14. `14-instagram-professional-account-runbook.md`
15. `15-delivery-and-testing-workflow.md`
16. `16-engineering-backlog.md`
17. `17-brand-identity.md`
18. `18-mvp-smoke-test-and-publish-runbook.md`

## Delivery Tracking

- Active tracker: [15-delivery-and-testing-workflow.md](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md)
- Engineering backlog: [16-engineering-backlog.md](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)
- Completed items archive: [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)

## Recommended build approach

Do not implement everything at once.

### Phase 1
- simple-post MVP
- caption + hashtags
- one image asset
- Instagram publish validation
- publish metadata persistence

### Phase 2
- topic to script to storyboard flow
- better content planning
- approval hardening

### Phase 3
- AI narration generation
- generated assets
- render worker integration

### Phase 4
- Reel publishing automation
- insights collection
- performance analysis
- recommendation engine

## Core success metric

Long-term success flow:

`story -> script -> storyboard -> assets -> reel -> publish -> analyze -> improve`

Current MVP success flow:

`topic -> caption/hashtags -> simple image -> publish -> persist`

Current local milestone:

`working MVP complete`
