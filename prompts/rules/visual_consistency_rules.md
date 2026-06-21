# Visual Consistency Rules

Use for scene visuals, image/video prompts, cover prompts, and render-facing visual metadata.

## Blocking

- Generated visuals must not request visible text, typography, subtitles, captions, labels, logos, UI, watermarks, signage, documents, newspapers, placards, speech bubbles, or other readable text elements.
- Scene 1 must use face-image/title-card metadata only: `is_face_image=true`, `asset_type=image`, `face_image_title` of 2-5 words, and duration 4 seconds or less.
- Scene 1 generated image prompts must remain text-free; the renderer owns the title overlay.
- Scenes after scene 1 must not carry a `face_image_title`.

## Must

- Every visual prompt must identify a concrete focal subject, action or situation, setting, and story-specific evidence tied to the matching narration beat.
- Preserve safety boundaries from the source payload, script guide, and director contract.
- Keep cover prompts text-free and aligned with the same visual language as the scenes.

## Should

- Preserve a consistent visual contract across scenes unless safety or factual boundaries require a change.
- Avoid generic symbolic filler such as vague dark atmospheres or anonymous silhouettes when a concrete safe scene can carry the beat.

## Preference

- Prefer documentary-realistic, mobile-readable compositions unless the selected style pack says otherwise.
