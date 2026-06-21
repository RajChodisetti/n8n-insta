#!/usr/bin/env node

export const PROMPT_PROFILE_ALLOWED_FIELDS = Object.freeze({
  research_and_script: Object.freeze([
    'content_language',
    'brand_tone',
    'narrator_style',
    'ending_signature_family',
    'language_guidance',
    'timing_guidance',
  ]),
  storyboard_and_prompts: Object.freeze([
    'content_language',
    'brand_tone',
    'visual_style_rules',
    'subtitle_style_rules',
    'language_guidance',
    'storyboard_timing_guidance',
    'narration_alignment_guidance',
    'render_timing_guidance',
  ]),
  caption_and_hashtags: Object.freeze([
    'content_language',
    'brand_tone',
    'language_guidance',
  ]),
  scene_asset_generation: Object.freeze([
    'content_language',
    'style_notes',
    'scene_timing_guidance',
    'story_alignment_guidance',
  ]),
  narration_generation: Object.freeze([
    'content_language',
    'narration_style',
    'narration_timing_guidance',
    'background_music_direction',
  ]),
  post_image_generation: Object.freeze([
    'content_language',
    'cover_prompt_direction',
    'style_notes',
    'story_alignment_guidance',
  ]),
});

export const PROMPT_PROFILE_STAGE_KEYS = Object.freeze(Object.keys(PROMPT_PROFILE_ALLOWED_FIELDS));

function normalizeTrimmedString(value) {
  return String(value ?? '').trim();
}

export function normalizePromptProfile(profile = {}) {
  const input = profile && typeof profile === 'object' ? profile : {};
  const normalized = {
    profile_summary: normalizeTrimmedString(input.profile_summary),
  };

  for (const stageKey of PROMPT_PROFILE_STAGE_KEYS) {
    const stageInput = input[stageKey];
    const stageOverrides = {};
    if (stageInput && typeof stageInput === 'object' && !Array.isArray(stageInput)) {
      for (const field of PROMPT_PROFILE_ALLOWED_FIELDS[stageKey]) {
        const value = normalizeTrimmedString(stageInput[field]);
        if (value) {
          stageOverrides[field] = value;
        }
      }
    }
    normalized[stageKey] = stageOverrides;
  }

  return normalized;
}

export function hasPromptProfileOverrides(profile = {}) {
  const normalized = normalizePromptProfile(profile);
  if (normalized.profile_summary) {
    return true;
  }
  return PROMPT_PROFILE_STAGE_KEYS.some((stageKey) => Object.keys(normalized[stageKey] || {}).length > 0);
}
