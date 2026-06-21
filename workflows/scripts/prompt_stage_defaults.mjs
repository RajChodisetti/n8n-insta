#!/usr/bin/env node

import { normalizePromptProfile } from './prompt_profile_contract.mjs';

const FIXED_PIPELINE_CONTENT_LANGUAGE = 'English';
const DEFAULT_RULE_REGISTRY_SUMMARY = 'Use the global rule registry concepts: brand_safety, visual_consistency, voice, music_sfx, avatar, editing, provider_routing, platform_publishing, and approval. Treat blocking rules as publish blockers.';
const DEFAULT_STYLE_PACK_REGISTRY_SUMMARY = 'Known style pack IDs include founder_explainer, cinematic_problem_solution, fast_reel_hook, product_demo_walkthrough, before_after_transformation, client_testimonial_case_study, educational_mini_lesson, meme_relatable_pain_point, premium_brand_film, local_business_promo, avatar_sales_outreach, and ugc_style_product_pitch.';

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function compactList(value = []) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    : [];
}

function summarizeClientAccountContext(context = {}) {
  const client = plainObject(context.client);
  const platformAccount = plainObject(context.platform_account);
  const brandPolicy = plainObject(context.brand_policy);
  const stylePolicy = plainObject(context.style_policy);
  const voicePolicy = plainObject(context.voice_policy);
  const musicPolicy = plainObject(context.music_policy);
  const avatarPolicy = plainObject(context.avatar_policy);
  const publishingPolicy = plainObject(context.publishing_policy);
  const safetyPolicy = plainObject(context.safety_policy);
  if (Object.keys(context).length === 0) {
    return 'No client/account context snapshot was supplied. Use global defaults and global safety rules.';
  }

  const lines = [
    `Account context key: ${firstNonEmpty(context.account_context_key, 'unknown')}.`,
    `Client/account: ${firstNonEmpty(client.display_name, client.client_id, 'unknown')} on ${firstNonEmpty(platformAccount.platform, publishingPolicy.platform, 'instagram')}.`,
    `Brand profile: ${firstNonEmpty(brandPolicy.brand_profile, 'default')}; tone: ${firstNonEmpty(brandPolicy.brand_tone, 'not specified')}.`,
    `Preferred style pack: ${firstNonEmpty(stylePolicy.preferred_style_pack_id, 'not specified')}; allowed style packs: ${compactList(stylePolicy.allowed_style_pack_ids).join(', ') || 'not specified'}.`,
    `Voice: ${firstNonEmpty(voicePolicy.narrator_style, 'not specified')}.`,
    `Music: ${firstNonEmpty(musicPolicy.music_mood, 'not specified')}; publish-allowed music required: ${musicPolicy.publish_allowed_required !== false ? 'yes' : 'no'}.`,
    `Avatar mode: ${firstNonEmpty(avatarPolicy.default_avatar_mode, 'none')}; consent required: ${avatarPolicy.requires_consent !== false ? 'yes' : 'no'}.`,
    `Publishing account: ${firstNonEmpty(publishingPolicy.platform_account_username, platformAccount.platform_account_username, publishingPolicy.platform_account_id, platformAccount.platform_account_id, 'not specified')}; approval required: ${publishingPolicy.approval_required !== false ? 'yes' : 'no'}.`,
    `Safety override allowed: ${safetyPolicy.global_rules_override_allowed === true ? 'yes' : 'no'}. Global safety, consent, license, and platform rules still take priority.`,
  ];
  return lines.join(' ');
}

