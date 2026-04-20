# 09 — Instagram Publishing Specification

This document defines the Instagram publishing layer for the workflow.

## Objective

Publish approved Reels to Instagram and track the resulting media identifiers for later insights collection.

## MVP publishing target

Before automating Reels, the first working publish path should be a simple Instagram post:

- one image
- one caption
- one hashtag set

Reel publishing remains part of the longer-term plan, but it is not the shortest path to a working MVP.

## Account requirement

Use an Instagram **professional account** connected for API-based publishing and insights collection.

## Publishing prerequisites

Before publishing, the system should have:
- one publishable image ready for the MVP path
- caption ready
- hashtags ready
- content ID
- account credentials configured
- publish timing decision made

## Recommended workflow behavior

### Step 1 — pre-publish validation
Check:
- image asset exists
- image URL is public and fetchable by Meta
- image format is JPEG for the MVP simple-post path
- caption is not empty
- content status is `assets_ready` for MVP, or `qa_approved` once approval is added
- no duplicate publish for same content ID
- live publishing is explicitly enabled in env

### Step 2 — create media container / publish flow
For the current MVP simple-post path:

- discover the linked Facebook Page and Instagram professional account
- create the image container with `POST /<IG_ID>/media`
- poll `/<IG_CONTAINER_ID>?fields=status_code`
- publish with `POST /<IG_ID>/media_publish`
- check `/<IG_ID>/content_publishing_limit` before attempting the publish call

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

- inaccessible image URL
- non-JPEG asset for the MVP simple-post path
- expired or invalid credentials
- malformed caption data
- duplicate publish attempt
- publish safety switch still disabled
- API error response

## Retry behavior

If publishing fails:
1. write failure reason
2. keep content in its current pre-publish state
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
