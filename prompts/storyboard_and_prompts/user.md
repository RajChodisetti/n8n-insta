Create a storyboard package for this Reel.

Title:
{{title}}

Category:
{{category}}

Audience-facing language:
{{content_language}}

Target duration:
{{target_duration_seconds}} seconds

Narration script:
{{narration_script}}

Script scene guidance seed:
{{script_scene_guidance_json}}

Director contract:
{{director_plan_json}}

Requirements:

- break the script into scenes that follow the narration pacing
- use the script scene guidance seed as the main guide for scene timings, narration slices, scene purpose, visual beat, source boundary, and continuity
- produce exactly one title card scene as scene 1 (is_face_image=true, ≤4 seconds) plus one content scene per entry in the script scene guide — total scenes = guide scene count + 1
- scene 1 narrates the hook or opening line from the script while the face image title card is visible — include `dialogue_lines` and `narration_text` with the hook text; also include `face_image_title` (2–5 words) for the rendered title overlay
- keep scene 1 at 4 seconds or shorter so the title card does not linger; the hook line must be short enough to fit within that window
- keep nearly the same timing windows for content scenes (scenes 2 onwards) as the script guide unless a minor refinement clearly improves clarity
- preserve each scene's `asset_type`, `dialogue_lines`, and `music_cue` from the script seed unless a small cleanup is required for clarity
- carry forward each scene's `tts_instructions` from the director contract; only fill from `tts_delivery` if a scene lacks specific instructions
- distribute duration sensibly across scenes
- write cinematic visual prompts for each scene
- make every scene feel like a film shot that supports the narration, with clear visual action, mood, and emotional progression
- keep each scene visual prompt anchored to the exact narrated beat, not just the overall topic
- preserve the script guide's core image subject, setting, and action unless a minor refinement clearly makes it more renderable
- preserve the narration perspective from the script; if the script uses victim/survivor narration, the storyboard should feel intimate and respectful without becoming graphic
- make each visual prompt specific enough that an image model would know exactly what to show in frame
- **for scene 1 only: provide `face_image_title` metadata; do not include title-placement or text-rendering instructions inside `visual_prompt`**
- each visual prompt must include focal subject, action/situation, setting, and story-specific visual evidence from the matching narration slice
- avoid generic atmosphere prompts, symbolic filler, random portraits, anonymous silhouettes, and broad "history mood" imagery unless the narration literally calls for them
- for sensitive harm, abuse, violence, coercion, or victim testimony topics, never depict graphic harm or exploitative imagery; use respectful indirect visuals only when those visuals match the narration
- keep every generated scene image text-free; the first scene's short title is `face_image_title` metadata for the renderer overlay, not text for the image model
- all visual prompts must explicitly avoid visible text, subtitles, captions, typography, labels, logos, UI, watermarks, signage, documents, newspapers, placards, speech bubbles, dialogue bubbles, thought bubbles, and any comic-style text element — do NOT include speech bubbles or bubble shapes in any visual prompt
- avoid signs, newspapers, documents, placards, interface elements, and any other blockers that could create accidental readable text
- create concise `subtitle_lines_json` only as metadata for review; do not enable burned-in subtitles or captions in the render seed
- generate one cover prompt aligned with the same visual language and with no visible text
- include render seed data that later steps can extend, with `render_manifest_seed_json.subtitles.enabled` set to `false`
- use this storyboard timing guidance: {{storyboard_timing_guidance}}
- use this narration-to-scene alignment guidance: {{narration_alignment_guidance}}
- use this render timing guidance: {{render_timing_guidance}}

Return fields:

- `storyboard_json`
- `cover_prompt`
- `subtitle_lines_json`
- `style_notes`
- `visual_style_summary`
- `render_manifest_seed_json`

Each `storyboard_json` scene must include `tts_instructions` alongside the visual prompt and timing fields.

Return only JSON.
