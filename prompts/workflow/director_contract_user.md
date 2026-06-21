# Create Director Contract

Create a structured `director_contract` for this Reel.

Title: `{{title}}`

Category: `{{category}}`

Target duration: `{{target_duration_seconds}}` seconds

Scene count: `{{scene_count}}`

Creative defaults from idea ingest:
{{creative_defaults_json}}

Narration script:
{{narration_script}}

Script scene guidance:
{{script_scene_guidance_json}}

Required decisions:

1. Select exactly one `selected_style_pack` from the registry summary in the system prompt.
2. Set one compatible `secondary_influence`, or use `style_pack_id: "none"` when no secondary influence is needed.
3. Fill `rejected_styles` with registry IDs that should not guide this Reel.
4. Preserve the legacy top-level director fields because existing workflow consumers still read them.
5. Include visual, voice, music/SFX, caption, edit, avatar, routing, risk, QA, and scene-level contracts.

Strict boundaries:

- Do not rewrite the narration script.
- Do not create final image/video prompts.
- Do not choose text, image, video, TTS, render, host, storage, or publish providers.
- Do not add unsupported facts or claims.
- Do not request readable text inside generated visuals.

Return only JSON.
