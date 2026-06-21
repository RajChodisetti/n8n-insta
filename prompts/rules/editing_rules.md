# Editing Rules

Use for scene timing, pacing, transitions, subtitle metadata, and render seed data.

## Blocking

- Scene timings must be contiguous, start near 0 seconds, have positive durations, and end close to the target duration.
- Subtitles are metadata only in the current pipeline; `render_manifest_seed_json.subtitles.enabled` must be `false` unless a later renderer contract changes this.
- Scene 1 title-card duration must be 4 seconds or less.

## Must

- Do not add, remove, or reorder scenes when a prior scene guide or director contract already defines scene count and numbering.
- Preserve narration-aligned dialogue, timing, asset type, and music cues unless a schema or safety rule requires cleanup.
- Avoid overloading a single scene with too much narration for the visual beat.

## Should

- Transitions should support pacing and comprehension instead of distracting from narration.
- Fast hooks should move quickly, but not at the cost of clear story comprehension.

## Preference

- Default to simple cuts, match cuts, or soft cuts unless a style pack calls for more expressive editing.