function applyClientAccountContextDefaults(merged) {
  const context = plainObject(merged.client_account_context ?? merged.clientAccountContext);
  merged.client_account_context = context;
  merged.client_account_context_json = Object.keys(context).length > 0 ? JSON.stringify(context, null, 2) : '{}';
  merged.client_account_context_summary = firstNonEmpty(
    merged.client_account_context_summary,
    summarizeClientAccountContext(context),
  );
  if (Object.keys(context).length === 0) {
    return;
  }

  const brandPolicy = plainObject(context.brand_policy);
  const stylePolicy = plainObject(context.style_policy);
  const voicePolicy = plainObject(context.voice_policy);
  const musicPolicy = plainObject(context.music_policy);
  const publishingPolicy = plainObject(context.publishing_policy);

  merged.brand_profile = firstNonEmpty(merged.brand_profile, brandPolicy.brand_profile);
  merged.brand_tone = firstNonEmpty(merged.brand_tone, brandPolicy.brand_tone);
  merged.narrator_style = firstNonEmpty(merged.narrator_style, voicePolicy.narrator_style);
  merged.narration_style = firstNonEmpty(merged.narration_style, voicePolicy.narrator_style);
  merged.visual_style_rules = firstNonEmpty(merged.visual_style_rules, stylePolicy.visual_style_notes);
  merged.style_notes = firstNonEmpty(merged.style_notes, stylePolicy.visual_style_notes);
  merged.background_music_direction = firstNonEmpty(merged.background_music_direction, musicPolicy.music_mood);
  merged.music_mood = firstNonEmpty(merged.music_mood, musicPolicy.music_mood);
  merged.selected_style_pack = firstNonEmpty(merged.selected_style_pack, stylePolicy.preferred_style_pack_id);
  merged.preferred_style_pack_id = firstNonEmpty(merged.preferred_style_pack_id, stylePolicy.preferred_style_pack_id);
  merged.platform_account_id = firstNonEmpty(merged.platform_account_id, publishingPolicy.platform_account_id);
  merged.platform_account_username = firstNonEmpty(merged.platform_account_username, publishingPolicy.platform_account_username);
  merged.default_caption_tone = firstNonEmpty(merged.default_caption_tone, publishingPolicy.default_caption_tone);
  merged.hashtag_policy = firstNonEmpty(merged.hashtag_policy, publishingPolicy.hashtag_policy);
}

function parsePositiveNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseSpeechSpeed(value, fallback = 1) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(4, Math.max(0.25, Number(parsed.toFixed(2))));
}

function formatSpeechSpeed(speed) {
  return Number(speed).toFixed(2).replace(/\.00$/, '');
}

function resolveNarrationSpeedMultiplier(templateData = {}) {
  return parseSpeechSpeed(
    firstNonEmpty(
      templateData.narration_speed,
      process.env.NARRATION_SPEED,
      process.env.TTS_SPEED,
      process.env.OPENAI_TTS_SPEED,
    ),
    1,
  );
}

function effectiveTargetDurationSeconds(rawSeconds, speedMultiplier) {
  const seconds = Math.max(15, Number(rawSeconds || 0));
  const speed = Math.max(0.25, Number(speedMultiplier || 1));
  return Math.max(10, Number((seconds / speed).toFixed(2)));
}

function appendTimingSpeedNote(baseText, speedMultiplier, noteBuilder) {
  const base = String(baseText || '').trim();
  const speed = parseSpeechSpeed(speedMultiplier, 1);
  if (speed <= 1.01) {
    return base;
  }
  const note = String(noteBuilder(speed) || '').trim();
  if (!note) {
    return base;
  }
  return base ? `${base} ${note}` : note;
}

function speechWordBudget(seconds) {
  const safeSeconds = Math.max(15, Number(seconds || 0));
  return Math.max(30, Math.round((safeSeconds / 60) * 145));
}

export function resolveStageLanguage() {
  return FIXED_PIPELINE_CONTENT_LANGUAGE;
}

export function buildSceneTimingPlan(storyboard = [], options = {}) {
  const scenes = Array.isArray(storyboard) ? storyboard : [];
  if (scenes.length === 0) {
    return 'No storyboard timing plan is available yet. Keep pacing steady and natural.';
  }

  const speedMultiplier = parseSpeechSpeed(options.speedMultiplier, 1);
  let currentTime = 0;
  return scenes.map((scene, index) => {
    const sceneNumber = Number(scene?.scene_number ?? index + 1);
    const rawDurationSeconds = parsePositiveNumber(scene?.duration_seconds) ?? 0;
    const durationSeconds = Number((rawDurationSeconds / speedMultiplier).toFixed(2));
    const start = Number(currentTime.toFixed(2));
    const end = Number((currentTime + durationSeconds).toFixed(2));
    currentTime = end;
    const narrationText = firstNonEmpty(scene?.narration_text, 'No narration text provided.');
    return `Scene ${sceneNumber}: ${start}s to ${end}s (${durationSeconds}s) | ${narrationText}`;
  }).join('\n');
}

