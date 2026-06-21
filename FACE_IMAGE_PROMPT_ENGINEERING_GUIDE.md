# Face Image: Prompt Engineering Guide

This guide explains what LLM prompts have changed and how to use the new face image functionality.

## Overview

Scene 1 (the opening shot) now includes a short title text (2-5 words) embedded in the image. This requires updates to how we prompt LLMs to:

1. Generate the storyboard (requesting the face image title)
2. Direct the image generation (telling image models to include the text)
3. Plan the visual style (making sure the title fits the overall design)

## Changes to Storyboard Generation Prompt

### New Required Output Field

The storyboard LLM must now provide:

```json
{
  "scene_number": 1,
  ...
  "is_face_image": true,
  "face_image_title": "Short Title"
}
```

### Key Prompt Changes

**Old instruction:**
> keep every generated scene image text-free; the renderer adds the opening title treatment separately

**New instruction:**
> keep every generated scene image text-free **except the first scene (scene 1), which must have a short, striking title text (2-5 words) centered in the middle of the image to serve as the "face image" opening hook**; this title should distill the story's core theme, intrigue, or emotional hook

### What We're Asking the Storyboard LLM

For scene 1:
- Generate a `face_image_title` field (2-5 words)
- The title should capture the core theme or emotional hook
- Include title placement guidance in the `visual_prompt`
- Example: title "The Mary Celeste" + visual prompt about a ship drifting in fog

For scenes 2+:
- No change; still text-free
- `is_face_image` should be `false`
- No `face_image_title` field

## Changes to Scene Asset Generation Prompt

### Old Prompt

> Text rules: generate clean image/video frames with no visible text of any kind. Do not put subtitles, captions, titles, letters, labels, UI, watermark, signage, documents, newspapers, or placards into the image. The opening title card is added later by the renderer, not by image generation.

### New Prompt

> Text rules: **For scene 1 (face image only): place a short, bold title text (2-5 words) centered in the middle of the frame. This is the only scene where visible text is allowed. For all other scenes: generate clean image/video frames with no visible text of any kind.** Do not put subtitles, captions, titles (except scene 1), letters, labels, UI, watermark, signage, documents, newspapers, or placards into the image.

### What We're Asking the Image Model

**For scene 1:**

When `scene_number == 1` and `face_image_title == "Story Name"`:

> Place the text "Story Name" in large, bold lettering centered horizontally and vertically in the middle of the frame. The text should be readable at mobile size, use high contrast against the background, and not obscure the main focal subject of the image.

**For scenes 2+:**

> Generate clean image/video frames with no visible text of any kind. The entire frame should be dedicated to the visual narrative without any text overlays, labels, or captions.

## Integration Pattern

### In Runtime Placeholder Substitution

When calling the scene asset generation prompt with data, structure it like this:

```json
{
  "scene_number": 1,
  "face_image_title": "The Mary Celeste",
  "narration_text": "In 1872, a ship was found drifting in the Atlantic.",
  "visual_prompt": "stormy Atlantic ocean, 19th century wooden ship drifting in fog, with 'The Mary Celeste' title text centered in the middle of the frame, cinematic, dark blue tones"
}
```

The visual_prompt now explicitly mentions where the title should go.

### Conditional Prompting

You can make the text instruction conditional:

```
{% if scene_number == 1 and face_image_title %}
Text rules: Place the text "{{face_image_title}}" in large, bold lettering centered in the middle of the frame. Text should be readable at mobile size, use high contrast, and not obscure the main focal subject.
{% else %}
Text rules: Generate clean image/video frames with no visible text of any kind.
{% endif %}
```

## For Different LLM Models

### For Vision LLMs (Claude, GPT-4V, etc.)

When generating the storyboard, the vision LLM should:

1. Understand that scene 1 is special (the "face image")
2. Create a title that captures the story's essence
3. Return it in the `face_image_title` field
4. Include placement guidance in `visual_prompt`

Example guidance:

> For scene 1 only: generate a short, impactful title (2-5 words) that will appear as text centered in the middle of the image. This title should be the story's opening hook. Return this as the "face_image_title" field. Then, in your visual_prompt, include guidance on how to place this text: "...with 'Title Text' centered in the middle of the frame..."

### For Text-to-Image Models (DALL-E, Midjourney, Flux, etc.)

When generating the image for scene 1, the text instruction is critical:

> Centered text "{{face_image_title}}" should appear in large bold letters in the middle of the frame. The text placement should be balanced and readable at mobile scale. Use a font color with high contrast to the background. The text should not obscure the main subject of the scene.

