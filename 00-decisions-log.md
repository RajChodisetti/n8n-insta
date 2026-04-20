# 00 — Decisions Log

This file captures the current decisions already made for the project.

## Decisions already made

### Platform
- We are building for **Instagram only** for now.
- Long-term primary format is **Instagram Reels**.
- MVP publish target is a **simple Instagram post** so the first working loop avoids video/render complexity.

### Content type
- Content will be **English-language**.
- Content will be **faceless**.
- Content style will be **interesting story / mystery / history / strange event storytelling**.
- Visuals will be **AI-generated and/or sourced through external providers**.
- Narration will be **AI-generated**.

### Brand approach
- Even without a face, the channel must have a recognizable signature.
- Signature will come from:
  - consistent voice
  - consistent pacing
  - consistent subtitle style
  - consistent music mood
  - consistent ending style

### Automation approach
- The system should aim for **minimum human intervention**, but not blind full automation.
- Recommended mode is **high automation with approval checkpoints**.
- Human involvement is mainly for:
  - topic approval
  - final Reel approval

### Technical approach
- Orchestrator: **n8n**
- Rendering: **external render worker or FFmpeg service** triggered by n8n
- Storage: **cloud drive or object storage**
- Data tracking: **database-backed content state tracking**
- Publishing: **Instagram API-based publishing workflow**
- Improvement loop: **Instagram insights collected and used for future recommendations**

### Build strategy
- Start with Instagram only
- Build modular workflows, not one giant workflow
- Build in phases
- Focus first on getting one complete loop working
- For MVP, prioritize `topic -> caption/hashtags -> single image -> publish` before `storyboard -> assets -> render -> Reel`

## Current target loop

`story -> script -> storyboard -> assets -> render -> approve -> publish -> analyze -> improve`

## Current MVP loop

`topic -> caption/hashtags -> simple image -> publish -> persist`
