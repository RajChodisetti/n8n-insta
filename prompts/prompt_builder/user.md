Prompt file: {{prompt_path}}
Prompt label: {{prompt_label}}
Prompt step title: {{prompt_step_title}}

User idea for the revision:
{{idea}}

Additional instructions:
{{additional_instructions}}

Placeholders that must be preserved:
{{placeholders_json}}

Placeholder help:
{{placeholder_help_json}}

Locked hard rules:
{{hard_rules_json}}

Current prompt:
{{current_prompt}}

Rewrite strategy:
- Preserve the same runtime stage, placeholders, and output contract.
- Strengthen short-form video professionalism where relevant: hook sharpness, scene specificity, narration clarity, visual continuity, factual restraint, and platform-safe captioning.
- Keep any generated image/video instructions text-free unless the current prompt explicitly assigns text to the renderer.
- Do not add provider choices, model choices, API keys, env values, schemas, or new workflow behavior.

Return a complete revised_prompt plus change_summary, locked_rules_applied, and placeholders_preserved.
