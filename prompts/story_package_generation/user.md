Create a complete premium Reel story package.

Topic:
{{topic}}

Category:
{{category}}

Audience-facing language:
{{content_language}}

Target duration:
{{target_duration_seconds}} seconds

Confidence context:
{{confidence_context}}

Source notes:
{{source_notes}}

Character reference guidance:
{{character_reference_context}}

Required output:

- `creative_direction_json`: the core POV, emotional arc, visual strategy, narration strategy, and consistency rules
- 3 materially different hook options
- one selected hook
- one cinematic primary narration script
- one shorter backup script
- one Instagram caption draft
- one soft CTA line
- `music_direction`: a practical brief for subtle background music
- `onscreen_text_json`: short metadata-only beat labels for review, not burned-in video text
- `scene_guidance_json`: timed production scenes that carry the full narration, visual plan, and music cues
- `storyboard_json`: final storyboard scenes, matching `scene_guidance_json` scene count and timing
- `subtitle_lines_json`: metadata only, not rendered into the video
- `cover_prompt`: text-free cover image prompt
- `style_notes` and `visual_style_summary`
- `render_manifest_seed_json` with `subtitles.enabled` set to `false`

Quality bar:

- make the narration cinematic like a movie voiceover: visual, tense, emotionally paced, and easy to speak
- avoid lecture-style exposition
- keep the first two spoken lines strong
- build a clear flow: hook, context, escalation, reveal or reflection, memorable close
- each scene should feel like a purposeful shot
- every scene image prompt must be specific enough for an image model to produce the right subject, action, and setting without guessing
- when a recurring primary character is visibly present, mark that scene with `includes_primary_character: true`; otherwise mark it `false`
- preserve the implied point of view; if the idea asks for victim/survivor narration, write in that perspective while staying factual and non-graphic
- make `dialogue_lines` the exact spoken voiceover lines for each scene
- make `tts_instructions` non-empty for every scene; use a short default delivery note when there is no special direction
- make each `visual_prompt` and `image_prompt` a direct visual translation of the exact narration beat
- scene 1 must be the opening face image/title card and use `asset_type: "image"`
- scene 1 must stay 4 seconds or shorter and must include `face_image_title` with 2-5 words
- scene 1 must keep the generated image itself text-free; the hook title belongs only in `face_image_title` metadata for the renderer overlay
- scenes 2 and later must use `asset_type: "video"` unless the source notes make motion plainly inappropriate
- keep all scene image prompts text-free and free of readable documents/signs
- do not add unsupported facts

Return only JSON.
