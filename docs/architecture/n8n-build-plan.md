# 06 — n8n Build Plan

This document maps the product into concrete n8n workflow design.

## n8n design principles

- keep workflows modular
- centralize shared config in one place
- use explicit content IDs across all workflows
- store all major outputs after every stage
- route failures into retryable states

## Core workflows to create in n8n

### Workflow A — `story_discovery`

#### Nodes
1. Trigger / Cron
2. Source fetch nodes
3. Normalize items (Code node)
4. Deduplicate candidates (Code node)
5. LLM scoring request (HTTP Request / AI node)
6. Parse scores
7. Save top candidates to DB
8. Optional notify for approval

#### Output
Candidate topics written to `content_items`

---

### Workflow B — `research_and_script`

#### Trigger
Manual execution or webhook from approval step

#### Nodes
1. Fetch approved content item
2. Fetch source materials
3. Combine source text
4. LLM prompt: factual summary + script + hooks
5. Parse response
6. Save script package
7. Update content status to `script_complete`

#### Output
Script package saved

---

### Workflow C — `storyboard_and_prompts`

#### Nodes
1. Fetch script package
2. LLM prompt: storyboard JSON + cover prompt + subtitles
3. Parse structured output
4. Save storyboard
5. Update status to `storyboard_complete`

#### Output
Scene breakdown package

---

### Workflow D — `asset_generation`

#### Nodes
1. Fetch storyboard
2. Split into scenes
3. For each scene call visual provider API
4. Merge scene asset results
5. Generate narration audio
6. Fetch/select music
7. Save all asset references
8. Update status to `assets_ready`

#### Notes
Use sub-workflows or batching to avoid timeouts when generating multiple assets.

---

### Workflow E — `render_reel`

#### Nodes
1. Fetch asset manifest
2. Build render manifest JSON
3. Send render request to worker
4. Wait / poll for render completion
5. Save final MP4 + cover image URLs
6. Update status to `render_complete`

#### Recommendation
Use a webhook or polling callback from render worker to avoid long-running n8n executions where possible.

---

### Workflow F — `qa_and_approval`

#### Nodes
1. Fetch final render package
2. Run automated validation checks
3. Send review summary to user channel if needed
4. Branch on approve/reject
5. Update status accordingly

#### Automated checks
- video exists
- duration within target band
- 9:16 aspect ratio
- narration present
- caption present
- subtitles present

---

### Workflow G — `instagram_publish`

#### Nodes
1. Fetch approved publish package
2. Validate caption and file
3. Upload/publish via Instagram API steps
4. Save media/container IDs
5. Update publish record
6. Update content status to `published`

---

### Workflow H — `collect_insights`

#### Nodes
1. Trigger by schedule or delayed execution
2. Query published content pending snapshots
3. Fetch Instagram metrics
4. Normalize payload
5. Save snapshot records
6. Update status flags

---

### Workflow I — `performance_review`

#### Nodes
1. Fetch recent content + metrics
2. Aggregate performance inputs
3. LLM prompt: what worked and next recommendations
4. Save review
5. Optionally queue new topic patterns

---

## Suggested utility workflows

### 1. `retry_failed_content_step`
Re-run a failed step for a given content ID.

### 2. `generate_single_scene_asset`
Reusable scene-level generation workflow.

### 3. `render_status_callback`
Webhook endpoint for render worker completion.

### 4. `manual_topic_ingest`
Quick form/webhook to submit topic ideas manually.

## Shared configuration to maintain

Keep these in env vars or config DB:
- model names
- default narration voice
- target reel durations
- subtitle style name
- output storage paths
- Instagram account config
- brand rules

## Recommended n8n conventions

### Naming
Use clear names:
- `wf_story_discovery`
- `wf_research_and_script`
- `wf_storyboard_and_prompts`
- `wf_asset_generation`
- `wf_render_reel`
- `wf_instagram_publish`

### IDs
Pass `content_id` through every workflow.

### Logging
Log the following at each major step:
- content ID
- workflow name
- step name
- outcome
- error details if any

### Error handling
Use error branches and persist errors to database instead of silently failing.

## Prototype recommendation

### V1 in n8n should include
- manual topic input
- script generation
- storyboard generation
- asset generation placeholders
- render request creation
- manual approval

### V2 should include
- Instagram publish
- metrics collection
- automated recommendations
