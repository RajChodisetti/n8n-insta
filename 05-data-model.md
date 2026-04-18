# 05 — Data Model

This document defines the recommended data structures for the workflow.

## Overview

The system should persist content lifecycle data so each Reel can be tracked from idea to insight.

## Recommended entities

1. `content_items`
2. `content_sources`
3. `scripts`
4. `storyboards`
5. `assets`
6. `renders`
7. `publishes`
8. `insight_snapshots`
9. `performance_reviews`
10. `workflow_runs`

---

## 1. content_items

Represents the main unit of content.

### Fields
- `content_id` (uuid)
- `title`
- `slug`
- `category`
- `status`
- `priority_score`
- `hook_score`
- `visual_score`
- `credibility_score`
- `confidence_label` — confirmed / disputed / legend
- `target_duration_seconds`
- `brand_profile`
- `created_at`
- `updated_at`
- `approved_at`
- `published_at`

---

## 2. content_sources

Stores source references for a story.

### Fields
- `source_id` (uuid)
- `content_id`
- `source_title`
- `source_url`
- `source_type`
- `source_notes`
- `retrieved_at`
- `is_primary`

---

## 3. scripts

Stores generated script packages.

### Fields
- `script_id` (uuid)
- `content_id`
- `hook_option_1`
- `hook_option_2`
- `hook_option_3`
- `selected_hook`
- `narration_script`
- `short_script`
- `caption_draft`
- `cta_line`
- `onscreen_text_json`
- `generation_model`
- `generated_at`
- `approved_by_human` (boolean)

---

## 4. storyboards

Stores scene-level plan.

### Fields
- `storyboard_id` (uuid)
- `content_id`
- `storyboard_json`
- `cover_prompt`
- `subtitle_lines_json`
- `style_notes`
- `generated_at`

### storyboard_json suggested shape

```json
[
  {
    "scene_number": 1,
    "duration_seconds": 4,
    "narration_text": "In 1872, a ship was found drifting in the Atlantic.",
    "visual_prompt": "stormy Atlantic ocean, 19th century wooden ship drifting in fog, cinematic, dark blue tones",
    "asset_type": "video",
    "transition": "fade",
    "mood": "suspense"
  }
]
```

---

## 5. assets

Stores all source media used for the Reel.

### Fields
- `asset_id` (uuid)
- `content_id`
- `scene_number`
- `asset_role` — scene_video / scene_image / narration_audio / music / cover_image / subtitles
- `provider`
- `source_url`
- `storage_url`
- `mime_type`
- `duration_seconds`
- `width`
- `height`
- `status`
- `created_at`

---

## 6. renders

Tracks final and intermediate rendering output.

### Fields
- `render_id` (uuid)
- `content_id`
- `render_manifest_json`
- `output_video_url`
- `cover_image_url`
- `resolution`
- `aspect_ratio`
- `duration_seconds`
- `render_status`
- `render_log`
- `requested_at`
- `completed_at`

---

## 7. publishes

Tracks Instagram publishing activity.

### Fields
- `publish_id` (uuid)
- `content_id`
- `platform` — instagram
- `publish_status`
- `caption_final`
- `hashtags_final`
- `instagram_media_id`
- `instagram_container_id`
- `scheduled_for`
- `published_at`
- `publish_error`

---

## 8. insight_snapshots

Tracks metrics at specific intervals.

### Fields
- `snapshot_id` (uuid)
- `content_id`
- `platform` — instagram
- `snapshot_window` — 24h / 72h / 7d / custom
- `views`
- `plays`
- `reach`
- `likes`
- `comments`
- `shares`
- `saves`
- `engagement_rate`
- `completion_rate` (if derivable)
- `snapshot_taken_at`
- `raw_payload_json`

---

## 9. performance_reviews

Stores interpretation of results.

### Fields
- `review_id` (uuid)
- `content_id`
- `review_summary`
- `what_worked`
- `what_failed`
- `hook_analysis`
- `category_analysis`
- `visual_analysis`
- `next_recommendation`
- `review_generated_at`

---

## 10. workflow_runs

Tracks n8n or worker execution details.

### Fields
- `run_id` (uuid)
- `content_id`
- `workflow_name`
- `run_status`
- `started_at`
- `ended_at`
- `duration_ms`
- `error_message`
- `retry_count`

---

## Minimal prototype schema

For v1, you can reduce to 4 tables:
- `content_items`
- `scripts`
- `assets`
- `publishes`

But the preferred structure is the full model above.

## Recommended database choice

Best for real build:
- PostgreSQL

Best for quick visual prototyping:
- Airtable or Notion database