function resolveLanguageGuidance(stageKey, language, existingValue = '') {
  const override = firstNonEmpty(existingValue);
  if (override) {
    return override;
  }

  const envOverride = firstNonEmpty(
    stageKey === 'caption_and_hashtags' ? process.env.CAPTION_LANGUAGE_GUIDANCE : '',
  );
  if (envOverride) {
    return envOverride;
  }

  switch (stageKey) {
    case 'research_and_script':
      return 'Write all audience-facing copy in natural spoken English. Keep it easy to speak aloud, and preserve proper nouns accurately.';
    case 'storyboard_and_prompts':
      return 'Keep subtitle text and any language-sensitive creative decisions in concise, mobile-readable English.';
    case 'caption_and_hashtags':
      return 'Write the final caption in clear, idiomatic English. Keep hashtags in English and discoverability-focused.';
    case 'scene_asset_generation':
    case 'post_image_generation':
      return 'Keep any implied signage, documents, or printed details absent or unreadable. Only scene 1 may use a very short English opening title if explicitly needed.';
    case 'narration_generation':
      return 'Speak naturally in English with clear pronunciation that fits a human voiceover track.';
    default:
      return 'Keep the output aligned to natural English.';
  }
}

function resolveResearchTimingGuidance(templateData) {
  const speedMultiplier = resolveNarrationSpeedMultiplier(templateData);
  const baseGuidance = firstNonEmpty(
    templateData.timing_guidance,
    process.env.RESEARCH_TIMING_GUIDANCE,
    (() => {
      const rawSeconds = parsePositiveNumber(templateData.target_duration_seconds) ?? 45;
      const seconds = effectiveTargetDurationSeconds(rawSeconds, speedMultiplier);
      const wordBudget = speechWordBudget(seconds);
      return `Aim for roughly ${wordBudget} spoken words total. The main narration should fit inside about ${seconds} seconds without sounding rushed.`;
    })(),
  );
  return appendTimingSpeedNote(
    baseGuidance,
    speedMultiplier,
    (speed) => `Plan for a slightly brisk voice track at about ${formatSpeechSpeed(speed)}x normal speed, so avoid padding or slow transitions in the writing.`,
  );
}

function resolveStoryboardTimingGuidance(templateData) {
  const speedMultiplier = resolveNarrationSpeedMultiplier(templateData);
  const baseGuidance = firstNonEmpty(
    templateData.storyboard_timing_guidance,
    process.env.STORYBOARD_TIMING_GUIDANCE,
    (() => {
      const rawSeconds = parsePositiveNumber(templateData.target_duration_seconds) ?? 45;
      const seconds = effectiveTargetDurationSeconds(rawSeconds, speedMultiplier);
      return `Keep the total planned scene time very close to ${seconds} seconds. Most scenes should stay between 4 and 12 seconds unless the beat truly needs more room.`;
    })(),
  );
  return appendTimingSpeedNote(
    baseGuidance,
    speedMultiplier,
    (speed) => `Keep scene changes slightly tighter so the visual pacing still feels aligned to a ${formatSpeechSpeed(speed)}x narration read.`,
  );
}

function resolveStoryboardAlignmentGuidance(templateData) {
  return firstNonEmpty(
    templateData.narration_alignment_guidance,
    process.env.STORYBOARD_NARRATION_ALIGNMENT_GUIDANCE,
    'Each scene should cover one clear spoken beat. Do not let a single image try to represent multiple unrelated story turns.',
  );
}

