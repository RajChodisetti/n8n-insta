# Face Image Quick Reference

## What is the Face Image?

The **face image** is the first scene (scene 1) in a Reel, and it now must have a short, bold title text (2-5 words) centered in the middle of the frame. This title is **embedded in the image itself** as part of the generation, not added later by the renderer.

## Key Rules

| Aspect | Rule |
|--------|------|
| **Which scene?** | Scene 1 only (the opening) |
| **Title length** | 2-5 words exactly |
| **Title placement** | Centered horizontally and vertically in the middle of the frame |
| **Title style** | Bold, high-contrast, readable at mobile scale |
| **Other scenes** | Remain completely text-free (no changes) |
| **Renderer behavior** | Do NOT add title overlays for scene 1; title is already embedded |

## Schema Fields

Every scene object now includes:

```json
{
  "is_face_image": true,           // true for scene 1, false for all others
  "face_image_title": "Story Name" // 2-5 word title; required when is_face_image is true
}
```

## For LLM Storyboard Prompts

When generating scene 1, you will receive:
- `is_face_image: true`
- Request to provide `face_image_title`

The title should distill the story's core theme or emotional hook. Examples:

| Story | Face Image Title |
|-------|-----------------|
| Ghost ship Mystery | The Mary Celeste |
| Hidden treasure | Buried Fortune |
| Unsolved disappearance | The Final Day |
| Strange weather event | Sky on Fire |
| Historical scandal | Secrets Exposed |

## For Image Generation Prompts

**Scene 1 prompt modification:**

> ...
> **Text instruction:** Place the text "{{face_image_title}}" in large, bold lettering centered in the middle of the frame. Text should be readable on mobile, use high contrast, and not obscure the main focal subject.
> ...

**All other scenes (2+):**

> Generate clean image/video frames with no visible text of any kind. Do not put subtitles, captions, titles, letters, labels, UI, watermark, signage, documents, newspapers, or placards into the image.

## For Render Workers

When processing the render manifest:

```json
{
  "timeline": [
    {
      "scene_number": 1,
      "asset_url": "https://...",
      "is_face_image": true,
      "face_image_title": "Story Title"
    },
    {
      "scene_number": 2,
      "asset_url": "https://...",
      "is_face_image": false
    }
  ]
}
```

**Rendering rules:**
- If `is_face_image` is true: use the asset as-is (title already embedded)
- Do NOT add any title overlay or burn-in for scene 1
- Render all scenes normally; no special processing needed

## Examples

### Good Face Images

✅ Story about a shipwreck, title "The Mary Celeste" centered on a foggy ocean scene
✅ Story about a buried treasure, title "Buried Fortune" centered on a forest/excavation scene
✅ Story about a mysterious disappearance, title "The Final Day" centered on an abandoned location

### Bad Face Images

❌ Scene 1 with no title text
❌ Scene 1 with title in a corner (not centered)
❌ Scene 1 with 6-word title
❌ Scene 1 with low-contrast title that's hard to read
❌ Scene 1 with title obscuring the main visual subject
❌ Scene 2+ with visible text (should be text-free)

## Checklist for Review

- [ ] Scene 1 has `is_face_image: true`
- [ ] Scene 1 has `face_image_title` (2-5 words)
- [ ] Scenes 2+ have `is_face_image: false`
- [ ] Scene 1 image shows title centered in frame
- [ ] Title is bold and readable
- [ ] Title has high contrast against background
- [ ] Title doesn't obscure main visual content
- [ ] All scenes 2+ are text-free
- [ ] Title distills the story's theme

## Files Changed

| File | Change |
|------|--------|
| `prompts/storyboard_and_prompts/response-schema.json` | Added `is_face_image` and `face_image_title` fields |
| `prompts/storyboard_and_prompts/system.md` | Updated text policy for scene 1 |
| `prompts/storyboard_and_prompts/user.md` | Added face image title request |
| `prompts/scene_asset_generation/prompt.md` | Allow text only in scene 1 |
| `prompts/story_package_generation/system.md` | Clarified scene 1 text rule |
| `prompts/idea_prompt_profile/system.md` | Updated profile guidance |
| `prompts/idea_prompt_profile/user.md` | Updated profile guidance |
| `08-rendering-contract.md` | Added face image metadata and rules |
| `05-data-model.md` | Updated storyboard schema example |
| `00-decisions-log.md` | Added decision entry |
| `FACE_IMAGE_IMPLEMENTATION_SUMMARY.md` | Full implementation guide |

## Support

For questions about face image implementation, see:
- `FACE_IMAGE_IMPLEMENTATION_SUMMARY.md` — Full details
- `08-rendering-contract.md` — Render contract specifics
- `05-data-model.md` — Data schema reference
- `00-decisions-log.md` — Decision rationale
