# Story Package Generation V2 Contract

Status: contract asset only. This prompt is not wired into `build_prompt_request.mjs` yet.

## Role

You create a structured story package that separates research, claims, narrative strategy, clean script, caption seed, downstream constraints, and risk flags.

This contract is intended to replace loose one-pass scripting later, but it must remain compatible with the current pipeline until Session 6 adds explicit mapping.

## Inputs

- Topic: `{{topic}}`
- Category: `{{category}}`
- Audience language: `{{content_language}}`
- Target duration seconds: `{{target_duration_seconds}}`
- Confidence context: `{{confidence_context}}`
- Source notes: `{{source_notes}}`
- Creative defaults: `{{creative_defaults_json}}`
- Client/account context summary: `{{client_account_context_summary}}`
- Rule registry summary: `{{rule_registry_summary}}`
- Style pack registry summary: `{{style_pack_registry_summary}}`

## Required Output

Return only JSON matching `prompts/schemas/story_package.schema.json`.

The output must include:

- `research_brief`
- `claim_registry`
- `narrative_strategy`
- `clean_script`
- `caption_seed`
- `downstream_constraints`
- `risk_flags`

## Contract Rules

### Research Brief

- Summarize only what is supported by source notes.
- Preserve uncertainty from `confidence_context`.
- Record source boundaries and open questions instead of guessing.
- Add `do_not_claim` entries for tempting but unsupported claims.

### Claim Registry

- Every meaningful factual statement that could appear in narration or caption must be represented as a claim.
- Each claim must say what supports it, how confident it is, where it may be used, and whether it carries risk.
- Claims with insufficient support must be marked as `uncertain` or excluded from publish-facing use.

### Narrative Strategy

- Define the core angle, point of view, emotional arc, hook strategy, ending strategy, visual strategy, voice strategy, and music strategy.
- You may suggest style pack IDs from the registry, but do not require final director selection here.
- Use client/account policy as preference context only; global safety, consent, license, factuality, and platform rules still take priority.
- Do not create final storyboard scenes, production image prompts, provider choices, render instructions, music tracks, or avatar generations.

### Clean Script

- Write clean human-readable narration without provider-specific TTS tags.
- Keep `dialogue_lines` as exact slices of the spoken narration for each timed scene.
- Scene timings must be contiguous, start at 0, use positive durations, and end close to target duration.
- Keep the script breathable and easy to speak aloud.

### Caption Seed

- Create caption seed material only.
- Keep hashtags as strategy notes, not final ranked hashtags.
- Do not include unsupported claims or private details.

### Downstream Constraints

- Capture constraints that later director, storyboard, visual prompt, voice, music/SFX, render, approval, and publish stages must obey.
- Keep generated-image text rules explicit.
- Keep subtitles disabled unless a later renderer contract changes that.
- Keep provider and avatar handling as constraints, not generation instructions.

### Risk Flags

- Add blocking risk flags for unsupported facts, unclear consent, unclear music/SFX license, unsafe sensitive content, missing source boundaries, or publish blockers.
- Add non-blocking risk flags for items that need review but do not prevent contract generation.

## Hard Boundaries

- Do not remove or replace `research_and_script`.
- Do not add render generation instructions.
- Do not select music tracks.
- Do not select providers.
- Do not generate avatars.
- Do not invent facts, names, dates, outcomes, metrics, testimonials, or source URLs.
- Do not create production-ready image prompts in this stage.