function resolveRenderTimingGuidance(templateData) {
  const speedMultiplier = resolveNarrationSpeedMultiplier(templateData);
  const baseGuidance = firstNonEmpty(
    templateData.render_timing_guidance,
    process.env.STORYBOARD_RENDER_TIMING_GUIDANCE,
    'Choose durations that can cut cleanly on a 30fps vertical timeline. Avoid chaotic micro-beats and keep numbers practical for editing.',
  );
  return appendTimingSpeedNote(
    baseGuidance,
    speedMultiplier,
    (speed) => `Expect the narration to land a touch faster than neutral at roughly ${formatSpeechSpeed(speed)}x, and leave enough room to tighten scene holds cleanly in the final render.`,
  );
}

function resolveSceneTimingGuidance(templateData) {
  const speedMultiplier = resolveNarrationSpeedMultiplier(templateData);
  const baseGuidance = firstNonEmpty(
    templateData.scene_timing_guidance,
    process.env.SCENE_IMAGE_TIMING_GUIDANCE,
    (() => {
      const seconds = parsePositiveNumber(templateData.scene_duration_seconds) ?? 5;
      return `This frame will stay on screen for about ${seconds} seconds. Make the focal subject instantly clear and tied to the exact spoken beat for that window.`;
    })(),
  );
  return appendTimingSpeedNote(
    baseGuidance,
    speedMultiplier,
    () => 'Readability should be immediate, because the final fit-to-narration timeline may hold the frame slightly shorter than a neutral voice read.',
  );
}

function resolveNarrationTimingGuidance(templateData) {
  const speedMultiplier = resolveNarrationSpeedMultiplier(templateData);
  const baseGuidance = firstNonEmpty(
    templateData.narration_timing_guidance,
    process.env.NARRATION_TIMING_GUIDANCE,
    (() => {
      const rawSeconds = parsePositiveNumber(templateData.target_duration_seconds) ?? 45;
      const seconds = effectiveTargetDurationSeconds(rawSeconds, speedMultiplier);
      return `Keep the full read close to ${seconds} seconds. Use short, intentional pauses at scene boundaries and give the hook and ending slightly cleaner emphasis.`;
    })(),
  );
  return appendTimingSpeedNote(
    baseGuidance,
    speedMultiplier,
    (speed) => `Deliver it at about ${formatSpeechSpeed(speed)}x normal speed with slightly shorter pauses, but keep it natural and easy to follow.`,
  );
}

function resolveNarrationStyle(templateData) {
  return firstNonEmpty(
    templateData.narration_style,
    process.env.NARRATION_STYLE,
    'calm, human, emotionally grounded, clear, lightly suspenseful when the story calls for it',
  );
}

function resolveStoryAlignmentGuidance(stageKey, templateData) {
  return firstNonEmpty(
    templateData.story_alignment_guidance,
    stageKey === 'scene_asset_generation'
      ? process.env.SCENE_IMAGE_STORY_ALIGNMENT_GUIDANCE
      : process.env.POST_IMAGE_STORY_ALIGNMENT_GUIDANCE,
    'Represent the exact story beat named in the hook, narration, or caption instead of a generic mood image.',
  );
}

export function resolveDirectorTemplateData(templateData = {}) {
  const scenes = Array.isArray(templateData.scene_guidance_json) ? templateData.scene_guidance_json : [];
  const creativeDefaults = templateData.creative_defaults && typeof templateData.creative_defaults === 'object'
    ? templateData.creative_defaults
    : {};
  return {
    title: String(templateData.title || '').trim(),
    category: String(templateData.category || 'general').trim() || 'general',
    target_duration_seconds: String(templateData.target_duration_seconds || '45').trim(),
    narration_script: String(templateData.narration_script || '').trim(),
    script_scene_guidance_json: JSON.stringify(scenes, null, 2),
    scene_count: String(scenes.length || ''),
    creative_defaults_json: templateData.creative_defaults_json
      || (Object.keys(creativeDefaults).length > 0 ? JSON.stringify(creativeDefaults, null, 2) : '{}'),
    rule_registry_summary: firstNonEmpty(templateData.rule_registry_summary, DEFAULT_RULE_REGISTRY_SUMMARY),
    style_pack_registry_summary: firstNonEmpty(templateData.style_pack_registry_summary, DEFAULT_STYLE_PACK_REGISTRY_SUMMARY),
  };
}

