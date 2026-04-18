# 09 — Instagram Publishing Specification

This document defines the Instagram publishing layer for the workflow.

## Objective

Publish approved Reels to Instagram and track the resulting media identifiers for later insights collection.

## Account requirement

Use an Instagram **professional account** connected for API-based publishing and insights collection.

## Publishing prerequisites

Before publishing, the system should have:
- final MP4 ready
- caption ready
- content ID
- account credentials configured
- publish timing decision made

## Recommended workflow behavior

### Step 1 — pre-publish validation
Check:
- video file exists
- file is accessible by the publishing step
- caption is not empty
- content status is `qa_approved`
- no duplicate publish for same content ID

### Step 2 — create media container / publish flow
Use the Instagram API publishing flow supported for Reels and other professional-account media publishing.

### Step 3 — save identifiers
Persist:
- Instagram container ID if returned
- Instagram media ID
- publish timestamp
- caption used

### Step 4 — mark final state
Set:
- `publish_status = published`
- `content_status = published`

## Scheduling recommendation

For v1, start with:
- generate content any time
- publish only during selected posting windows

Use a dedicated publish queue if posting volume increases.

## Safe publishing rules

- never publish non-approved content automatically in v1
- avoid duplicate content publishing
- log every publish attempt
- retain raw API responses for debugging

## Metadata to persist

For each published Reel store:
- `content_id`
- `instagram_media_id`
- `instagram_container_id` if used
- `published_at`
- `caption_final`
- `hashtags_final`
- `publish_status`
- `publish_error` if failed

## Failure scenarios to handle

- inaccessible media file
- expired or invalid credentials
- malformed caption data
- duplicate publish attempt
- API error response

## Retry behavior

If publishing fails:
1. write failure reason
2. keep content in `qa_approved`
3. allow explicit republish attempt

## QA note

The publishing workflow should not assume rendering succeeded just because an asset URL exists.
A final file validation step is required.

## Post-publish handoff

Once publishing succeeds, the content item becomes eligible for:
- 24-hour metrics collection
- 72-hour metrics collection
- 7-day metrics collection
- performance review inclusion

