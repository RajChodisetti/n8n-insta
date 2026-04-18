# 02 — System Architecture

## High-level architecture

The system is designed around n8n as the orchestration layer.

```text
[Trigger / Schedule / Manual Topic Input]
                  ↓
         [Story Discovery Workflow]
                  ↓
          [Topic Scoring Engine]
                  ↓
          [Optional Human Approval]
                  ↓
         [Research + Script Workflow]
                  ↓
        [Storyboard + Prompt Workflow]
                  ↓
         [Asset Generation Workflow]
                  ↓
          [Render Worker / FFmpeg]
                  ↓
          [Final Approval Gateway]
                  ↓
       [Instagram Publishing Workflow]
                  ↓
       [Metrics + Insights Collection]
                  ↓
        [Performance Review Workflow]
                  ↓
      [Recommendation / Optimization Loop]
```

## Core architecture decisions

### 1. n8n is the orchestrator, not the editor
n8n should coordinate workflows, API calls, approvals, database writes, publishing, and analytics.

n8n should not be forced to behave like a full creative editor timeline.

### 2. Rendering should be external
Final video assembly should happen in one of these ways:
- FFmpeg-based worker service
- dedicated rendering container
- custom script runner invoked by n8n

### 3. Content data should be persisted centrally
A structured content store is required for:
- tracking states
- retrying failed steps
- storing metrics
- analyzing historical performance

### 4. Workflows should be split
Use small workflows instead of one monolithic workflow.
This improves:
- debugging
- retries
- observability
- future upgrades

## Primary components

### A. n8n orchestration layer
Responsibilities:
- scheduling
- API orchestration
- approval routing
- calling LLMs and media APIs
- passing file references
- updating content records
- publishing
- collecting insights

### B. content database
Responsibilities:
- store content items
- store scripts and prompts
- store asset references
- store statuses
- store Instagram post IDs
- store insights and derived learnings

Possible choices:
- PostgreSQL
- Airtable
- Notion database
- Google Sheets for quick prototype only

### C. object storage / asset storage
Responsibilities:
- store generated narration files
- store image/video scene assets
- store final Reel MP4
- store cover images
- store subtitle files and render manifests

Possible choices:
- S3
- MinIO
- Google Drive
- Dropbox

### D. LLM layer
Responsibilities:
- topic scoring
- story summarization
- script generation
- visual prompt generation
- caption generation
- insights interpretation

### E. media generation layer
Responsibilities:
- image generation
- video generation
- stock media sourcing
- voice synthesis
- optional music suggestions

### F. render worker
Responsibilities:
- assemble visual timeline
- place clips in sequence
- add voiceover
- mix music
- apply subtitles
- render final 9:16 output

### G. Instagram API layer
Responsibilities:
- media upload/publishing workflow
- storing publish IDs
- fetching media/account insights

## State-driven model

Each content item should move through states.

Suggested lifecycle:

```text
idea_discovered
idea_scored
idea_approved
research_complete
script_complete
storyboard_complete
assets_requested
assets_ready
render_requested
render_complete
qa_approved
publish_requested
published
insights_24h_collected
insights_72h_collected
insights_7d_collected
performance_reviewed
```

## Failure handling model

Each workflow should:
- write status updates
- write last error message
- retain retry counters
- allow manual re-run from failed state

## Observability recommendations

Track these for every workflow run:
- workflow name
- content ID
- start time
- end time
- duration
- result
- failure reason
- retry count

## Security considerations

- keep API tokens in n8n credentials
- avoid hardcoding secrets in prompts or code nodes
- store external URLs and object storage links safely
- validate Instagram file specs before publish

## Extensibility

This architecture should support future expansion to:
- other content themes
- multiple brand identities
- other platforms
- multiple narrator personas

