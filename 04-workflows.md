# 04 — Workflow Specifications

This document defines the core workflows for the Instagram-only system.

## Workflow 1 — Story Discovery

### Goal
Discover high-potential story ideas for Instagram Reels.

### Trigger
- cron schedule
- manual topic request

### Inputs
- story source feeds
- manually entered topic
- category preferences
- recency window (optional)

### Steps
1. Gather candidate topics
2. Normalize titles and summaries
3. Deduplicate similar ideas
4. Score ideas
5. Save top candidates to database

### Outputs
- content candidate records
- topic score
- source references
- category tags

### Success condition
At least one approved, high-potential candidate is created.

---

## Workflow 2 — Research + Script Generation

### Goal
Turn a chosen topic into a short-form Instagram Reel script.

### Inputs
- approved story topic
- source URLs / notes
- target duration
- channel voice rules

### Steps
1. Collect source material
2. Summarize core facts
3. Determine factual confidence label
4. Generate 2–3 hook options
5. Generate primary narration script
6. Generate shorter backup version
7. Generate on-screen text suggestions
8. Generate caption draft

### Outputs
- factual summary
- confidence label
- hook options
- narration script
- short script variant
- caption draft

### Success condition
A script package is saved and marked `script_complete`.

---

## Workflow 3 — Storyboard + Prompt Pack

### Goal
Translate a script into a scene-level visual plan.

### Inputs
- script package
- desired style rules
- target runtime

### Steps
1. Break script into scenes
2. Assign duration per scene
3. Create visual prompts per scene
4. Create subtitle lines per scene
5. Create cover image prompt
6. Create render manifest seed

### Outputs
- storyboard JSON
- scene prompts
- subtitle lines
- cover prompt
- preliminary render manifest

### Success condition
Storyboard record is saved and marked `storyboard_complete`.

---

## Workflow 4 — Asset Generation

### Goal
Create or source all visual and audio assets needed for a Reel.

### Inputs
- storyboard JSON
- prompts
- voice settings
- music rules

### Steps
1. Generate or fetch scene images/videos
2. Generate narration audio
3. Select or generate music bed
4. Validate asset counts and formats
5. Save asset URLs/paths

### Outputs
- scene asset URLs
- narration audio URL
- music URL
- asset manifest

### Success condition
Assets are saved and marked `assets_ready`.

---

## Workflow 5 — Render Reel

### Goal
Assemble the final Instagram Reel.

### Inputs
- asset manifest
- render manifest
- subtitles
- cover settings

### Steps
1. Build FFmpeg or timeline instructions
2. Trigger render worker
3. Validate resulting file
4. Generate cover image if needed
5. Save final outputs

### Outputs
- final MP4
- cover image
- render logs

### Success condition
Final Reel package is saved and marked `render_complete`.

---

## Workflow 6 — QA / Approval

### Goal
Ensure only acceptable Reels are published.

### Inputs
- final Reel package
- script package
- metadata package

### Steps
1. Run automated checks
2. Optional human review
3. Approve or reject
4. If rejected, send back to relevant stage

### Outputs
- approval status
- QA notes
- next action

### Success condition
Reel is marked `qa_approved` or routed back for revision.

---

## Workflow 7 — Instagram Publish

### Goal
Publish the MVP simple post first, then extend the same stage for Reels later.

### Inputs
- publishable image URL for MVP simple-post flow
- caption
- hashtags
- publish timing

### Steps
1. Validate image URL, caption, account readiness, and publish safety switch
2. Create Instagram media container
3. Publish through the Instagram Graph API flow
4. Save Instagram media ID
5. Mark content as published

### Outputs
- media ID
- media container ID
- publish timestamp
- publish status

### Success condition
Record is marked `published`.

---

## Workflow 8 — Insights Collection

### Goal
Pull Instagram performance metrics on a timed schedule.

### Trigger times
- +24h after publish
- +72h after publish
- +7d after publish

### Inputs
- Instagram media ID
- account credentials

### Steps
1. Fetch media insights
2. Fetch account-level or contextual signals if needed
3. Normalize metrics
4. Write metrics snapshots to database

### Outputs
- metrics snapshot records
- time-windowed insight records

### Success condition
Snapshots are stored successfully.

---

## Workflow 9 — Performance Review

### Goal
Interpret outcomes and improve future content.

### Inputs
- content metadata
- historical metrics
- scripts
- hook types
- categories

### Steps
1. Compare recent posts
2. Identify high-performing hooks
3. Identify best categories
4. Detect weak performance patterns
5. Generate next-content recommendations

### Outputs
- review summary
- next-topic suggestions
- optimization notes

### Success condition
Recommendations are written back to the planning layer.
