# 13 — API and Service Requirements

This document lists the classes of services the system will need.

## Required service categories

### 1. Workflow orchestration
- n8n instance
- credential management inside n8n
- scheduling and webhook capability

### 2. Content database
Need one persistent store for:
- content items
- scripts
- storyboards
- assets
- publish records
- metrics snapshots
- reviews

### 3. Asset storage
Need one storage layer for:
- narration audio
- generated images/videos
- final MP4 outputs
- subtitle files
- cover images

### 4. LLM service
Need one model/API for:
- topic scoring
- research summarization
- script generation
- visual prompt generation
- caption generation
- performance review generation

### 5. Voice generation service
Need one provider for:
- narration synthesis
- stable voice identity

### 6. Visual generation or sourcing layer
Need one or more providers for:
- scene image generation
- scene video generation
- optional stock media sourcing

### 7. Render worker
Need one service/process for:
- timeline assembly
- subtitle burn-in
- audio mixing
- final 9:16 export

### 8. Instagram publishing and insights access
Need professional-account-compatible integration for:
- Reel publishing
- media identifiers
- insight retrieval

## Recommended implementation mindset

Pick one provider per category for v1 where possible.
Do not overcomplicate the stack early.

## Suggested service decision template

For each provider/service, record:
- service name
- purpose
- API method
- auth method
- rate limits or quotas
- cost notes
- fallback plan

## Example internal config groups

### Core config
- environment
- default brand profile
- target durations
- default caption style

### LLM config
- primary model
- fallback model
- max tokens
- temperature settings

### Voice config
- default narrator voice ID
- speed
- style instructions

### Render config
- width
- height
- fps
- subtitle preset
- music volume default

### Publish config
- Instagram account mapping
- default posting windows
- publish enable/disable flag

