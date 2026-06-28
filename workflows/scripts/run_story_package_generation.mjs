#!/usr/bin/env node

import { createRequire } from 'node:module';
import { invokeStructuredTextStage } from './invoke_structured_text_adapter.mjs';
import { mapStoryPackageV2ToLegacyResponse } from './story_package_v2_compat.mjs';

const require = createRequire(import.meta.url);
function loadPgModule() {
  try {
    return require('/usr/local/lib/node_modules/n8n/node_modules/pg');
  } catch {
    return require('pg');
  }
}
const { Client } = loadPgModule();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_ACCOUNT_CONTEXT_SCHEMA_SQL = `
create table if not exists client_account_contexts (
  account_context_id uuid primary key default gen_random_uuid(),
  account_context_key text not null unique,
  client_name text not null default 'Default Client',
  brand_profile text not null default 'default',
  platform text not null default 'instagram',
  platform_account_id text,
  platform_account_username text,
  context_json jsonb not null default '{}'::jsonb,
  context_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_client_account_contexts_platform
  on client_account_contexts (platform, platform_account_id);
create table if not exists content_account_contexts (
  content_id uuid primary key references content_items(content_id) on delete cascade,
  account_context_id uuid references client_account_contexts(account_context_id) on delete set null,
  account_context_key text not null,
  context_snapshot_json jsonb not null default '{}'::jsonb,
  snapshot_version text not null default '1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_content_account_contexts_key
  on content_account_contexts (account_context_key);
`;

function fail(message) {
  throw new Error(message);
}

function resolveStoryPackageStage() {
  const configured = String(
    process.env.STORY_PACKAGE_GENERATION_STAGE
    || process.env.STORY_PACKAGE_STAGE
    || 'story_package_generation',
  ).trim();
  const normalized = configured === 'v2' ? 'story_package_generation_v2' : configured;
  if (normalized === 'story_package_generation' || normalized === 'story_package_generation_v2') {
    return normalized;
  }
  fail(`Unsupported STORY_PACKAGE_GENERATION_STAGE '${configured}'. Use story_package_generation, story_package_generation_v2, or v2.`);
}

function ensureString(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    fail(`${name} is required.`);
  }
  return normalized;
}

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

function normalizeReelType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'image' || normalized === 'video' || normalized === 'avatar') {
    return normalized;
  }
  return 'video';
}

function flattenText(value, keyPath = '') {
  if (value == null) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text ? [keyPath + text] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenText(entry, keyPath ? `${keyPath}${index + 1}. ` : ''));
  }
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => flattenText(entry, `${key}: `));
  }
  return [];
}

function collectSourceNotes(sourcePayload = {}) {
  const sourceNotesLines = [];
  if (Array.isArray(sourcePayload.notes)) {
    sourceNotesLines.push(...sourcePayload.notes.map((entry) => String(entry ?? '').trim()).filter(Boolean));
  }
  for (const key of ['abstract_idea', 'summary', 'description', 'context', 'narrative_perspective', 'point_of_view', 'visual_direction', 'source_text']) {
    const text = String(sourcePayload[key] ?? '').trim();
    if (text) sourceNotesLines.push(text);
  }
  if (sourceNotesLines.length === 0) {
    sourceNotesLines.push(...flattenText(sourcePayload));
  }
  return sourceNotesLines.length
    ? sourceNotesLines.join('\n')
    : 'No source notes were provided. Keep the script cautious and explicit about uncertainty.';
}

function normalizeCharacterReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const normalized = {
    character_name: String(value.character_name || value.name || '').trim(),
    character_description: String(value.character_description || value.description || '').trim(),
    storage_url: String(value.storage_url || value.source_url || '').trim(),
  };
  return normalized.storage_url ? normalized : null;
}

function buildCharacterReferencePromptContext(sourcePayload = {}) {
  const characterReference = normalizeCharacterReference(sourcePayload.character_reference);
  if (!characterReference) {
    return 'No uploaded character reference image is available for this story. Only mark `includes_primary_character` true when the narration clearly shows the recurring main character on screen.';
  }

  return [
    'A user uploaded a primary-character reference image for appearance continuity.',
    `Reference image URL: ${characterReference.storage_url}.`,
    characterReference.character_name ? `Character name: ${characterReference.character_name}.` : 'Character name: not provided.',
    characterReference.character_description ? `Character description: ${characterReference.character_description}.` : 'Character description: not provided.',
    'Use this image as the visual canon for the recurring character whenever that character is visible in a scene.',
    'Set `includes_primary_character` to true only for scenes where this recurring character is actually on screen.',
  ].join(' ');
}

function roundToHundredths(value) {
  return Number(Number(value).toFixed(2));
}

const FACE_IMAGE_TITLE_STOPWORDS = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with']);
const VISIBLE_TEXT_PROMPT_PATTERNS = [
  /\bcentral title\b/i,
  /\bcentered title\b/i,
  /\btitle text\b/i,
  /\btext overlay\b/i,
  /\breadable text\b/i,
  /\bunreadable text\b/i,
  /\bgibberish text\b/i,
  /\bfake (?:text|writing|letters)\b/i,
  /\bpseudo[- ]?(?:text|writing)\b/i,
  /\btypography\b/i,
  /\bcaption(?:s)?\b/i,
  /\bsubtitle(?:s)?\b/i,
  /\blogo(?:s)?\b/i,
  /\bwatermark(?:s)?\b/i,
  /\bsign(?:age|board)?s?\b/i,
  /\blabel(?:s|ed|led)?\b/i,
  /\bbanner(?:s)?\b/i,
  /\bposter(?:s)?\b/i,
  /\bplaque(?:s)?\b/i,
  /\binscription(?:s)?\b/i,
  /\b(?:carved|etched|painted|printed|written)\s+(?:text|letters|words|script|inscriptions?)\b/i,
  /\bdocument(?:s)?\b/i,
  /\bnewspaper(?:s)?\b/i,
  /\bbook page(?:s)?\b/i,
  /\bmanuscript(?:s)?\b/i,
  /\bmap label(?:s)?\b/i,
  /\blabeled map(?:s)?\b/i,
  /\bdiagram(?:s)? with (?:text|labels|annotations)\b/i,
  /\bchart(?:s)? with (?:text|labels|annotations)\b/i,
  /\binfographic(?:s)?\b/i,
  /\bUI\b/i,
  /\bscreen text\b/i,
  /\bdashboard text\b/i,
  /\bspeech bubble\b/i,
  /\bdialogue bubble\b/i,
  /\bthought bubble\b/i,
  /\bwords on screen\b/i,
  /\b(?:word|words|letter|letters|glyph|glyphs|script) on (?:the )?(?:screen|wall|stone|paper|sign|label|map|diagram|plaque)\b/i,
];

