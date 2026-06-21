# Fish Audio Integration

## Purpose

Fish Audio is one supported narration/TTS provider for the Reel pipeline. The repo also supports OpenAI and Smallest AI TTS through the narration adapter layer.

## Current Behavior

- Provider selection comes from `NARRATION_PROVIDER` or `TTS_PROVIDER`.
- Fish Audio credentials come from `FISH_AUDIO_API_KEY` or `FISH_API_KEY`.
- Fish Audio model/voice values are read from narration env fields and director voice-role mappings.
- The narration adapter calls `https://api.fish.audio/v1/tts`.
- Current prompts may include parenthesized emotion tags such as `(curious)` or `(calm)` for Fish Audio-style delivery.

## Important Files

- [Narration instructions](../../prompts/narration_generation/instructions.md)
- [TTS adapters](../../workflows/scripts/tts_adapters.mjs)
- [Narration generation helper](../../workflows/scripts/generate_and_rehost_narration_audio.mjs)
- [Narration workflow](../../workflows/n8n/wf_narration_generation.json)
- [Prompt/model/voice tuning runbook](../runbooks/prompt-model-and-voice-tuning.md)
- [Adapter architecture](../architecture/adapter-architecture-and-provider-switching.md)

## Environment Variables

- `NARRATION_PROVIDER`
- `TTS_PROVIDER`
- `FISH_AUDIO_API_KEY`
- `FISH_API_KEY`
- `FISH_AUDIO_TTS_MODEL`
- `FISH_AUDIO_MODEL`
- `FISH_AUDIO_REFERENCE_ID`
- `FISH_AUDIO_VOICE_ID`
- role-specific voice envs used by `wf_narration_generation`

## Prompting Rules

- Use emotion tags sparingly.
- Place emotion tags before the text they affect.
- Keep one emotional direction per sentence or thought.
- Let punctuation and line breaks carry most of the rhythm.
- Do not add emotion tags that change the clean script meaning.
- Do not make business/explainer narration theatrical unless the selected style requires it.

## Future Direction

The AI video workflow plan introduces a separate `voice_performance_script` contract. That should preserve a clean script and keep provider-specific syntax in adapter mapping whenever possible.

## Validation

- `node --check workflows/scripts/tts_adapters.mjs`
- `bash scripts/test_phase3_narration_generation_smoke.sh` when a local offline-safe smoke path is available

Do not run live Fish Audio generation casually because it can call a paid external API.
