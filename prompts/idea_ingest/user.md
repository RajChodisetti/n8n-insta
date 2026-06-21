Convert this abstract idea into a topic injection payload.

Abstract idea:
{{abstract_idea}}

Allowed confidence labels:
{{allowed_confidence_labels_json}}

Allowed target duration range:
- minimum: {{target_duration_min_seconds}}
- maximum: {{target_duration_max_seconds}}
- default when unclear: {{target_duration_default_seconds}}

Requirements:

- create a clean title
- choose a practical category
- choose a conservative confidence label
- write a short summary of the story angle
- produce notes that will help the research-and-script stage
- preserve the intended storytelling approach from the abstract idea, including narrator point of view, emotional stance, visual boundaries, pacing, and music mood
- produce `creative_defaults` that downstream v1 stages can follow without a separate idea prompt-profile call
- if the idea implies a specific perspective such as victim narration, witness narration, investigative narration, or first-person testimony, write that clearly into `context`
- keep `source_urls` empty unless the user explicitly included real URLs
- use `context` for caveats, open questions, or constraints

Return fields:

- `title`
- `category`
- `confidence_label`
- `target_duration_seconds`
- `summary`
- `notes`
- `source_urls`
- `context`
- `creative_defaults`

`creative_defaults` must include:

- `narrative_perspective` - the intended point of view, such as first-person survivor, witness, investigator, or documentary narrator
- `voice_role_hint` - the kind of voice performance this idea needs
- `tone` - the writing and production tone
- `narrator_style` - how the voiceover should feel
- `visual_strategy` - high-level visual approach only, not image prompts
- `pacing_strategy` - how the story should open, build, and close
- `mood_curve` - the emotional progression
- `energy_curve` - the intensity progression
- `music_mood` - the ideal background music mood
- `avoid_rules` - production boundaries that must propagate through the workflow
