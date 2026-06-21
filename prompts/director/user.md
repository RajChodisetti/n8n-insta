Create a director_contract for this Reel.

Title: {{title}}
Category: {{category}}
Target duration: {{target_duration_seconds}} seconds
Scene count: {{scene_count}} scenes

Creative defaults from idea ingest:
{{creative_defaults_json}}

Narration script:
{{narration_script}}

Script scene guidance:
{{script_scene_guidance_json}}

Deliverables:

1. `voice_role` - pick one allowed voice role for the whole Reel. Use `kid` when the narrator or central character is explicitly a child, kid, school-age voice, or youthful robot child.
2. `tts_delivery` - describe the full voiceover performance: pace, emotional distance, pauses, intensity, and how the read should land.
3. `global_visual_style` - concise visual style contract: palette, lighting, composition, texture, realism, and continuity rules.
4. `visual_strategy` - high-level visual approach for storyboard to follow. Do not write final prompts.
5. `global_pacing` - how the Reel opens, builds, peaks, and closes.
6. `energy_curve` - how intensity changes across the scenes.
7. `mood_curve` - how the emotional register changes across the scenes.
8. `global_music_direction` - subtle instrumental bed: mood, instrumentation, intensity, transitions, and how it sits under narration.
9. `global_rules` - tone plus avoid rules for the whole production.
10. `scenes` - one entry per script scene, in order, with:
   - `scene_number` matching the script guidance
   - `scene_objective` - what this scene must accomplish for the viewer
   - `mood` - emotional register
   - `energy` - one of: low, medium-low, medium, medium-high, high
   - `tts_instructions` - specific delivery direction for this scene's lines
   - `visual_strategy` - high-level strategy only, not a production prompt
   - `transition_hint` - simple transition suggestion
   - `avoid` - scene-specific things that would be wrong

Strict requirements:

- preserve the script's narrative perspective and emotional stance
- do not rewrite the script
- do not create final image prompts
- do not add new facts
- carry forward any timing, music, mood, and safety boundaries from idea ingest and the script scene guide
- for sensitive victim-centered stories, keep the contract intimate, respectful, and non-graphic

Return only JSON.