const TEXT_FREE_VISUAL_FALLBACK = 'Concrete text-free documentary scene matching the narrated beat, using unmarked physical subjects, architecture, water, stone, tools, landscape, people, lighting, and composition instead of written surfaces.';

const META_NARRATION_PATTERNS = [
  /\bno spoken narration\b/i,
  /\bno narration\b/i,
  /\bwithout narration\b/i,
  /\bno voice(?:over)?\b/i,
  /\btts (?:is )?disabled\b/i,
  /\bdriven entirely by visual/i,
  /\btext overlays?\s+(?:replace|replaces|carry|carries|drive|drives)\b/i,
  /\bthis reel is (?:driven|told)\b/i,
  /\bstory speaks for itself\b/i,
  /\bvisual scenarios? and on[- ]screen text\b/i,
];

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function wordCount(value) {
  return normalizeWhitespace(value).split(/\s+/).filter(Boolean).length;
}

function isMetaNarrationInstruction(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }
  return META_NARRATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function sceneArrayCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function assertStoryPackageSceneArrays(response) {
  const guidanceCount = sceneArrayCount(response.scene_guidance_json);
  const storyboardCount = sceneArrayCount(response.storyboard_json);
  if (guidanceCount === 0 || storyboardCount === 0) {
    fail(`story package returned empty scene arrays (scene_guidance_json=${guidanceCount}, storyboard_json=${storyboardCount}); refusing to repair missing scenes from narration text.`);
  }
}

function splitFaceImageTitleWords(value) {
  return normalizeWhitespace(String(value || '').replace(/[^\p{L}\p{N}'’ -]+/gu, ' '))
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !/^\d{4}$/.test(word));
}

function buildDefaultTtsInstructions(scene = {}) {
  const moodOrBeat = normalizeWhitespace(String(scene?.mood ?? scene?.beat_label ?? '').trim());
  if (moodOrBeat) {
    return `Natural cinematic voiceover. Match the scene mood: ${moodOrBeat}. Pause cleanly at the end.`;
  }
  return 'Natural cinematic voiceover. Keep the pacing clear and pause cleanly at the end.';
}

function splitNarrationIntoSentences(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return [];
  }
  const sentences = normalized
    .split(/(?<=[.!?])\s+/u)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
  return sentences.length > 0 ? sentences : [normalized];
}

function chunkTextForScenes(value, sceneCount) {
  const count = Math.max(1, Number(sceneCount || 1));
  const sentences = splitNarrationIntoSentences(value);
  if (sentences.length >= count) {
    const chunks = Array.from({ length: count }, () => []);
    sentences.forEach((sentence, index) => {
      chunks[Math.min(count - 1, Math.floor((index * count) / sentences.length))].push(sentence);
    });
    return chunks.map((chunk) => normalizeWhitespace(chunk.join(' ')));
  }

  const words = normalizeWhitespace(value).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return Array.from({ length: count }, (_, index) => `Scene ${index + 1} beat.`);
  }
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * words.length) / count);
    const end = Math.floor(((index + 1) * words.length) / count);
    return normalizeWhitespace(words.slice(start, Math.max(start + 1, end)).join(' '));
  });
}

function targetSceneCountForRepair(sceneGuidanceScenes, storyboardScenes, targetDurationSeconds) {
  const counts = [sceneGuidanceScenes, storyboardScenes]
    .map((value) => Array.isArray(value) ? value.length : 0)
    .filter((count) => count >= 4 && count <= 8);
  if (counts.length > 0) {
    return counts[0];
  }
  const duration = Number(targetDurationSeconds || 0);
  if (duration >= 75) return 8;
  if (duration >= 45) return 6;
  return 4;
}

function buildSceneTimings(sceneCount, targetDurationSeconds) {
  const count = Math.max(4, Math.min(8, Number(sceneCount || 4)));
  const total = Number.isFinite(Number(targetDurationSeconds)) && Number(targetDurationSeconds) > 0
    ? Number(targetDurationSeconds)
    : count * 6;
  const firstDuration = count > 1
    ? roundToHundredths(Math.min(4, Math.max(2, total / count)))
    : roundToHundredths(total);
  const remaining = Math.max(0, total - firstDuration);
  let cursor = 0;
  return Array.from({ length: count }, (_, index) => {
    const start = roundToHundredths(cursor);
    const duration = index === 0
      ? firstDuration
      : roundToHundredths(remaining / Math.max(1, count - 1));
    const end = index === count - 1
      ? roundToHundredths(total)
      : roundToHundredths(start + duration);
    cursor = end;
    return {
      start_time_seconds: start,
      end_time_seconds: end,
      duration_seconds: roundToHundredths(end - start),
    };
  });
}

