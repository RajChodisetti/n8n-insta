Create a storyboard package for this Reel.

Title:
{{title}}

Category:
{{category}}

Target duration:
{{target_duration_seconds}}

Narration script:
{{narration_script}}

Requirements:

- break the script into scenes that follow the narration pacing
- distribute duration sensibly across scenes
- write cinematic visual prompts for each scene
- create concise subtitle lines that match the spoken content
- generate one cover prompt aligned with the same visual language
- include render seed data that later steps can extend

Return fields:

- `storyboard_json`
- `cover_prompt`
- `subtitle_lines_json`
- `style_notes`
- `visual_style_summary`
- `render_manifest_seed_json`

Return only JSON.