### For Video Models (Runway, various AI video tools)

If generating video for scene 1:

> A "{{face_image_title}}" title should appear as bold, centered text in the middle of the first frame of the video. This text should appear for the duration of the scene ({{scene_duration_seconds}} seconds). The text should have high contrast and remain readable throughout the video clip.

## Backward Compatibility Notes

### Old Workflows

If you have existing workflows that don't support `is_face_image` and `face_image_title`:

1. Make the storyboard LLM optional (don't require these fields yet)
2. If not present, renderer treats scene 1 as normal (no face image)
3. New content will gradually migrate to the new schema

### Gradual Rollout

1. **Phase 1:** Update schema and prompts (done)
2. **Phase 2:** Test with new storyboards (add face image titles)
3. **Phase 3:** Verify render worker handles face images correctly
4. **Phase 4:** Run on all new content

## Testing the LLM Changes

### Test Case 1: Storyboard Generation

**Input:** A topic about a ghost ship mystery

**Expected output:**
```json
{
  "storyboard_json": [
    {
      "scene_number": 1,
      "is_face_image": true,
      "face_image_title": "The Mary Celeste",
      "visual_prompt": "...with 'The Mary Celeste' title text centered in the middle of the frame...",
      ...
    },
    {
      "scene_number": 2,
      "is_face_image": false,
      ...
    }
  ]
}
```

### Test Case 2: Image Generation for Scene 1

**Input:**
```
scene_number: 1
face_image_title: "The Mary Celeste"
visual_prompt: "foggy Atlantic ocean, 19th century wooden ship drifting in fog with 'The Mary Celeste' title text centered in the middle of the frame, cinematic, dark blue tones"
```

**Expected output:** An image showing a ship in fog with "The Mary Celeste" centered and readable

### Test Case 3: Image Generation for Scene 2+

**Input:**
```
scene_number: 2
visual_prompt: "crow's nest lookout, 1872, spotting something in the distance, dramatic lighting"
```

**Expected output:** An image with NO visible text, just the visual scene

## Validation Rules

When validating LLM outputs, check:

- [ ] Scene 1 has `is_face_image: true`
- [ ] Scene 1 has `face_image_title` (2-5 words)
- [ ] Scene 1's `face_image_title` captures the story's core
- [ ] Scenes 2+ have `is_face_image: false`
- [ ] Scene 1's `visual_prompt` mentions title placement
- [ ] Scene 2+ visual prompts don't mention any text

## Prompt File Locations

| Prompt | File | Change |
|--------|------|--------|
| Storyboard system | `prompts/storyboard_and_prompts/system.md` | Scene 1 text rule |
| Storyboard user | `prompts/storyboard_and_prompts/user.md` | Requests face image title |
| Storyboard schema | `prompts/storyboard_and_prompts/response-schema.json` | New fields |
| Scene asset generation | `prompts/scene_asset_generation/prompt.md` | Scene 1 text allowed |
| Story package system | `prompts/story_package_generation/system.md` | Scene 1 text rule |
| Idea profile system | `prompts/idea_prompt_profile/system.md` | Scene 1 guidance |
| Idea profile user | `prompts/idea_prompt_profile/user.md` | Image guidance |

## Quick Examples

### Example 1: History/Mystery Story

**Topic:** The disappearance of the Princes in the Tower

**Scene 1 title:** "Lost Heirs"

**Visual:** Misty castle towers at dusk with "Lost Heirs" centered

**Narration:** "Two young princes disappeared within the Tower of London..."

### Example 2: Strange Natural Event

**Topic:** The Tunguska explosion

**Scene 1 title:** "Sky on Fire"

**Visual:** Siberian forest with trees blown over and "Sky on Fire" centered

**Narration:** "On June 30, 1908, something incredible happened over Siberia..."

### Example 3: Unsolved Mystery

**Topic:** The Voynich Manuscript

**Scene 1 title:** "Undeciphered"

**Visual:** Ancient manuscript page with mysterious symbols and "Undeciphered" centered

**Narration:** "For over 600 years, one book has baffled every expert..."

## Next Steps

1. **Update all storyboard generation calls** to handle the new fields
2. **Update image generation calls** to conditionally include the text instruction for scene 1
3. **Test with beta content** (5-10 reels)
4. **Verify render worker** handles the face image metadata
5. **Deploy to production** once all stages are working

---

For more details, see:
- `FACE_IMAGE_IMPLEMENTATION_SUMMARY.md`
- `FACE_IMAGE_QUICK_REFERENCE.md`
- `08-rendering-contract.md`
