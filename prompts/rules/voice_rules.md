# Voice Rules

Use for narration, dialogue lines, TTS instructions, and voice performance metadata.

## Blocking

- `dialogue_lines` must match or cleanly slice from the spoken `narration_text` for the same scene.
- Do not drop, reorder, or add narration beats between the clean script and scene-level dialogue.

## Must

- Preserve a clean human-readable narration script.
- Keep generic voice performance metadata provider-neutral; use provider-specific emotion syntax only in adapter-specific mapping or runtime instructions.
- Each scene should carry narration-aligned delivery or TTS instructions that describe emotion, pacing, and energy without changing the facts.
- Do not make business, product, or explainer narration theatrical unless the selected style requires it.

## Should

- Keep narration breathable for a spoken Reel with varied sentence length and natural pauses.
- Use performance cues only when they improve delivery clarity, and keep clean spoken text free of tags.

## Preference

- Default to human, grounded, concise delivery rather than announcer-style narration.
