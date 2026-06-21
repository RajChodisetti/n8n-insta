# Face Image Implementation Summary

## Overview

The first image in every Reel is now the **"face image"** — an opening shot with a short, bold title text (2-5 words) centered in the middle of the frame. This title serves as the visual hook and the face of the Reel, making the opening immediately memorable and thematically clear.

## Changes Made

### 1. **Response Schema** (`prompts/storyboard_and_prompts/response-schema.json`)

Added two new fields to each scene object in `storyboard_json`:

```json
{
  "scene_number": 1,
  "duration_seconds": 4,
  "narration_text": "...",
  "visual_prompt": "...",
  "asset_type": "image",
  "transition": "fade",
  "mood": "...",
  "music_cue": "...",
  "is_face_image": true,          // NEW: Marks this as the opening face image
  "face_image_title": "Story Title" // NEW: 2-5 word title to embed in the image
}
```

**Rules:**
- `is_face_image` is required for all scenes
- `face_image_title` is required when `is_face_image` is true
- `is_face_image` should only be true for scene 1
- `face_image_title` must be 2-5 words

### 2. **Storyboard System Prompt** (`prompts/storyboard_and_prompts/system.md`)

Updated the text policy to allow scene 1 to have embedded title text:

- **Old rule:** "generated scene images must not contain visible text; the renderer adds the opening title treatment separately"
- **New rule:** "generated scene images must not contain visible text; **except scene 1, which is the "face image" and must have a short title text (2-5 words) centered in the middle of the image to serve as the opening hook**"

Added explicit guidance for scene 1:

> scene 1 is the "face image" opening shot and **must have a short, impactful title text (2-5 words) centered in the middle of the frame** to immediately hook the viewer; this title should distill the story's core theme or intrigue

### 3. **Storyboard User Prompt** (`prompts/storyboard_and_prompts/user.md`)

Updated requirements to request the face image title:

- Scene 1 must have a "short, striking title text (2-5 words) centered in the middle of the image to serve as the "face image" opening hook"
- The title should distill the story's core theme, intrigue, or emotional hook
- Added guidance in scene visual prompt section: "**for scene 1 only: include guidance on where and how to place the face_image_title text in the middle of the frame; this title should be bold, readable, and thematically central to the story**"

### 4. **Scene Asset Generation Prompt** (`prompts/scene_asset_generation/prompt.md`)

Updated text rules to allow text only in scene 1:

> **For scene 1 (face image only): place a short, bold title text (2-5 words) centered in the middle of the frame. This is the only scene where visible text is allowed. For all other scenes: generate clean image/video frames with no visible text of any kind.**

### 5. **Story Package Generation Prompt** (`prompts/story_package_generation/system.md`)

Updated to clarify that scene 1 has embedded text:

> generated scene images must be text-free except for scene 1: **scene 1 is the "face image" opening and must have a short, bold title text (2-5 words) centered in the middle of the frame to immediately hook the viewer**; all other scenes must have no visible text, captions, labels, logos, UI, watermarks, readable documents, newspapers, signs, or placards

### 6. **Idea Prompt Profile** (`prompts/idea_prompt_profile/system.md` and `user.md`)

Updated guidance to account for scene 1 title:

- **System:** "scene 1 (the "face image") must have a short, bold title text (2-5 words) centered in the middle of the frame to immediately hook the viewer"
- **User:** "keep image-related guidance compatible with the repo rule that scene 1 (the "face image") must have a short, bold title text (2-5 words) centered in the middle of the frame, and all other scenes must be text-free"

### 7. **Rendering Contract** (`08-rendering-contract.md`)

Updated the render input contract to include face image metadata:

```json
{
  "timeline": [
    {
      "scene_number": 1,
      "asset_url": "https://...",
      "asset_type": "image",
      "start_time": 0,
      "duration_seconds": 4,
      "transition": "fade",
      "is_face_image": true,
      "face_image_title": "Story Title"
    }
  ]
}
```

Added new section "### Face Image (Scene 1)" with detailed rules:

- When `is_face_image` is true and `face_image_title` is provided, the image asset already contains the title text centered in the frame
- The renderer should **not** add any additional title overlay or treatment to scene 1
- The title text serves as the face of the reel, immediately hooking the viewer

### 8. **Data Model** (`05-data-model.md`)

Updated the storyboard_json example and documentation:

- Updated the example to show scene 1 with `is_face_image: true` and `face_image_title: "The Mary Celeste"`
- Updated the visual_prompt for scene 1 to include "with 'The Mary Celeste' title text centered in the middle of the frame"
- Added a note: "Scene 1 is always the "face image" opening, where `is_face_image` is true and `face_image_title` contains the short title text (2-5 words) that appears centered in the middle of the image frame. This title serves as the face of the reel, immediately hooking the viewer. All subsequent scenes have `is_face_image` set to false and no `face_image_title`."
- Updated the `storyboard_json` field description to mention the face image fields

### 9. **Decisions Log** (`00-decisions-log.md`)

Added a new decision entry documenting:

- **What changed:** Scene 1 now has embedded title text
- **Why:** First image is the most important visual hook; title immediately communicates the story's theme
- **What's affected:** Storyboard schema, prompts, asset generation, rendering contract, data model
- **No breaking changes:** All existing workflows continue to work
- **Implementation notes:** Title should be 2-5 words, centered, bold, readable at mobile scale

## Example

**Before:**
- Scene 1: Image of a ship drifting in fog, no text
- Renderer adds title card overlay

**After:**
- Scene 1: Image of a ship drifting in fog with "The Mary Celeste" centered in the middle of the frame (embedded in the image itself)
- Renderer does not add a title overlay (the title is already part of the asset)

## Implementation for Image Models

When generating the image for scene 1, include this guidance in the prompt:

> Place the text "{{face_image_title}}" in large, bold lettering centered horizontally and vertically in the middle of the frame. The text should be readable at mobile size, use high contrast against the background, and not obscure the main focal subject. The text serves as the opening title card for this story.

For all other scenes, continue using existing prompts with the text prohibition.

## Implementation for Render Worker

When rendering the timeline:

1. Check if `is_face_image` is true for scene 1
2. If true, do NOT add any title overlay or additional title treatment
3. The image asset already contains the centered title text
4. Render normally without additional title processing

If `is_face_image` is false or not present, render as normal.

## Backward Compatibility

- The `is_face_image` and `face_image_title` fields are new but optional in the render contract
- Existing workflows that don't include these fields will continue to work
- Render workers should gracefully handle missing fields (treat as non-face-image)
- Future: all new reels should include these fields

## Quality Checklist

When generating a face image, verify:

- [ ] Title is 2-5 words
- [ ] Title is centered in the middle of the frame
- [ ] Title uses bold, readable font
- [ ] Title text color has high contrast against the background
- [ ] Title does not obscure the main visual subject
- [ ] Title is readable at mobile scale (small phone screen)
- [ ] Title distills the story's theme or emotional hook
- [ ] All other visual rules (cinematic, focal point, etc.) still apply to the rest of the image

## Brand Value

The face image with embedded title serves as:

1. **Visual hook:** Stops the scroll with a compelling opening image
2. **Theme communicator:** Immediately conveys what the Reel is about
3. **Brand signature:** Consistent opening style across all Reels
4. **Title card:** Like a film title card, elevates the production quality
5. **Engagement driver:** A memorable opening increases watch time and saves
