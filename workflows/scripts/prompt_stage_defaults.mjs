#!/usr/bin/env node

import { normalizePromptProfile } from './prompt_profile_contract.mjs';
import {
  DEFAULT_CREATIVE_WORKFLOW_ID,
  creativeWorkflowPromptData,
  normalizeCreativeWorkflowId,
} from './creative_workflows.mjs';

const FIXED_PIPELINE_CONTENT_LANGUAGE = 'English';
const DEFAULT_TARGET_DURATION_SECONDS = 80;
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

function jsonString(value, fallback = '{}') {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || fallback;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return JSON.stringify(value, null, 2);
}

function resolveCreativeWorkflowId(templateData = {}) {
  return normalizeCreativeWorkflowId(
    firstNonEmpty(
      templateData.creative_workflow,
      templateData.creativeWorkflow,
      templateData.creative_workflow_id,
      templateData.source_payload_json?.creative_workflow,
      templateData.source_payload?.creative_workflow,
      templateData.creative_defaults?.creative_workflow,
      process.env.DEFAULT_CREATIVE_WORKFLOW,
    ),
    { fallback: DEFAULT_CREATIVE_WORKFLOW_ID },
  );
}

function applyCreativeWorkflowDefaults(merged) {
  const workflowData = creativeWorkflowPromptData(resolveCreativeWorkflowId(merged));
  Object.assign(merged, workflowData);
  merged.creative_workflow = workflowData.creative_workflow_id;
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
    case 'voice_performance_script':
      return 'Keep spoken words in natural English and put emotion, intent, pacing, pauses, and emphasis into delivery instructions instead of audible stage directions.';
    case 'avatar_presenter_selector':
      return 'Keep avatar presenter direction separate from the spoken narration script. Treat direction as provider instructions and metadata, not words to be read aloud.';
    case 'hybrid_media_planner':
      return 'Keep media-routing decisions separate from spoken narration. Choose avatar, scene video, or image motion per scene without changing the spoken English beat.';
    case 'visual_prompt_builder':
      return 'Keep generated visual prompts text-free and tied to the spoken English story beat.';
    case 'final_qa_validator':
      return 'Evaluate all audience-facing copy and delivery artifacts as natural English Instagram Reel output.';
    case 'performance_feedback_analysis':
      return 'Return reusable English generation guidance based on measured Instagram performance evidence.';
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
      const rawSeconds = parsePositiveNumber(templateData.target_duration_seconds) ?? DEFAULT_TARGET_DURATION_SECONDS;
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
      const rawSeconds = parsePositiveNumber(templateData.target_duration_seconds) ?? DEFAULT_TARGET_DURATION_SECONDS;
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
      const rawSeconds = parsePositiveNumber(templateData.target_duration_seconds) ?? DEFAULT_TARGET_DURATION_SECONDS;
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
    target_duration_seconds: String(templateData.target_duration_seconds || DEFAULT_TARGET_DURATION_SECONDS).trim(),
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
  applyCreativeWorkflowDefaults(merged);
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

  if (stageKey === 'storyboard_and_prompts' || stageKey === 'storyboard_and_shot_plan') {
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

  if (stageKey === 'visual_prompt_builder') {
    const directorPlan = plainObject(merged.director_plan ?? merged.director_json ?? merged.director_contract_json);
    const storyboardPlan = Array.isArray(merged.storyboard_plan ?? merged.storyboard_json)
      ? (merged.storyboard_plan ?? merged.storyboard_json)
      : plainObject(merged.storyboard_plan ?? {});
    const visualContract = plainObject(directorPlan.visual_contract);
    merged.selected_style_pack = firstNonEmpty(
      merged.selected_style_pack,
      directorPlan.selected_style_pack,
      merged.preferred_style_pack_id,
      'cinematic_problem_solution',
    );
    merged.director_plan_json = jsonString(merged.director_plan_json || directorPlan);
    merged.storyboard_plan_json = jsonString(merged.storyboard_plan_json || storyboardPlan, '[]');
    merged.visual_continuity_notes = firstNonEmpty(
      merged.visual_continuity_notes,
      Array.isArray(visualContract.continuity_rules) ? visualContract.continuity_rules.join(' | ') : '',
      directorPlan.global_visual_style,
      'Maintain consistent style, characters, environments, lighting, and color across all scenes.',
    );
    merged.visual_text_policy = firstNonEmpty(
      merged.visual_text_policy,
      visualContract.text_policy,
      'Do not request readable text, logos, labels, captions, subtitles, watermarks, or signage in generated assets.',
    );
  }

  if (stageKey === 'voice_performance_script') {
    const directorContract = plainObject(merged.director_contract ?? merged.director_json);
    const storyboardPlan = Array.isArray(merged.storyboard_plan ?? merged.storyboard_json)
      ? (merged.storyboard_plan ?? merged.storyboard_json)
      : plainObject(merged.storyboard_plan ?? {});
    const voiceContract = plainObject(directorContract.voice_contract);
    merged.selected_style_pack = firstNonEmpty(
      merged.selected_style_pack,
      directorContract.selected_style_pack,
      merged.preferred_style_pack_id,
      'cinematic_problem_solution',
    );
    merged.narration_style = firstNonEmpty(
      merged.narration_style,
      voiceContract.delivery_summary,
      directorContract.tts_delivery,
      resolveNarrationStyle(merged),
    );
    merged.clean_spoken_script = firstNonEmpty(merged.clean_spoken_script, merged.narration_script);
    merged.director_contract_json = jsonString(merged.director_contract_json || directorContract);
    merged.storyboard_plan_json = jsonString(merged.storyboard_plan_json || storyboardPlan, '[]');
    merged.voice_line_map_json = jsonString(merged.voice_line_map_json || merged.voice_line_map || [], '[]');
    merged.music_sfx_context_json = jsonString(merged.music_sfx_context_json || merged.music_sfx_context || {}, '{}');
  }

  if (stageKey === 'avatar_presenter_selector') {
    const directorContract = plainObject(merged.director_contract ?? merged.director_json ?? merged.director_avatar_contract);
    const storyboardPlan = Array.isArray(merged.storyboard_plan ?? merged.storyboard_json)
      ? (merged.storyboard_plan ?? merged.storyboard_json)
      : plainObject(merged.storyboard_plan ?? {});
    const storyPackageContext = plainObject(merged.story_package_context ?? merged.story_package_json ?? merged.story_package);
    const characterReferenceContext = plainObject(merged.character_reference_context ?? merged.character_reference);
    const presenterProfileInventory = Array.isArray(merged.presenter_profile_inventory)
      ? merged.presenter_profile_inventory
      : (merged.presenter_profile_inventory && typeof merged.presenter_profile_inventory === 'object' ? [merged.presenter_profile_inventory] : []);
    const avatarProviderInventory = plainObject(merged.avatar_provider_inventory ?? merged.provider_inventory);
    merged.package_type = firstNonEmpty(merged.package_type, 'instagram_reel');
    merged.selected_style_pack = firstNonEmpty(
      merged.selected_style_pack,
      directorContract.selected_style_pack,
      merged.preferred_style_pack_id,
      'avatar_sales_outreach',
    );
    merged.story_package_context_json = jsonString(merged.story_package_context_json || storyPackageContext);
    merged.director_avatar_contract_json = jsonString(merged.director_avatar_contract_json || directorContract);
    merged.storyboard_plan_json = jsonString(merged.storyboard_plan_json || storyboardPlan, '[]');
    merged.character_reference_context_json = jsonString(merged.character_reference_context_json || characterReferenceContext);
    merged.presenter_profile_inventory_json = jsonString(merged.presenter_profile_inventory_json || presenterProfileInventory, '[]');
    merged.avatar_provider_inventory_json = jsonString(merged.avatar_provider_inventory_json || avatarProviderInventory);
    merged.avatar_rules_summary = firstNonEmpty(
      merged.avatar_rules_summary,
      'Use avatar only when account policy, explicit consent metadata, presenter suitability, disclosure, provider identity, and safety gates all pass. Uploaded character references are creative context only and never consent. Direction must stay separate from spoken script. Auto-downgrade to video when anything is missing, unsafe, or unavailable.',
    );
    merged.heygen_capability_summary = firstNonEmpty(
      merged.heygen_capability_summary,
      'HeyGen create-video request options may include aspect_ratio, resolution, captions/caption, fit, background, voice_settings, motion_prompt, expressiveness, and engine when supported. Do not include secrets or unsupported provider-specific hacks.',
    );
  }

  if (stageKey === 'hybrid_media_planner') {
    const directorContract = plainObject(merged.director_contract ?? merged.director_json);
    const storyboardPlan = Array.isArray(merged.storyboard_plan ?? merged.storyboard_json)
      ? (merged.storyboard_plan ?? merged.storyboard_json)
      : [];
    const storyPackageContext = plainObject(merged.story_package_context ?? merged.story_package_json ?? merged.story_package);
    const visualPromptPlan = plainObject(merged.visual_prompt_plan ?? merged.visual_prompt_plan_json);
    const avatarProviderInventory = plainObject(merged.avatar_provider_inventory ?? merged.provider_inventory);
    const mediaProviderInventory = plainObject(merged.media_provider_inventory);
    merged.package_type = firstNonEmpty(merged.package_type, 'instagram_reel');
    merged.selected_style_pack = firstNonEmpty(
      merged.selected_style_pack,
      directorContract.selected_style_pack,
      merged.preferred_style_pack_id,
      'cinematic_problem_solution',
    );
    merged.story_package_context_json = jsonString(merged.story_package_context_json || storyPackageContext);
    merged.director_contract_json = jsonString(merged.director_contract_json || directorContract);
    merged.storyboard_plan_json = jsonString(merged.storyboard_plan_json || storyboardPlan, '[]');
    merged.visual_prompt_plan_json = jsonString(merged.visual_prompt_plan_json || visualPromptPlan);
    merged.avatar_provider_inventory_json = jsonString(merged.avatar_provider_inventory_json || avatarProviderInventory);
    merged.media_provider_inventory_json = jsonString(merged.media_provider_inventory_json || mediaProviderInventory);
    merged.hybrid_rules_summary = firstNonEmpty(
      merged.hybrid_rules_summary,
      'Hybrid planning may combine HeyGen avatar clips, Fal Veo scene video, and image-with-Remotion-motion scenes. Avatar requires explicit policy and consent metadata. Provider-video failures should fail unless fallback is explicitly allowed. Uploaded character references are creative context only, never consent evidence.',
    );
  }

  if (stageKey === 'final_qa_validator') {
    merged.package_type = firstNonEmpty(merged.package_type, 'instagram_reel');
    merged.selected_style_pack = firstNonEmpty(merged.selected_style_pack, merged.director_json?.selected_style_pack, merged.preferred_style_pack_id, 'unknown');
    for (const key of [
      'director_contract_json',
      'storyboard_plan_json',
      'visual_prompt_plan_json',
      'voice_performance_json',
      'music_sfx_plan_json',
      'generated_assets_json',
      'narration_assets_json',
      'render_result_json',
      'caption_publish_json',
      'avatar_consent_context_json',
      'platform_publish_context_json',
    ]) {
      const isArrayJson = key === 'generated_assets_json' || key === 'narration_assets_json' || key === 'storyboard_plan_json';
      const fallback = isArrayJson ? '[]' : '{}';
      const defaultValue = isArrayJson ? [] : {};
      merged[key] = jsonString(key in merged ? merged[key] : defaultValue, fallback);
    }
  }

  if (stageKey === 'performance_feedback_analysis') {
    merged.account_context_key = firstNonEmpty(merged.account_context_key, 'unknown');
    merged.platform = firstNonEmpty(merged.platform, 'instagram');
    merged.analysis_window = firstNonEmpty(merged.analysis_window, 'latest available insight snapshots');
    merged.account_context_json = jsonString(merged.account_context_json || merged.client_account_context || {}, '{}');
    merged.target_content_json = jsonString(merged.target_content_json || {}, '{}');
    merged.recent_insights_json = jsonString(merged.recent_insights_json || [], '[]');
    merged.prior_performance_reviews_json = jsonString(merged.prior_performance_reviews_json || [], '[]');
    merged.existing_performance_guidance_json = jsonString(merged.existing_performance_guidance_json || {}, '{}');
  }

  if (stageKey === 'post_image_generation') {
    merged.story_alignment_guidance = resolveStoryAlignmentGuidance(stageKey, merged);
  }

  return merged;
}
