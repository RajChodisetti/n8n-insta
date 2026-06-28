# 05 — Data Model

This document defines the recommended data structures for the workflow.

## Overview

The system should persist content lifecycle data so each Reel can be tracked from idea to insight.

## Recommended entities

1. `content_items`
2. `client_account_contexts`
3. `content_account_contexts`
4. `content_sources`
5. `scripts`
6. `storyboards`
7. `assets`
8. `renders`
9. `publishes`
10. `publish_approvals`
11. `insight_snapshots`
12. `performance_reviews`
13. `workflow_runs`
14. `pipeline_reviews`

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

## 2. client_account_contexts

Stores reusable per-client/per-platform policy context for brand, style, voice, music, avatar, publishing, and safety boundaries.

### Fields
- `account_context_id` (uuid)
- `account_context_key` — stable unique key for the reusable context
- `client_name`
- `brand_profile`
- `platform` — instagram
- `platform_account_id`
- `platform_account_username`
- `context_json` — full `client_account_context.schema.json` document
- `context_status`
- `created_at`
- `updated_at`

---

## 3. content_account_contexts

Stores the account context snapshot attached to a content item when it enters the pipeline.

### Fields
- `content_id` (uuid)
- `account_context_id`
- `account_context_key`
- `context_snapshot_json` — per-job snapshot of brand/style/voice/music/avatar/publishing policy
- `snapshot_version`
- `created_at`
- `updated_at`

Notes:
- Studio-created topics carry this snapshot in both `content_account_contexts` and `content_items.source_payload_json.client_account_context`.
- Client/account preferences do not override global safety, consent, license, or platform rules.

---

## 4. content_sources

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

## 5. scripts

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

## 6. storyboards

Stores scene-level plan.

### Fields
- `storyboard_id` (uuid)
- `content_id`
- `storyboard_json` — array of scene objects, where scene 1 is the opening face image/title-card scene with `is_face_image: true` and `face_image_title` containing the renderer overlay text
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
    "visual_prompt": "stormy Atlantic ocean, 19th century wooden ship drifting in fog, cinematic, dark blue tones, text-free image",
    "asset_type": "image",
    "transition": "fade",
    "mood": "suspense",
    "is_face_image": true,
    "face_image_title": "The Mary Celeste"
  }
]
```

**Note:** Scene 1 is the face image/title-card opening. `face_image_title` contains the short title text (2-5 words) that the renderer overlays centered for 2 seconds. Generated image/video prompts should remain text-free. All subsequent scenes have `is_face_image` set to false and no `face_image_title`.

---

## 7. assets

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

## 8. renders

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

## 9. publishes

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

## 10. publish_approvals

Stores selected-render or selected-asset approval records used by the publish gate.

### Fields
- `approval_id` (uuid)
- `content_id`
- `platform` — instagram
- `platform_account_id`
- `platform_account_username`
- `package_type` — instagram_reel / instagram_image_post
- `selected_video_id` — approved `renders.render_id` for Reels
- `selected_asset_id` — approved `assets.asset_id` for image posts
- `qa_status` — passed / blocked / needs_review / unknown
- `qa_result_json`
- `approval_status` — pending / approved / rejected / revoked
- `approved_by`
- `approved_at`
- `approval_note`
- `created_at`
- `updated_at`

---

## 11. insight_snapshots

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

## 12. performance_reviews

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

## 13. workflow_runs

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

## 14. pipeline_reviews

Stores opt-in human review checkpoints for generated artifacts before the next pipeline phase uses them.

### Fields
- `review_id` (uuid)
- `pipeline_run_id`
- `content_id`
- `stage_key` - source stage that generated the reviewable artifact
- `review_kind` - idea_payload / story_package / render_manifest / caption_package
- `review_status` - pending / approved
- `title`
- `summary`
- `artifact_json` - immutable-ish snapshot shown for context
- `editable_json` - editable payload shown in Studio
- `approved_json` - payload approved and applied by the reviewer
- `reviewer`
- `review_note`
- `created_at`
- `updated_at`
- `approved_at`

Notes:
- Review mode is opt-in per `pipeline_runs.summary_json.review_mode`.
- Pending reviews pause the run with `pipeline_runs.status = awaiting_review`.
- Approving a review applies edits to the concrete downstream tables (`content_items`, `scripts`, `storyboards`, `renders`, or `publishes`) before the next pending step is queued.

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