function repairTimedSceneCount(scenes, fieldName, {
  targetCount,
  targetDurationSeconds,
  title,
  narrationScript,
  reelType,
} = {}) {
  const sourceScenes = Array.isArray(scenes) ? scenes : [];
  if (sourceScenes.length === targetCount) {
    return { scenes: sourceScenes, repaired: false, original_count: sourceScenes.length };
  }

  const sourceNarration = sourceScenes
    .map((scene) => normalizeWhitespace(scene?.narration_text))
    .filter(Boolean)
    .join(' ');
  const chunks = chunkTextForScenes(
    firstNonEmpty(sourceNarration, narrationScript, title, 'A concise story beat for the Reel.'),
    targetCount,
  );
  const timings = buildSceneTimings(targetCount, targetDurationSeconds);
  const beatLabels = ['Hook', 'Contrast', 'Mechanism', 'Example', 'Implication', 'Turn', 'Proof', 'Close'];

  const repairedScenes = Array.from({ length: targetCount }, (_, index) => {
    const source = sourceScenes[Math.min(sourceScenes.length - 1, Math.floor((index * Math.max(1, sourceScenes.length)) / targetCount))] || {};
    const timing = timings[index];
    const narrationText = firstNonEmpty(chunks[index], source.narration_text, `Scene ${index + 1} beat.`);
    const baseVisual = firstNonEmpty(
      source.image_prompt,
      source.visual_prompt,
      source.visual_beat,
      `${title || 'The story'} shown as a cinematic, text-free visual metaphor for: ${narrationText}`,
    );
    const common = {
      ...source,
      scene_number: index + 1,
      ...timing,
      narration_text: narrationText,
      dialogue_lines: Array.isArray(source.dialogue_lines) && source.dialogue_lines.length > 0
        ? source.dialogue_lines.map((line) => normalizeWhitespace(line)).filter(Boolean)
        : [narrationText],
      asset_type: reelType === 'video' ? 'video' : 'image',
      asset_plan: source.asset_plan && typeof source.asset_plan === 'object'
        ? source.asset_plan
        : {
          mode: reelType === 'video' ? 'video' : 'image_with_motion',
          provider_intent: reelType === 'video' ? 'provider_video' : 'remotion_motion',
          motion_requirement: index === 0 ? 'medium' : 'low',
          video_generation_required: reelType === 'video',
          video_generation_reason: reelType === 'video'
            ? 'The operator selected Video Reel, so this scene should be generated directly as video.'
            : 'Use a still image and let Remotion provide the camera movement and pacing.',
          fallback_mode: 'image_with_motion',
          budget_priority: reelType === 'video' ? 'premium' : 'standard',
          review_required: reelType === 'video',
        },
      remotion: source.remotion && typeof source.remotion === 'object'
        ? source.remotion
        : {
          camera_move: index === 0 ? 'push_in' : 'drift',
          pan_zoom_direction: index === 0 ? 'center_push' : 'left_to_right',
          motion_intensity: index === 0 ? 'medium' : 'low',
          transition_type: index === 0 ? 'cut' : 'soft_cut',
          overlay_style: 'subtle_vignette',
          pacing: index === 0 ? 'quick' : 'steady',
          motion_layers: ['parallax-style pan/zoom from the still image'],
          instructions: 'Use restrained cinematic motion that supports the narration without adding visible text.',
        },
      music_cue: firstNonEmpty(source.music_cue, index === 0 ? 'subtle opening pulse' : (index === targetCount - 1 ? 'reflective closing lift' : 'steady understated bed')),
      tts_instructions: firstNonEmpty(source.tts_instructions, buildDefaultTtsInstructions(source)),
      includes_primary_character: source.includes_primary_character === true,
    };

    if (fieldName === 'scene_guidance_json') {
      return {
        ...common,
        beat_label: firstNonEmpty(source.beat_label, beatLabels[index], `Beat ${index + 1}`),
        image_prompt: stripVisibleTextInstructions(baseVisual) || TEXT_FREE_VISUAL_FALLBACK,
        scene_purpose: firstNonEmpty(source.scene_purpose, `Advance beat ${index + 1} of the story.`),
        visual_beat: firstNonEmpty(source.visual_beat, narrationText),
        source_boundary: firstNonEmpty(source.source_boundary, 'Use only the supplied idea/source notes and preserve uncertainty.'),
      };
    }

    return {
      ...common,
      visual_prompt: stripVisibleTextInstructions(baseVisual) || TEXT_FREE_VISUAL_FALLBACK,
      transition: firstNonEmpty(source.transition, index === 0 ? 'cut' : 'soft_cut'),
      mood: firstNonEmpty(source.mood, index === targetCount - 1 ? 'reflective' : 'clear and cinematic'),
      is_face_image: source.is_face_image === true,
      face_image_title: firstNonEmpty(source.face_image_title, index === 0 ? buildFaceImageTitleFallback(title) : ''),
    };
  });

  return { scenes: repairedScenes, repaired: true, original_count: sourceScenes.length };
}

function repairSubtitleLines(value, scenes = [], fallbackText = '') {
  if (Array.isArray(value) && value.length > 0) {
    return { lines: value, repaired: false, original_count: value.length };
  }
  const sourceScenes = Array.isArray(scenes) ? scenes : [];
  const fallbackChunks = chunkTextForScenes(fallbackText, Math.max(1, sourceScenes.length || 1));
  const lines = (sourceScenes.length > 0 ? sourceScenes : fallbackChunks.map((text, index) => ({ scene_number: index + 1, narration_text: text })))
    .map((scene, index) => ({
      scene_number: Number(scene?.scene_number ?? index + 1),
      text: firstNonEmpty(scene?.narration_text, fallbackChunks[index], fallbackText, `Scene ${index + 1}`),
    }));
  return { lines, repaired: true, original_count: Array.isArray(value) ? value.length : 0 };
}

function defaultRenderOutput() {
  return {
    width: Number.parseInt(String(process.env.RENDER_OUTPUT_WIDTH || '1080'), 10) || 1080,
    height: Number.parseInt(String(process.env.RENDER_OUTPUT_HEIGHT || '1920'), 10) || 1920,
    fps: Number.parseInt(String(process.env.RENDER_OUTPUT_FPS || '30'), 10) || 30,
    format: String(process.env.RENDER_OUTPUT_FORMAT || 'mp4').trim() || 'mp4',
  };
}