export function resolveStagePromptTemplateData(stageKey, templateData = {}) {
  const input = templateData && typeof templateData === 'object' ? templateData : {};
  const promptProfile = normalizePromptProfile(input.prompt_profile ?? input.promptProfile ?? {});
  const merged = {
    ...input,
    ...(promptProfile[stageKey] ?? {}),
  };
  delete merged.prompt_profile;
  delete merged.promptProfile;
  applyClientAccountContextDefaults(merged);
  const language = resolveStageLanguage(stageKey, merged.content_language);

  merged.content_language = language;
  merged.language_guidance = resolveLanguageGuidance(stageKey, language, merged.language_guidance);

  if (stageKey === 'director' || stageKey === 'director_contract') {
    const directorData = resolveDirectorTemplateData(merged);
    Object.assign(merged, directorData);
  }

  if (stageKey === 'research_and_script' || stageKey === 'story_package_generation' || stageKey === 'story_package_generation_v2') {
    merged.timing_guidance = resolveResearchTimingGuidance(merged);
  }

  if (stageKey === 'story_package_generation_v2') {
    const creativeDefaults = merged.creative_defaults && typeof merged.creative_defaults === 'object'
      ? merged.creative_defaults
      : {};
    merged.creative_defaults_json = merged.creative_defaults_json
      || (Object.keys(creativeDefaults).length > 0 ? JSON.stringify(creativeDefaults, null, 2) : '{}');
    merged.rule_registry_summary = firstNonEmpty(
      merged.rule_registry_summary,
      DEFAULT_RULE_REGISTRY_SUMMARY,
    );
    merged.style_pack_registry_summary = firstNonEmpty(
      merged.style_pack_registry_summary,
      DEFAULT_STYLE_PACK_REGISTRY_SUMMARY,
    );
  }

  if (stageKey === 'storyboard_and_prompts') {
    merged.storyboard_timing_guidance = resolveStoryboardTimingGuidance(merged);
    merged.narration_alignment_guidance = resolveStoryboardAlignmentGuidance(merged);
    merged.render_timing_guidance = resolveRenderTimingGuidance(merged);
    const directorJson = merged.director_json && typeof merged.director_json === 'object'
      ? merged.director_json
      : {};
    merged.director_plan_json = merged.director_plan_json
      || (Object.keys(directorJson).length > 0 ? JSON.stringify(directorJson, null, 2) : '');
    merged.director_global_visual_style = firstNonEmpty(merged.director_global_visual_style, directorJson.global_visual_style);
    merged.director_visual_strategy = firstNonEmpty(merged.director_visual_strategy, directorJson.visual_strategy);
    merged.director_global_pacing = firstNonEmpty(merged.director_global_pacing, directorJson.global_pacing);
    merged.director_global_music_direction = firstNonEmpty(merged.director_global_music_direction, directorJson.global_music_direction);
    merged.director_voice_role = firstNonEmpty(merged.director_voice_role, directorJson.voice_role);
  }

  if (stageKey === 'scene_asset_generation') {
    merged.scene_timing_guidance = resolveSceneTimingGuidance(merged);
    merged.story_alignment_guidance = resolveStoryAlignmentGuidance(stageKey, merged);
  }

  if (stageKey === 'narration_generation') {
    const speedMultiplier = resolveNarrationSpeedMultiplier(merged);
    merged.narration_style = resolveNarrationStyle(merged);
    merged.narration_speed = formatSpeechSpeed(speedMultiplier);
    merged.narration_timing_guidance = resolveNarrationTimingGuidance(merged);
    merged.scene_timing_plan = firstNonEmpty(
      merged.scene_timing_plan,
      buildSceneTimingPlan(merged.storyboard_json, { speedMultiplier }),
    );
  }

  if (stageKey === 'post_image_generation') {
    merged.story_alignment_guidance = resolveStoryAlignmentGuidance(stageKey, merged);
  }

  return merged;
}
