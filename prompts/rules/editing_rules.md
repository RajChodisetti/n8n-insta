# Editing Rules

Use for timing, scene order, transitions, subtitles, overlays, render manifests, and Remotion edit plans.

## Blocking

- Timelines must be contiguous, positive-duration, and close to target duration.
- Captions/subtitles are renderer metadata, not generated-image text.
- Scene 1 title-card overlay must be renderer-owned, last 2 seconds, and must not force generated text into assets.
- Do not publish renders with missing media, broken public URLs, or failed quality gates.

## Must

- Preserve scene order and narration alignment unless safety/schema correction requires a change.
- Use frame-practical timing for 30fps vertical output.
- Keep overlays inside safe areas and avoid occluding core subject matter.

## Should

- Let transitions support comprehension, not distract.
- Keep the hook visually immediate.

## Preference

- Default to simple cuts, soft cuts, or restrained motion unless a style pack calls for stronger edits.