const ASSET_PLAN_MODES = new Set(['image', 'video', 'image_with_motion']);
const MOTION_REQUIREMENTS = new Set(['low', 'medium', 'high']);
const CAMERA_MOVES = new Set(['push_in', 'pull_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'drift', 'hold']);
const PAN_ZOOM_DIRECTIONS = new Set(['center_push', 'center_pull', 'left_to_right', 'right_to_left', 'bottom_to_top', 'top_to_bottom', 'diagonal_up', 'diagonal_down', 'hold']);
const TRANSITION_TYPES = new Set(['cut', 'crossfade', 'soft_cut', 'dip_to_black', 'slide_left', 'slide_right', 'wipe_up', 'match_cut']);
const OVERLAY_STYLES = new Set(['none', 'subtle_vignette', 'warm_gradient', 'cool_gradient', 'documentary_shadow', 'soft_light_leak']);
const PACING_VALUES = new Set(['quick', 'steady', 'slow', 'linger']);

function inferMotionRequirement(scene = {}) {
  const text = normalizeWhitespace([
    scene.narration_text,
    scene.visual_prompt,
    scene.image_prompt,
    scene.visual_beat,
    scene.beat_label,
  ].filter(Boolean).join(' ')).toLowerCase();
  if (/\b(chase|fight|run|rush|fall|explosion|storm|crowd|dance|vehicle|drive|crash|collapse|transform|flowing|waves?|fire|smoke|rain|walking|running|spinning)\b/.test(text)) {
    return 'high';
  }
  if (/\b(move|motion|reveal|enter|leave|turn|open|close|gesture|camera|drift|pan|zoom|tilt|light changes?)\b/.test(text)) {
    return 'medium';
  }
  return 'low';
}

function normalizeEnumValue(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.has(normalized) ? normalized : fallback;
}

function defaultCameraMove(index, motionRequirement) {
  if (motionRequirement === 'low') {
    return index % 3 === 0 ? 'hold' : 'push_in';
  }
  if (motionRequirement === 'high') {
    return ['pan_left', 'pan_right', 'tilt_up', 'push_in'][index % 4];
  }
  return ['push_in', 'pan_right', 'tilt_down', 'drift'][index % 4];
}

function defaultPanZoomDirection(cameraMove) {
  if (cameraMove === 'pull_out') return 'center_pull';
  if (cameraMove === 'pan_left') return 'right_to_left';
  if (cameraMove === 'pan_right') return 'left_to_right';
  if (cameraMove === 'tilt_up') return 'bottom_to_top';
  if (cameraMove === 'tilt_down') return 'top_to_bottom';
  if (cameraMove === 'hold') return 'hold';
  return 'center_push';
}

function defaultTransitionType(index, scene = {}) {
  const raw = String(scene.transition || '').trim().toLowerCase();
  if (raw.includes('fade')) return 'crossfade';
  if (raw.includes('black')) return 'dip_to_black';
  if (raw.includes('match')) return 'match_cut';
  if (index === 0) return 'cut';
  return index % 3 === 0 ? 'crossfade' : 'soft_cut';
}

function normalizeAssetPlan(scene = {}, index, { reelType = 'video' } = {}) {
  const raw = plainObject(scene.asset_plan);
  const rawMode = normalizeEnumValue(raw.mode ?? scene.asset_type, ASSET_PLAN_MODES, '');
  let mode = rawMode || 'image_with_motion';
  if (reelType === 'video') {
    mode = 'video';
  } else if (reelType === 'image') {
    mode = mode === 'image' ? 'image' : 'image_with_motion';
  } else if (mode === 'video') {
    mode = 'image_with_motion';
  }

  const motionRequirement = normalizeEnumValue(raw.motion_requirement, MOTION_REQUIREMENTS, inferMotionRequirement(scene));
  const videoRequired = mode === 'video';
  return {
    mode,
    provider_intent: videoRequired ? 'provider_video' : (mode === 'image' ? 'static_image' : 'remotion_motion'),
    motion_requirement: motionRequirement,
    video_generation_required: videoRequired,
    video_generation_reason: videoRequired
      ? normalizeWhitespace(raw.video_generation_reason || raw.rationale || 'The operator selected Video Reel, so this scene should be generated directly as video.')
      : normalizeWhitespace(raw.video_generation_reason || raw.rationale || 'Use a still image and let Remotion provide the camera movement and pacing.'),
    fallback_mode: 'image_with_motion',
    budget_priority: videoRequired ? 'premium' : 'standard',
    review_required: videoRequired,
    ...(raw.provider_availability ? { provider_availability: normalizeWhitespace(raw.provider_availability) } : {}),
  };
}

function normalizeRemotionGuidance(scene = {}, index, assetPlan = {}) {
  const raw = plainObject(scene.remotion ?? scene.remotion_guidance);
  const motionRequirement = normalizeEnumValue(assetPlan.motion_requirement, MOTION_REQUIREMENTS, inferMotionRequirement(scene));
  const cameraMove = normalizeEnumValue(raw.camera_move, CAMERA_MOVES, defaultCameraMove(index, motionRequirement));
  const panZoomDirection = normalizeEnumValue(raw.pan_zoom_direction ?? raw.direction, PAN_ZOOM_DIRECTIONS, defaultPanZoomDirection(cameraMove));
  const transitionType = normalizeEnumValue(raw.transition_type ?? scene.transition, TRANSITION_TYPES, defaultTransitionType(index, scene));
  const overlayStyle = normalizeEnumValue(raw.overlay_style, OVERLAY_STYLES, motionRequirement === 'high' ? 'documentary_shadow' : 'subtle_vignette');
  const pacing = normalizeEnumValue(raw.pacing, PACING_VALUES, motionRequirement === 'low' ? 'linger' : 'steady');
  const motionLayers = Array.isArray(raw.motion_layers)
    ? raw.motion_layers.map((entry) => normalizeWhitespace(entry)).filter(Boolean).slice(0, 4)
    : [];
  return {
    camera_move: cameraMove,
    pan_zoom_direction: panZoomDirection,
    motion_intensity: motionRequirement,
    transition_type: transitionType,
    overlay_style: overlayStyle,
    pacing,
    motion_layers: motionLayers.length ? motionLayers : (assetPlan.mode === 'video' ? ['subtle exposure shaping'] : ['parallax-style pan/zoom from the still image']),
    instructions: normalizeWhitespace(
      raw.instructions
      || `Use ${cameraMove.replaceAll('_', ' ')} with ${pacing} pacing so the scene motion matches the narration without adding visible text.`,
    ),
  };
}

function stripVisibleTextInstructions(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return '';
  }
  const clauses = normalized
    .split(/(?<=[.!?])\s+|;\s*/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const filtered = clauses.filter((clause) => !VISIBLE_TEXT_PROMPT_PATTERNS.some((pattern) => pattern.test(clause)));
  if (filtered.length > 0) {
    return filtered.join(' ');
  }
  const stripped = normalized
    .replace(/\b(?:central|centered|bold)?\s*title\s*:?\s*['"“][^'"”]+['"”]\.?/iu, '')
    .replace(/\btext overlay\b/giu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped || VISIBLE_TEXT_PROMPT_PATTERNS.some((pattern) => pattern.test(stripped))) {
    return TEXT_FREE_VISUAL_FALLBACK;
  }
  return stripped;
}

function buildFaceImageTitleFallback(title) {
  const words = splitFaceImageTitleWords(title).slice(0, 5);
  while (words.length > 2 && FACE_IMAGE_TITLE_STOPWORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  return words.join(' ');
}

function normalizeFaceImageTitle(value, fallbackTitle) {
  let words = splitFaceImageTitleWords(value);
  while (words.length > 2 && FACE_IMAGE_TITLE_STOPWORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  if (words.length < 2 || words.length > 5) {
    words = splitFaceImageTitleWords(buildFaceImageTitleFallback(fallbackTitle));
  }
  if (words.length < 2) {
    words = splitFaceImageTitleWords(fallbackTitle).slice(0, 5);
    while (words.length > 2 && FACE_IMAGE_TITLE_STOPWORDS.has(words[words.length - 1].toLowerCase())) {
      words.pop();
    }
  }
  return words.slice(0, 5).join(' ');
}

function normalizeTimedScenes(scenes, fieldName, { title = '', reelType = 'video' } = {}) {
  if (!Array.isArray(scenes) || scenes.length < 4 || scenes.length > 8) {
    fail(`${fieldName} must contain 4 to 8 scenes.`);
  }
  return scenes.map((scene, index) => {
    const isFirstScene = index === 0;
    const rawDurationSeconds = roundToHundredths(Number(scene?.duration_seconds ?? 0));
    const durationSeconds = isFirstScene
      ? roundToHundredths(Math.min(rawDurationSeconds, 4))
      : rawDurationSeconds;
    const assetPlan = normalizeAssetPlan({ ...scene, duration_seconds: durationSeconds }, index, { reelType });
    const remotion = normalizeRemotionGuidance(scene, index, assetPlan);
    const normalizedAssetType = assetPlan.mode === 'video' ? 'video' : 'image';
    const normalized = {
      scene_number: Number(scene?.scene_number ?? index + 1),
      duration_seconds: durationSeconds,
      narration_text: String(scene?.narration_text ?? '').trim(),
      dialogue_lines: Array.isArray(scene?.dialogue_lines)
        ? scene.dialogue_lines.map((line) => String(line ?? '').trim()).filter(Boolean)
        : [String(scene?.narration_text ?? '').trim()].filter(Boolean),
      asset_type: normalizedAssetType,
      asset_plan: assetPlan,
      remotion,
      music_cue: String(scene?.music_cue ?? '').trim(),
      includes_primary_character: scene?.includes_primary_character === true,
    };
    if (fieldName === 'scene_guidance_json') {
      normalized.beat_label = String(scene?.beat_label ?? '').trim();
      normalized.start_time_seconds = roundToHundredths(Number(scene?.start_time_seconds ?? 0));
      normalized.end_time_seconds = roundToHundredths(Number(scene?.end_time_seconds ?? 0));
      normalized.image_prompt = stripVisibleTextInstructions(String(scene?.image_prompt ?? '').trim());
      normalized.tts_instructions = String(scene?.tts_instructions ?? '').trim() || buildDefaultTtsInstructions(scene);
      normalized.scene_purpose = String(scene?.scene_purpose ?? '').trim();
      normalized.visual_beat = String(scene?.visual_beat ?? '').trim();
      normalized.source_boundary = String(scene?.source_boundary ?? '').trim();
    } else {
      normalized.visual_prompt = stripVisibleTextInstructions(String(scene?.visual_prompt ?? '').trim());
      normalized.transition = String(scene?.transition ?? '').trim();
      normalized.mood = String(scene?.mood ?? '').trim();
      normalized.tts_instructions = String(scene?.tts_instructions ?? '').trim() || buildDefaultTtsInstructions(scene);
      normalized.is_face_image = reelType === 'image' && (isFirstScene || scene?.is_face_image === true);
      normalized.face_image_title = isFirstScene
        ? normalizeFaceImageTitle(String(scene?.face_image_title ?? '').trim(), title)
        : '';
    }
    return normalized;
  });
}

function validateScenes(sceneGuidanceJson, storyboardJson, targetDurationSeconds) {
  if (sceneGuidanceJson.length !== storyboardJson.length) {
    fail('story package scene_guidance_json and storyboard_json must have the same scene count.');
  }
  let previousEndSeconds = 0;
  sceneGuidanceJson.forEach((scene, index) => {
    if (scene.scene_number !== index + 1 || storyboardJson[index].scene_number !== index + 1) {
      fail('story package scenes must be sequential starting at 1.');
    }
    if (!scene.beat_label || !scene.narration_text || !scene.dialogue_lines.length || !scene.image_prompt || !scene.music_cue) {
      fail(`scene_guidance_json scene ${index + 1} is incomplete.`);
    }
    if (!storyboardJson[index].narration_text || !storyboardJson[index].dialogue_lines.length || !storyboardJson[index].visual_prompt || !storyboardJson[index].transition || !storyboardJson[index].mood || !storyboardJson[index].music_cue) {
      fail(`storyboard_json scene ${index + 1} is incomplete.`);
    }
    const sceneTextValues = [
      scene.narration_text,
      ...scene.dialogue_lines,
      storyboardJson[index].narration_text,
      ...storyboardJson[index].dialogue_lines,
    ];
    if (sceneTextValues.some((value) => isMetaNarrationInstruction(value))) {
      fail(`story package scene ${index + 1} contains pipeline-meta narration text instead of concrete scene content.`);
    }
    const promptTextValues = [
      scene.image_prompt,
      storyboardJson[index].visual_prompt,
    ];
    if (promptTextValues.some((value) => isMetaNarrationInstruction(value))) {
      fail(`story package scene ${index + 1} visual prompt contains pipeline-meta text instead of a concrete visual beat.`);
    }
    if (scene.start_time_seconds < 0 || scene.end_time_seconds <= scene.start_time_seconds || scene.duration_seconds <= 0) {
      fail(`scene_guidance_json scene ${index + 1} has invalid timing.`);
    }
    if (Math.abs((scene.end_time_seconds - scene.start_time_seconds) - scene.duration_seconds) > 0.75) {
      fail(`scene_guidance_json scene ${index + 1} duration does not match its start/end time.`);
    }
    if (index === 0 && Math.abs(scene.start_time_seconds) > 0.5) {
      fail('scene_guidance_json must start at 0 seconds.');
    }
    if (index > 0 && Math.abs(scene.start_time_seconds - previousEndSeconds) > 0.75) {
      fail('scene_guidance_json timings must be contiguous.');
    }
    previousEndSeconds = scene.end_time_seconds;
  });
  if (Number.isFinite(targetDurationSeconds) && targetDurationSeconds > 0) {
    const finalEndSeconds = sceneGuidanceJson[sceneGuidanceJson.length - 1]?.end_time_seconds ?? 0;
    if (Math.abs(finalEndSeconds - targetDurationSeconds) > Math.max(2, targetDurationSeconds * 0.2)) {
      fail('scene_guidance_json must end close to target_duration_seconds.');
    }
  }
}

function normalizeSubtitleLines(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('subtitle_lines_json must contain metadata lines.');
  }
  return value.map((line, index) => ({
    scene_number: Number(line?.scene_number ?? index + 1),
    text: String(line?.text ?? '').trim(),
  }));
}

async function main() {
  const client = new Client({
    host: ensureString('DB_POSTGRESDB_HOST', process.env.DB_POSTGRESDB_HOST),
    port: Number.parseInt(String(process.env.DB_POSTGRESDB_PORT || '5432'), 10) || 5432,
    database: ensureString('DB_POSTGRESDB_DATABASE', process.env.DB_POSTGRESDB_DATABASE),
    user: ensureString('DB_POSTGRESDB_USER', process.env.DB_POSTGRESDB_USER),
    password: ensureString('DB_POSTGRESDB_PASSWORD', process.env.DB_POSTGRESDB_PASSWORD),
  });
  await client.connect();
  try {
    await client.query(CLIENT_ACCOUNT_CONTEXT_SCHEMA_SQL);
    const targetContentId = String(process.env.CODE_PIPELINE_CONTENT_ID || process.env.PIPELINE_CONTENT_ID || '').trim();
    if (targetContentId && !UUID_PATTERN.test(targetContentId)) {
      fail(`CODE_PIPELINE_CONTENT_ID must be a valid UUID when provided. Received: ${targetContentId}.`);
    }
    const claim = await client.query(`
      with candidate as materialized (
        select
          ci.content_id,
          ci.title,
          ci.category,
          ci.reel_type,
          ci.confidence_label,
          ci.target_duration_seconds,
          ci.source_payload_json,
          coalesce(cac.context_snapshot_json, ci.source_payload_json->'client_account_context', '{}'::jsonb) as client_account_context
        from content_items ci
        left join content_account_contexts cac on cac.content_id = ci.content_id
        where (
            ($1::uuid is null and ci.status = 'idea_approved')
            or ($1::uuid is not null and ci.content_id = $1::uuid and ci.status in ('idea_approved', 'scripting'))
          )
        order by ci.created_at asc
        limit 1
      ), claim as (
        update content_items ci
        set status = 'scripting',
            updated_at = now()
        where ci.content_id = (select content_id from candidate)
          and (
            ci.status = 'idea_approved'
            or ($1::uuid is not null and ci.status = 'scripting')
          )
        returning ci.content_id
      )
      select c.*
      from candidate c
      join claim cl on cl.content_id = c.content_id
    `, [targetContentId || null]);
    if (claim.rowCount === 0) {
      fail('No idea_approved content item is available for story package generation.');
    }
    const item = claim.rows[0];
    const contentId = ensureString('content_id', item.content_id);
    const title = ensureString('title', item.title);
    const category = String(item.category || 'general').trim() || 'general';
    const confidenceLabel = String(item.confidence_label || 'unverified').trim() || 'unverified';
    const targetDurationSeconds = Number(item.target_duration_seconds || 45);
    const sourcePayload = item.source_payload_json && typeof item.source_payload_json === 'object' ? item.source_payload_json : {};
    const reelType = normalizeReelType(item.reel_type || sourcePayload.reel_type || process.env.DEFAULT_REEL_TYPE || 'video');
    const clientAccountContext = plainObject(item.client_account_context);
    const brandPolicy = plainObject(clientAccountContext.brand_policy);
    const stylePolicy = plainObject(clientAccountContext.style_policy);
    const voicePolicy = plainObject(clientAccountContext.voice_policy);
    const musicPolicy = plainObject(clientAccountContext.music_policy);
    const sourceNotes = collectSourceNotes(sourcePayload);
    const characterReferenceContext = buildCharacterReferencePromptContext(sourcePayload);

    const storyPackageStage = resolveStoryPackageStage();
    const result = await invokeStructuredTextStage(storyPackageStage, {
      content_id: contentId,
      title,
      target_duration_seconds: targetDurationSeconds,
      status_after_success: 'storyboard_complete',
      prompt_template_data: {
        topic: title,
        category,
        confidence_context: `Current stored confidence label: ${confidenceLabel}. Preserve or lower certainty unless the source notes clearly support a stronger confidence label.`,
        source_notes: sourceNotes,
        reel_type: reelType,
        asset_generation_mode: reelType === 'video'
          ? 'Video Reel: generate provider video directly for every storyboard scene. Do not plan an image-first reel. Remotion should still handle final pacing, overlays, title, and scene transitions.'
          : 'Image Reel: generate still scene assets and use Remotion for camera moves, pan/zoom, overlays, pacing, and transitions. Default scenes to image_with_motion unless a scene should remain static.',
        target_duration_seconds: String(targetDurationSeconds),
        client_account_context: clientAccountContext,
        client_account_context_json: Object.keys(clientAccountContext).length > 0 ? JSON.stringify(clientAccountContext, null, 2) : '{}',
        brand_tone: firstNonEmpty(process.env.STORY_PACKAGE_BRAND_TONE, brandPolicy.brand_tone, process.env.STUDIO_BRAND_TONE, 'cinematic, emotionally vivid, credible'),
        narrator_style: firstNonEmpty(process.env.STORY_PACKAGE_NARRATOR_STYLE, voicePolicy.narrator_style, process.env.RESEARCH_NARRATOR_STYLE, 'cinematic voiceover, human, emotional, natural pauses'),
        ending_signature_family: String(process.env.RESEARCH_ENDING_SIGNATURE_FAMILY || 'memorable reflective close').trim(),
        visual_style_rules: firstNonEmpty(process.env.STORY_PACKAGE_VISUAL_STYLE_RULES, stylePolicy.visual_style_notes, process.env.STORYBOARD_VISUAL_STYLE_RULES, 'documentary-realistic, cinematic, strong focal point, no visible text'),
        background_music_direction: firstNonEmpty(musicPolicy.music_mood),
        character_reference_context: characterReferenceContext,
      },
    });

    const rawResponse = storyPackageStage === 'story_package_generation_v2'
      ? result.story_package_v2_response
      : result.story_package_response;
    const response = storyPackageStage === 'story_package_generation_v2'
      ? mapStoryPackageV2ToLegacyResponse(rawResponse, {
        title,
        targetDurationSeconds,
        confidenceLabel,
        reelType,
      })
      : (rawResponse ?? {});
    const requiredTextFields = ['confidence_label', 'hook_option_1', 'hook_option_2', 'hook_option_3', 'selected_hook', 'narration_script', 'short_script', 'caption_draft', 'cta_line', 'music_direction'];
    for (const field of requiredTextFields) {
      if (!String(response[field] ?? '').trim()) {
        fail(`story package returned an empty ${field}.`);
      }
    }
    if (isMetaNarrationInstruction(response.narration_script) && wordCount(response.short_script) >= 12) {
      fail('story package narration_script is a pipeline-meta no-narration instruction instead of usable spoken/story content.');
    }
    assertStoryPackageSceneArrays(response);
    const repairedSceneTargetCount = targetSceneCountForRepair(
      response.scene_guidance_json,
      response.storyboard_json,
      targetDurationSeconds,
    );
    const sceneCountRepairs = [];
    const repairedSceneGuidance = repairTimedSceneCount(response.scene_guidance_json, 'scene_guidance_json', {
      targetCount: repairedSceneTargetCount,
      targetDurationSeconds,
      title,
      narrationScript: response.narration_script,
      reelType,
    });
    const repairedStoryboard = repairTimedSceneCount(response.storyboard_json, 'storyboard_json', {
      targetCount: repairedSceneTargetCount,
      targetDurationSeconds,
      title,
      narrationScript: response.narration_script,
      reelType,
    });
    if (repairedSceneGuidance.repaired) {
      sceneCountRepairs.push({
        field: 'scene_guidance_json',
        original_count: repairedSceneGuidance.original_count,
        repaired_count: repairedSceneTargetCount,
      });
      response.scene_guidance_json = repairedSceneGuidance.scenes;
    }
    if (repairedStoryboard.repaired) {
      sceneCountRepairs.push({
        field: 'storyboard_json',
        original_count: repairedStoryboard.original_count,
        repaired_count: repairedSceneTargetCount,
      });
      response.storyboard_json = repairedStoryboard.scenes;
    }
    const metadataRepairs = [];
    const onscreenTextJson = normalizeSubtitleLines(response.onscreen_text_json);
    const sceneGuidanceJson = normalizeTimedScenes(response.scene_guidance_json, 'scene_guidance_json', { title, reelType });
    const storyboardJson = normalizeTimedScenes(response.storyboard_json, 'storyboard_json', { title, reelType });
    if (storyboardJson[0]) {
      storyboardJson[0].is_face_image = reelType === 'image';
      storyboardJson[0].asset_type = storyboardJson[0].asset_plan.mode === 'video' ? 'video' : 'image';
      storyboardJson[0].duration_seconds = roundToHundredths(Math.min(Number(storyboardJson[0].duration_seconds || 0), 4));
      storyboardJson[0].face_image_title = normalizeFaceImageTitle(
        String(storyboardJson[0].face_image_title || '').trim(),
        title,
      ) || buildFaceImageTitleFallback(title);
      storyboardJson[0].visual_prompt = stripVisibleTextInstructions(storyboardJson[0].visual_prompt);
    }
    for (const scene of storyboardJson.slice(1)) {
      scene.is_face_image = false;
      scene.face_image_title = '';
      scene.asset_type = scene.asset_plan.mode === 'video' ? 'video' : 'image';
    }
    validateScenes(sceneGuidanceJson, storyboardJson, targetDurationSeconds);
    const repairedSubtitleLines = repairSubtitleLines(response.subtitle_lines_json, sceneGuidanceJson, response.narration_script);
    if (repairedSubtitleLines.repaired) {
      metadataRepairs.push({
        field: 'subtitle_lines_json',
        original_count: repairedSubtitleLines.original_count,
        repaired_count: repairedSubtitleLines.lines.length,
      });
      response.subtitle_lines_json = repairedSubtitleLines.lines;
    }
    const subtitleLinesJson = normalizeSubtitleLines(response.subtitle_lines_json);
    const renderManifestSeedJson = plainObject(response.render_manifest_seed_json)
      ? { ...response.render_manifest_seed_json }
      : {};
    const existingOutput = plainObject(renderManifestSeedJson.output);
    if (!existingOutput.width || !existingOutput.height || !existingOutput.fps || !existingOutput.format) {
      renderManifestSeedJson.output = { ...defaultRenderOutput(), ...existingOutput };
      metadataRepairs.push({
        field: 'render_manifest_seed_json.output',
        repaired: true,
      });
    }
    const existingSubtitles = plainObject(renderManifestSeedJson.subtitles);
    renderManifestSeedJson.subtitles = {
      style: String(process.env.RENDER_SUBTITLE_STYLE || existingSubtitles.style || 'none').trim() || 'none',
      ...existingSubtitles,
      enabled: false,
    };
    renderManifestSeedJson.timeline = storyboardJson.map((scene) => ({
      scene_number: scene.scene_number,
      duration_seconds: scene.duration_seconds,
      asset_type: scene.asset_type,
      asset_plan: scene.asset_plan,
      remotion: scene.remotion,
      transition: String(scene.transition || 'cut').trim() || 'cut',
    }));
    if (!renderManifestSeedJson.output || !Array.isArray(renderManifestSeedJson.timeline)) {
      fail('render_manifest_seed_json is missing output or timeline.');
    }

    const scriptRawResponse = {
      provider: String(result.generation_provider || result.llm_provider || 'openai').trim(),
      generation_model: String(result.generation_model || '').trim(),
      provider_metadata: result.provider_metadata ?? {},
      scene_count_repairs: sceneCountRepairs,
      metadata_repairs: metadataRepairs,
      creative_direction_json: response.creative_direction_json ?? {},
      scene_guidance_json: sceneGuidanceJson,
      parsed_response: { ...response, scene_guidance_json: sceneGuidanceJson },
      story_package_stage: storyPackageStage,
      story_package_v2_response: storyPackageStage === 'story_package_generation_v2' ? rawResponse : undefined,
      v2_story_package: true,
    };
    const storyPackageCost = result.cost ?? {};
    const storyboardRaw = {
      provider: scriptRawResponse.provider,
      generation_model: scriptRawResponse.generation_model,
      provider_metadata: scriptRawResponse.provider_metadata,
      scene_count_repairs: sceneCountRepairs,
      metadata_repairs: metadataRepairs,
      script_scene_guidance_json: sceneGuidanceJson,
      creative_direction_json: response.creative_direction_json ?? {},
      parsed_response: { ...response, storyboard_json: storyboardJson },
      v2_story_package: true,
    };

    await client.query('begin');
    await client.query(`
      insert into scripts (
        content_id, hook_option_1, hook_option_2, hook_option_3, selected_hook,
        narration_script, short_script, caption_draft, cta_line,
        onscreen_text_json, generation_model, raw_response_json, approved_by_human
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,false)
      on conflict (content_id) do update set
        hook_option_1 = excluded.hook_option_1,
        hook_option_2 = excluded.hook_option_2,
        hook_option_3 = excluded.hook_option_3,
        selected_hook = excluded.selected_hook,
        narration_script = excluded.narration_script,
        short_script = excluded.short_script,
        caption_draft = excluded.caption_draft,
        cta_line = excluded.cta_line,
        onscreen_text_json = excluded.onscreen_text_json,
        generation_model = excluded.generation_model,
        raw_response_json = excluded.raw_response_json,
        generated_at = now()
    `, [
      contentId,
      String(response.hook_option_1).trim(),
      String(response.hook_option_2).trim(),
      String(response.hook_option_3).trim(),
      String(response.selected_hook).trim(),
      String(response.narration_script).trim(),
      String(response.short_script).trim(),
      String(response.caption_draft).trim(),
      String(response.cta_line).trim(),
      JSON.stringify(onscreenTextJson),
      String(result.generation_model || '').trim(),
      JSON.stringify(scriptRawResponse),
    ]);
    await client.query(`
      insert into storyboards (
        content_id, storyboard_json, cover_prompt, subtitle_lines_json, style_notes, render_manifest_seed_json
      )
      values ($1,$2::jsonb,$3,$4::jsonb,$5,$6::jsonb)
      on conflict (content_id) do update set
        storyboard_json = excluded.storyboard_json,
        cover_prompt = excluded.cover_prompt,
        subtitle_lines_json = excluded.subtitle_lines_json,
        style_notes = excluded.style_notes,
        render_manifest_seed_json = excluded.render_manifest_seed_json,
        generated_at = now()
    `, [
      contentId,
      JSON.stringify(storyboardJson),
      stripVisibleTextInstructions(String(response.cover_prompt || '').trim()),
      JSON.stringify(subtitleLinesJson),
      `${String(response.style_notes || '').trim()}\n\nVisual style summary: ${String(response.visual_style_summary || '').trim()}\nModel: ${String(result.generation_model || '').trim()}\n\nRaw story package: ${JSON.stringify(storyboardRaw)}`,
      JSON.stringify(renderManifestSeedJson),
    ]);
    await client.query(`
      update content_items
      set status = 'storyboard_complete',
          confidence_label = $2,
          updated_at = now()
      where content_id = $1
    `, [contentId, String(response.confidence_label || confidenceLabel).trim()]);
    await client.query(`
      insert into workflow_runs (content_id, workflow_name, run_status, started_at, ended_at, duration_ms, error_message, details_json)
      values ($1, 'wf_story_package_generation', 'success', now(), now(), 0, null, $2::jsonb)
    `, [contentId, JSON.stringify({
      generation_provider: scriptRawResponse.provider,
      generation_model: scriptRawResponse.generation_model,
      scene_count: storyboardJson.length,
      selected_hook: String(response.selected_hook || '').trim(),
      music_direction: String(response.music_direction || '').trim(),
      cost: storyPackageCost,
      story_package_stage: storyPackageStage,
      account_context_key: String(clientAccountContext.account_context_key || '').trim(),
    })]);
    await client.query('commit');

    process.stdout.write(`${JSON.stringify({
      content_id: contentId,
      title,
      workflow_name: 'wf_story_package_generation',
      status_after_success: 'storyboard_complete',
      generation_provider: scriptRawResponse.provider,
      generation_model: scriptRawResponse.generation_model,
      story_package_stage: storyPackageStage,
      scene_count: storyboardJson.length,
    })}\n`);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
