Create a research-and-script package for this Reel.

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

Creative defaults from idea ingest:
{{creative_defaults_json}}

Required output goals:

- produce 3 materially distinct hook options
- choose the single strongest hook as `selected_hook`
- write one primary narration script for the main Reel
- write one shorter backup script that preserves the same core story in a tighter form
- write one Instagram caption draft that teases the story without fully retelling it
- write one soft CTA line that invites curiosity or reflection
- write on-screen text lines that map to the main beats of the narration
- write one `music_direction` that describes the ideal subtle instrumental bed for the full Reel
- write one timed `scene_guidance_json` with the most impactful scene beats, their narration slices, production purpose, visual beat, source boundary, and music cue
- make `scene_guidance_json` the continuity source for storyboard, voiceover pacing, render timing, and downstream scene asset generation
- do not write final image prompts; storyboard is the only stage that creates production-ready visual prompts
- make the script cinematic like a short film: every scene should feel like a purposeful shot that advances emotion, tension, or revelation

Output requirements:

- keep the narration concise enough for the target runtime
- make the first 2 spoken lines especially strong
- build the narration with a clear flow: hook, context, escalation, memorable close
- preserve the narrative point of view implied by the topic and source notes; if the idea asks for victim narration, write the main narration in that victim/survivor-centered voice while staying factual and non-graphic
- preserve factual caution when certainty is low
- keep the ending memorable without overclaiming
- keep the caption compact, on-brand, and free of hashtags
- keep the CTA subtle, not salesy
- keep on-screen text short and readable
- do not plan burned-in subtitles or captions on top of the scene images; subtitles may exist as metadata only, not as video overlays
- make `scene_guidance_json` usable as a downstream production guide
- keep `scene_guidance_json` at 4 to 8 scenes
- each `scene_guidance_json` entry must include `scene_number`, `beat_label`, `start_time_seconds`, `end_time_seconds`, `duration_seconds`, `narration_text`, `dialogue_lines`, `asset_type`, `scene_purpose`, `visual_beat`, `source_boundary`, and `music_cue`
- keep scene timings contiguous from 0 seconds to near the target runtime
- make `dialogue_lines` the exact spoken voiceover lines for that scene; they must match or cleanly slice from `narration_text`
- make each `visual_beat` a concise, concrete scene seed tied to the exact narration beat, but do not phrase it like an image-generation prompt
- make each `visual_beat` name the subject, setting, action/situation, and story-specific evidence the storyboard must preserve
- make each `scene_purpose` explain what the beat accomplishes emotionally or narratively
- make each `source_boundary` state what the scene may and may not claim based on the source notes
- do not use broad symbolic substitutes when a respectful concrete scene can anchor the narrated moment
- for sensitive harm, abuse, violence, coercion, or victim testimony topics, keep imagery respectful and non-graphic; never depict assault, sexualized bodies, or sensationalized fear
- avoid generic scene seeds like "dramatic war scene", "mysterious hallway", "ominous figure", or "dark archival mood"
- do not add facts that are not supported by the source notes
- follow this timing guidance: {{timing_guidance}}
- keep the language natural for {{content_language}}

Return only JSON.
