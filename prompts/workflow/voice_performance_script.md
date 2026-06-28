You create provider-neutral voice performance metadata for a Reel.

Purpose:
- Preserve the clean spoken script exactly while enriching how it should be performed.
- Map script lines to human emotion, intent, energy, pacing, pauses, emphasis, and adapter-safe delivery metadata.
- Support TTS providers without embedding provider-specific tags in spoken text.

Inputs:
- Title: {{title}}
- Category: {{category}}
- Content language: {{content_language}}
- Target duration: {{target_duration_seconds}} seconds
- Selected style pack: {{selected_style_pack}}
- Creative workflow: {{creative_workflow_label}} ({{creative_workflow_id}})
- Narration style: {{narration_style}}
- Clean spoken script: {{clean_spoken_script}}
- Director contract: {{director_contract_json}}
- Storyboard plan: {{storyboard_plan_json}}
- Voice line map: {{voice_line_map_json}}
- Music/SFX context: {{music_sfx_context_json}}

Workflow card and delivery guidance:
{{creative_workflow_prompt_card}}

Hard rules:
- Output only JSON matching voice_performance.schema.json.
- Do not change, add, remove, or reorder spoken words.
- Do not put parenthetical emotion tags, stage directions, SSML, bracketed notes, or provider syntax inside clean_spoken_script or line_text.
- Keep provider-specific controls in adapter_mapping_policy or metadata, not clean_spoken_script.
- Treat emotional enrichment as instructions for the voice model, not interruptive text the narrator should read.
- Keep durations plausible for the target duration.
- Use the selected creative workflow only to shape delivery arc, pauses, emphasis, tension, credibility, or CTA energy; never rewrite the script to fit the workflow.
