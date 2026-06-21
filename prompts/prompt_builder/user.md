Rewrite the selected prompt file.

Prompt path:
{{prompt_path}}

Prompt label:
{{prompt_label}}

Prompt step:
{{prompt_step_title}}

Current prompt:
{{current_prompt}}

Current placeholders:
{{placeholders_json}}

Placeholder help:
{{placeholder_help_json}}

Locked rules that cannot change:
{{hard_rules_json}}

User idea:
{{idea}}

Additional instructions:
{{additional_instructions}}

Requirements:

- preserve every existing placeholder exactly
- do not add new placeholders
- keep the prompt in Markdown
- keep the same stage purpose
- improve the prompt so it follows the idea and instructions better
- if the idea is vague, make it more concrete without violating the locked rules

Return fields:

- `revised_prompt`
- `change_summary`
- `locked_rules_applied`
- `placeholders_preserved`
