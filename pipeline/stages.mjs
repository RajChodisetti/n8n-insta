import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction } from './db.mjs';
import { uploadBinaryAsset } from '../workflows/scripts/asset_host_adapters.mjs';
import { firstEnv } from '../workflows/scripts/adapter_config.mjs';
import { invokeStructuredTextStage } from '../workflows/scripts/invoke_structured_text_adapter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message) {
  throw new Error(message);
}

function ensureUuid(value, name = 'content_id') {
  const normalized = String(value || '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    fail(`${name} must be a valid UUID.`);
  }
  return normalized;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function trimString(value) {
  return String(value ?? '').trim();
}

function roundToHundredths(value) {
  return Number(Number(value || 0).toFixed(2));
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function buildPayloadInvocationArgs(payload, label = 'payload') {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, 'utf8').toString('base64');
  if (encoded.length < 100000) {
    return { args: [encoded], cleanup: () => {} };
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-insta-payload-'));
  const filePath = path.join(tempDir, `${label}.json`);
  fs.writeFileSync(filePath, json, 'utf8');
  return {
    args: ['--payload-file', filePath],
    cleanup: () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function objectKeyForRole(contentId, role, extension) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const prefix = trimString(process.env.REELS_STORAGE_KEY_PREFIX || 'generated/instagram-posts').replace(/^\/+|\/+$/g, '') || 'generated/instagram-posts';
  const safeRole = trimString(role || 'asset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
  const safeExtension = trimString(extension || 'bin').replace(/^\.+/, '') || 'bin';
  return `${prefix}/${safeRole}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${contentId}.${safeExtension}`;
}

function parseJsonOutput(stdout, label) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      // Keep scanning; helper scripts may print informational lines.
    }
  }
  fail(`${label} did not return JSON output.`);
}

function runNodeScript(relativeScriptPath, args = [], { env = {}, label = relativeScriptPath } = {}) {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, relativeScriptPath), ...args],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    const stderr = trimString(result.stderr);
    const stdout = trimString(result.stdout);
    const diagnostics = [
      result.error?.message ? `spawn error: ${result.error.message}` : '',
      result.signal ? `signal: ${result.signal}` : '',
      stderr,
      stdout,
    ].filter(Boolean);
    fail(`${label} failed${diagnostics.length ? `: ${diagnostics.join(' | ')}` : '.'}`);
  }
  return parseJsonOutput(result.stdout, label);
}

async function logWorkflowRun(client, {
  contentId,
  workflowName,
  runStatus = 'success',
  startedAt = new Date().toISOString(),
  durationMs = 0,
  errorMessage = null,
  details = {},
}) {
  await client.query(
    `insert into workflow_runs (
      content_id,
      workflow_name,
      run_status,
      started_at,
      ended_at,
      duration_ms,
      error_message,
      details_json
    ) values ($1,$2,$3,$4::timestamptz,now(),$5,$6,$7::jsonb)`,
    [
      contentId,
      workflowName,
      runStatus,
      startedAt,
      Math.max(0, Number(durationMs) || 0),
      errorMessage,
      JSON.stringify(details ?? {}),
    ],
  );
}

function durationMsFrom(startedAt) {
  const started = new Date(String(startedAt || new Date().toISOString()));
  return Math.max(0, Date.now() - started.getTime());
}

async function runStoryPackageGeneration({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  return runNodeScript(
    'workflows/scripts/run_story_package_generation.mjs',
    [],
    {
      label: 'story_package_generation',
      env: {
        CODE_PIPELINE_CONTENT_ID: contentId,
      },
    },
  );
}

const STORY_SCENE_COUNT_MIN = 4;
const STORY_SCENE_COUNT_MAX = 8;
const STRONG_VISUAL_PROMPT_MIN_WORDS = 12;
const GENERIC_STORY_PROMPT_PATTERNS = [
  /\bsymbolic (image|scene|representation)\b/i,
  /\babstract (image|scene|visual|representation)\b/i,
  /\bmysterious (figure|silhouette|person)\b/i,
  /\bdark moody (scene|background|atmosphere)\b/i,
  /\bdramatic (background|atmosphere)\b/i,
  /\bpeople in (the )?shadows\b/i,
  /\batmospheric background\b/i,
  /\bominous vibe\b/i,
  /\bgeneric mood\b/i,
];
const VISIBLE_TEXT_RISK_PATTERNS = [
  /\b(with|showing|featuring|displaying|include|including|add|adding)\s+(?:a\s+)?(?:readable\s+)?(?:title|text|label|logo|sign|caption|subtitle|headline|watermark)\b/i,
  /\b(title text|text overlay|words on screen|readable headline|newspaper headline|labeled map|map labels|UI text|speech bubble)\b/i,
];
const TEXT_POLICY_NEGATION_PATTERN = /\b(no|without|avoid|exclude|free of|text[- ]free|do not include|must not include|absolutely no)\b.{0,80}\b(readable text|visible text|text|subtitles?|captions?|logos?|labels?|watermarks?|signage|typography)\b/i;
const QUALITY_ASSET_PLAN_MODES = new Set(['image', 'video', 'image_with_motion']);
const QUALITY_MOTION_REQUIREMENTS = new Set(['low', 'medium', 'high']);
const QUALITY_CAMERA_MOVES = new Set(['push_in', 'pull_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'drift', 'hold']);
const QUALITY_PAN_ZOOM_DIRECTIONS = new Set(['center_push', 'center_pull', 'left_to_right', 'right_to_left', 'bottom_to_top', 'top_to_bottom', 'diagonal_up', 'diagonal_down', 'hold']);
const QUALITY_TRANSITION_TYPES = new Set(['cut', 'crossfade', 'soft_cut', 'dip_to_black', 'slide_left', 'slide_right', 'wipe_up', 'match_cut']);
const QUALITY_OVERLAY_STYLES = new Set(['none', 'subtle_vignette', 'warm_gradient', 'cool_gradient', 'documentary_shadow', 'soft_light_leak']);
const QUALITY_PACING_VALUES = new Set(['quick', 'steady', 'slow', 'linger']);

function wordCount(value) {
  return trimString(value).split(/\s+/).filter(Boolean).length;
}

function isGenericVisualPrompt(value) {
  const prompt = trimString(value);
  return GENERIC_STORY_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt));
}

function hasVisibleTextRisk(value) {
  const prompt = trimString(value);
  if (!prompt || TEXT_POLICY_NEGATION_PATTERN.test(prompt)) {
    return false;
  }
  return VISIBLE_TEXT_RISK_PATTERNS.some((pattern) => pattern.test(prompt));
}

function visualPromptQuality(value) {
  const prompt = trimString(value);
  if (!prompt) {
    return { score: 0, strong: false, reason: 'missing' };
  }
  const words = wordCount(prompt);
  if (words < STRONG_VISUAL_PROMPT_MIN_WORDS) {
    return { score: words, strong: false, reason: 'too_short' };
  }
  if (isGenericVisualPrompt(prompt)) {
    return { score: words - 4, strong: false, reason: 'generic' };
  }
  if (hasVisibleTextRisk(prompt)) {
    return { score: words - 8, strong: false, reason: 'visible_text_risk' };
  }
  return { score: words, strong: true, reason: 'strong' };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleVariants(title) {
  const normalizedTitle = trimString(title);
  if (!normalizedTitle) return [];
  const variants = [
    normalizedTitle,
    normalizedTitle.replace(/[“”"]/g, '').trim(),
    normalizedTitle.split(/[—–-]/)[0]?.trim(),
  ].filter((value) => trimString(value).length >= 8);
  return [...new Set(variants)];
}

function sanitizeGeneratedAssetPrompt(value, {
  title = '',
  narrationText = '',
  sceneNumber = null,
} = {}) {
  let prompt = trimString(value);
  const narration = trimString(narrationText);
  if (!prompt) {
    prompt = narration;
  }

  prompt = prompt
    .replace(/\bshown as\s+(?:a\s+)?(?:cinematic,\s*)?(?:text-free\s+)?visual metaphor for\s*:\s*/i, '')
    .replace(/\bvisual metaphor for\s*:\s*/i, '')
    .replace(/\btext-free\b/gi, '')
    .replace(/\bno readable labels or UI\b/gi, '');

  for (const variant of titleVariants(title)) {
    prompt = prompt.replace(new RegExp(escapeRegExp(variant), 'gi'), '');
  }

  prompt = prompt
    .replace(/^[\s:,\-.—–]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (wordCount(prompt) < 8 && narration) {
    prompt = `Cinematic vertical scene ${sceneNumber || ''}: ${narration}. Represent the idea through concrete people, objects, light, motion, and setting with blank unmarked surfaces.`;
  }

  return prompt;
}

function normalizeQualityEnum(value, allowed, fallback) {
  const normalized = trimString(value).toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.has(normalized) ? normalized : fallback;
}

function inferQualityMotionRequirement(scene = {}) {
  const text = [
    scene.narration_text,
    scene.visual_prompt,
    scene.image_prompt,
    scene.mood,
    scene.beat_label,
  ].map((value) => trimString(value)).filter(Boolean).join(' ').toLowerCase();
  if (/\b(chase|fight|run|rush|fall|explosion|storm|crowd|dance|vehicle|drive|crash|collapse|transform|flowing|waves?|fire|smoke|rain|walking|running|spinning)\b/.test(text)) {
    return 'high';
  }
  if (/\b(move|motion|reveal|enter|leave|turn|open|close|gesture|camera|drift|pan|zoom|tilt|light changes?)\b/.test(text)) {
    return 'medium';
  }
  return 'low';
}

function defaultQualityCameraMove(index, motionRequirement) {
  if (motionRequirement === 'low') {
    return index % 3 === 0 ? 'hold' : 'push_in';
  }
  if (motionRequirement === 'high') {
    return ['pan_left', 'pan_right', 'tilt_up', 'push_in'][index % 4];
  }
  return ['push_in', 'pan_right', 'tilt_down', 'drift'][index % 4];
}

function defaultQualityPanZoomDirection(cameraMove) {
  return {
    pull_out: 'center_pull',
    pan_left: 'right_to_left',
    pan_right: 'left_to_right',
    tilt_up: 'bottom_to_top',
    tilt_down: 'top_to_bottom',
    drift: 'diagonal_up',
    hold: 'hold',
  }[cameraMove] || 'center_push';
}

function defaultQualityAssetMode(index, reelType) {
  if (reelType === 'video') return 'video';
  if (reelType === 'image') return index === 0 ? 'image' : 'image_with_motion';
  return index === 0 ? 'image' : 'image_with_motion';
}

function normalizeQualityAssetPlan(scene, index, reelType, repairs) {
  const raw = asObject(scene.asset_plan);
  const fallbackMode = defaultQualityAssetMode(index, reelType);
  let mode = normalizeQualityEnum(raw.mode || scene.asset_type, QUALITY_ASSET_PLAN_MODES, fallbackMode);
  if (reelType === 'image' && mode === 'video') {
    repairs.push(`scene ${index + 1}: changed video asset_plan to image_with_motion for image reel`);
    mode = index === 0 ? 'image' : 'image_with_motion';
  }
  if (reelType === 'video' && mode !== 'video') {
    repairs.push(`scene ${index + 1}: promoted asset_plan to provider video for video reel`);
    mode = 'video';
  }
  const motionRequirement = normalizeQualityEnum(
    raw.motion_requirement || inferQualityMotionRequirement(scene),
    QUALITY_MOTION_REQUIREMENTS,
    inferQualityMotionRequirement(scene),
  );
  return {
    ...raw,
    mode,
    provider_intent: mode === 'video' ? 'provider_video' : (mode === 'image' ? 'static_image' : 'remotion_motion'),
    motion_requirement: motionRequirement,
    video_generation_required: mode === 'video',
    video_generation_reason: trimString(raw.video_generation_reason)
      || (mode === 'video'
        ? 'Video Reel scene selected for provider video generation.'
        : 'Still asset uses Remotion motion in the final render.'),
    fallback_mode: 'image_with_motion',
    budget_priority: mode === 'video' ? 'premium' : 'standard',
    review_required: mode === 'video' || raw.review_required === true,
  };
}

function normalizeQualityRemotion(scene, index, assetPlan, repairs) {
  const raw = asObject(scene.remotion);
  const motion = normalizeQualityEnum(raw.motion_intensity || assetPlan.motion_requirement, QUALITY_MOTION_REQUIREMENTS, assetPlan.motion_requirement || 'medium');
  const cameraMove = normalizeQualityEnum(raw.camera_move, QUALITY_CAMERA_MOVES, defaultQualityCameraMove(index, motion));
  const transition = normalizeQualityEnum(raw.transition_type || scene.transition, QUALITY_TRANSITION_TYPES, index === 0 ? 'cut' : 'soft_cut');
  const normalized = {
    camera_move: cameraMove,
    pan_zoom_direction: normalizeQualityEnum(raw.pan_zoom_direction, QUALITY_PAN_ZOOM_DIRECTIONS, defaultQualityPanZoomDirection(cameraMove)),
    motion_intensity: motion,
    transition_type: transition,
    overlay_style: normalizeQualityEnum(raw.overlay_style, QUALITY_OVERLAY_STYLES, motion === 'high' ? 'documentary_shadow' : 'subtle_vignette'),
    pacing: normalizeQualityEnum(raw.pacing, QUALITY_PACING_VALUES, motion === 'low' ? 'linger' : 'steady'),
    motion_layers: asArray(raw.motion_layers).map((entry) => trimString(entry)).filter(Boolean).slice(0, 4),
    instructions: trimString(raw.instructions) || `Use ${cameraMove.replace(/_/g, ' ')} motion to support the scene beat.`,
  };
  if (!trimString(raw.camera_move) || !trimString(raw.transition_type)) {
    repairs.push(`scene ${index + 1}: filled Remotion motion defaults`);
  }
  return normalized;
}

function findGuidanceForScene(guidanceScenes, sceneNumber, index) {
  return asObject(
    guidanceScenes.find((scene) => Number(scene?.scene_number ?? 0) === sceneNumber)
    || guidanceScenes[index],
  );
}

function normalizeStoryPackageQuality(row) {
  const reelType = trimString(row.reel_type || 'video').toLowerCase() || 'video';
  const targetDurationSeconds = Number(row.target_duration_seconds || 0);
  const rawResponse = asObject(row.raw_response_json);
  const storyboard = asArray(row.storyboard_json);
  const guidanceScenes = asArray(
    rawResponse.scene_guidance_json
    || asObject(rawResponse.parsed_response).scene_guidance_json,
  );
  const blockingIssues = [];
  const warnings = [];
  const repairs = [];

  if (storyboard.length < STORY_SCENE_COUNT_MIN || storyboard.length > STORY_SCENE_COUNT_MAX) {
    blockingIssues.push(`storyboard_json must contain ${STORY_SCENE_COUNT_MIN}-${STORY_SCENE_COUNT_MAX} scenes; got ${storyboard.length}.`);
  }
  if (!trimString(row.selected_hook)) {
    blockingIssues.push('selected_hook is empty.');
  }
  if (!trimString(row.narration_script)) {
    blockingIssues.push('narration_script is empty.');
  }

  let currentStartSeconds = 0;
  const nextGuidanceScenes = [];
  const nextStoryboard = storyboard.map((sceneValue, index) => {
    const scene = asObject(sceneValue);
    const sceneNumber = index + 1;
    const guidance = findGuidanceForScene(guidanceScenes, Number(scene.scene_number ?? sceneNumber), index);
    const duration = roundToHundredths(
      Number(scene.duration_seconds ?? guidance.duration_seconds ?? 0) > 0
        ? Number(scene.duration_seconds ?? guidance.duration_seconds)
        : Math.max(2, targetDurationSeconds > 0 ? targetDurationSeconds / Math.max(storyboard.length, 1) : 4),
    );
    if (duration <= 0) {
      blockingIssues.push(`scene ${sceneNumber}: duration_seconds must be positive.`);
    }
    if (Number(scene.scene_number ?? sceneNumber) !== sceneNumber) {
      repairs.push(`scene ${sceneNumber}: repaired sequential scene_number`);
    }

    const narrationText = trimString(scene.narration_text || guidance.narration_text);
    const dialogueLines = asArray(scene.dialogue_lines).map((line) => trimString(line)).filter(Boolean);
    const nextDialogueLines = dialogueLines.length ? dialogueLines : [narrationText].filter(Boolean);
    if (!narrationText || nextDialogueLines.length === 0) {
      blockingIssues.push(`scene ${sceneNumber}: narration_text and dialogue_lines are required.`);
    }

    const visualPrompt = sanitizeGeneratedAssetPrompt(scene.visual_prompt, {
      title: row.title,
      narrationText: trimString(scene.narration_text || guidance.narration_text),
      sceneNumber,
    });
    const guidanceImagePrompt = trimString(guidance.image_prompt)
      ? sanitizeGeneratedAssetPrompt(guidance.image_prompt, {
        title: row.title,
        narrationText: trimString(scene.narration_text || guidance.narration_text),
        sceneNumber,
      })
      : '';
    const visualQuality = visualPromptQuality(visualPrompt);
    const imageQuality = visualPromptQuality(guidanceImagePrompt);
    let nextVisualPrompt = visualPrompt;
    let nextImagePrompt = trimString(scene.image_prompt)
      ? sanitizeGeneratedAssetPrompt(scene.image_prompt, {
        title: row.title,
        narrationText,
        sceneNumber,
      })
      : '';
    if (imageQuality.strong) {
      const hadImagePrompt = Boolean(nextImagePrompt);
      nextImagePrompt = guidanceImagePrompt;
      if (!visualQuality.strong || imageQuality.score > visualQuality.score + 8) {
        nextVisualPrompt = guidanceImagePrompt;
        repairs.push(`scene ${sceneNumber}: promoted scene_guidance_json.image_prompt into storyboard visual_prompt`);
      } else if (!hadImagePrompt) {
        repairs.push(`scene ${sceneNumber}: copied scene_guidance_json.image_prompt into storyboard image_prompt`);
      }
    }
    const selectedQuality = visualPromptQuality(nextVisualPrompt);
    if (!selectedQuality.strong) {
      blockingIssues.push(`scene ${sceneNumber}: visual_prompt is ${selectedQuality.reason}. Add a concrete subject, action, and setting.`);
    }
    if (nextImagePrompt && hasVisibleTextRisk(nextImagePrompt)) {
      blockingIssues.push(`scene ${sceneNumber}: image_prompt appears to request visible text.`);
    }
    if (nextVisualPrompt && hasVisibleTextRisk(nextVisualPrompt)) {
      blockingIssues.push(`scene ${sceneNumber}: visual_prompt appears to request visible text.`);
    }

    const assetPlan = normalizeQualityAssetPlan(
      { ...scene, visual_prompt: nextVisualPrompt, image_prompt: nextImagePrompt || guidanceImagePrompt },
      index,
      reelType,
      repairs,
    );
    const remotion = normalizeQualityRemotion(scene, index, assetPlan, repairs);
    const assetType = assetPlan.mode === 'video' ? 'video' : 'image';
    const transition = trimString(scene.transition || remotion.transition_type || guidance.transition) || (index === 0 ? 'cut' : 'soft_cut');
    const mood = trimString(scene.mood || guidance.beat_label || guidance.mood) || `scene_${sceneNumber}`;
    const musicCue = trimString(scene.music_cue || guidance.music_cue);
    if (!musicCue) {
      warnings.push(`scene ${sceneNumber}: music_cue is empty.`);
    }

    const start = roundToHundredths(currentStartSeconds);
    const end = roundToHundredths(currentStartSeconds + duration);
    currentStartSeconds = end;
    nextGuidanceScenes.push({
      ...guidance,
      scene_number: sceneNumber,
      beat_label: trimString(guidance.beat_label || mood) || `scene_${sceneNumber}`,
      start_time_seconds: start,
      end_time_seconds: end,
      duration_seconds: duration,
      narration_text: narrationText,
      dialogue_lines: nextDialogueLines,
      asset_type: assetType,
      asset_plan: assetPlan,
      remotion,
      image_prompt: nextImagePrompt || nextVisualPrompt,
      music_cue: musicCue,
      tts_instructions: trimString(scene.tts_instructions || guidance.tts_instructions),
      includes_primary_character: scene.includes_primary_character === true || guidance.includes_primary_character === true,
    });

    return {
      ...scene,
      scene_number: sceneNumber,
      duration_seconds: duration,
      narration_text: narrationText,
      dialogue_lines: nextDialogueLines,
      visual_prompt: nextVisualPrompt,
      ...(nextImagePrompt ? { image_prompt: nextImagePrompt } : {}),
      asset_type: assetType,
      asset_plan: assetPlan,
      remotion,
      transition,
      mood,
      music_cue: musicCue,
      tts_instructions: trimString(scene.tts_instructions || guidance.tts_instructions),
      is_face_image: reelType === 'image' && index === 0,
      face_image_title: index === 0 && reelType === 'image' ? trimString(scene.face_image_title) : '',
      includes_primary_character: scene.includes_primary_character === true || guidance.includes_primary_character === true,
    };
  });

  const totalDurationSeconds = roundToHundredths(nextStoryboard.reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0));
  if (targetDurationSeconds > 0) {
    const toleranceSeconds = Math.max(2, targetDurationSeconds * 0.2);
    if (Math.abs(totalDurationSeconds - targetDurationSeconds) > toleranceSeconds) {
      warnings.push(`storyboard duration ${totalDurationSeconds}s is far from target ${targetDurationSeconds}s.`);
    }
  }

  const seed = asObject(row.render_manifest_seed_json);
  const output = asObject(seed.output);
  const nextRenderManifestSeed = {
    ...seed,
    output: {
      width: Number(output.width || 1080),
      height: Number(output.height || 1920),
      fps: Number(output.fps || 30),
      format: trimString(output.format || 'mp4') || 'mp4',
    },
    timeline: nextStoryboard.map((scene) => ({
      scene_number: Number(scene.scene_number),
      duration_seconds: Number(scene.duration_seconds),
      asset_type: trimString(scene.asset_type),
      asset_plan: asObject(scene.asset_plan),
      remotion: asObject(scene.remotion),
      transition: trimString(scene.transition || scene.remotion?.transition_type || 'cut') || 'cut',
    })),
    subtitles: {
      ...asObject(seed.subtitles),
      enabled: false,
      style: trimString(seed.subtitles?.style || 'cinematic_center_safe') || 'cinematic_center_safe',
    },
  };

  const parsedResponse = asObject(rawResponse.parsed_response);
  const nextRawResponse = {
    ...rawResponse,
    scene_guidance_json: nextGuidanceScenes,
    parsed_response: {
      ...parsedResponse,
      scene_guidance_json: nextGuidanceScenes,
      storyboard_json: nextStoryboard,
      render_manifest_seed_json: nextRenderManifestSeed,
    },
    quality_gate: {
      checked_at: new Date().toISOString(),
      stage: 'story_package_quality_gate',
      blocking_issues: blockingIssues,
      warnings,
      repairs,
    },
  };

  return {
    blockingIssues,
    warnings,
    repairs,
    storyboardJson: nextStoryboard,
    sceneGuidanceJson: nextGuidanceScenes,
    renderManifestSeedJson: nextRenderManifestSeed,
    rawResponseJson: nextRawResponse,
    totalDurationSeconds,
  };
}

async function runStoryPackageQualityGate({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const result = await withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'validating',
          updated_at = now()
      where content_id = $1
        and status in ('storyboard_complete', 'validation_complete', 'validating')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No storyboard_complete content item is ready for story package quality gate: ${contentId}.`);
    }
    const rowResult = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.reel_type,
        ci.target_duration_seconds,
        coalesce(s.selected_hook, '') as selected_hook,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(s.raw_response_json, '{}'::jsonb) as raw_response_json,
        sb.storyboard_json,
        sb.render_manifest_seed_json
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      join storyboards sb on sb.content_id = ci.content_id
      where ci.content_id = $1
        and ci.status = 'validating'
      for update of ci`,
      [contentId],
    );
    if (rowResult.rowCount === 0) {
      fail(`Story package quality gate could not load generated package for ${contentId}.`);
    }

    const gate = normalizeStoryPackageQuality(rowResult.rows[0]);
    if (gate.blockingIssues.length > 0) {
      await logWorkflowRun(client, {
        contentId,
        workflowName: 'story_package_quality_gate',
        runStatus: 'failed',
        startedAt,
        durationMs: durationMsFrom(startedAt),
        errorMessage: gate.blockingIssues.join(' | '),
        details: {
          blocking_issues: gate.blockingIssues,
          warnings: gate.warnings,
          repairs: gate.repairs,
        },
      });
      return {
        blocked: true,
        message: gate.blockingIssues.join(' | '),
        details: gate,
      };
    }

    await client.query(
      `update scripts
      set raw_response_json = $2::jsonb,
          generated_at = now()
      where content_id = $1`,
      [contentId, JSON.stringify(gate.rawResponseJson)],
    );
    await client.query(
      `update storyboards
      set storyboard_json = $2::jsonb,
          render_manifest_seed_json = $3::jsonb,
          generated_at = now()
      where content_id = $1`,
      [
        contentId,
        JSON.stringify(gate.storyboardJson),
        JSON.stringify(gate.renderManifestSeedJson),
      ],
    );
    await client.query(
      `update content_items
      set status = 'validation_complete',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'story_package_quality_gate',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        scene_count: gate.storyboardJson.length,
        total_duration_seconds: gate.totalDurationSeconds,
        warnings: gate.warnings,
        repairs: gate.repairs,
      },
    });
    return {
      blocked: false,
      summary: {
        content_id: contentId,
        status_after_success: 'validation_complete',
        scene_count: gate.storyboardJson.length,
        total_duration_seconds: gate.totalDurationSeconds,
        repair_count: gate.repairs.length,
        warning_count: gate.warnings.length,
      },
    };
  });

  if (result.blocked) {
    fail(`Story package quality gate blocked media generation: ${result.message}`);
  }
  return result.summary;
}

function compactStrings(values = []) {
  return asArray(values).map((value) => trimString(value)).filter(Boolean);
}

function stringifyPromptJson(value, fallback = {}) {
  const source = value === undefined || value === null ? fallback : value;
  return JSON.stringify(source, null, 2);
}

function selectedStylePackFrom(row, directorJson = {}) {
  const clientContext = asObject(row.client_account_context);
  return trimString(
    directorJson.selected_style_pack
    || clientContext?.style_policy?.preferred_style_pack_id
    || asObject(row.source_payload_json)?.selected_style_pack
    || 'cinematic_problem_solution',
  );
}

function sceneGuidanceFromRaw(rawResponseJson, storyboardJson) {
  const raw = asObject(rawResponseJson);
  return asArray(
    raw.scene_guidance_json
    ?? raw.parsed_response?.scene_guidance_json
    ?? storyboardJson,
  );
}

function fallbackVisualPromptForScene(scene, index, { title = '' } = {}) {
  const sceneNumber = Number(scene?.scene_number ?? index + 1);
  const narrationText = trimString(scene?.narration_text);
  const visualPrompt = sanitizeGeneratedAssetPrompt(
    scene?.visual_prompt
    || scene?.image_prompt
    || scene?.fallback_prompt
    || `Cinematic vertical scene for beat ${sceneNumber}: ${narrationText || 'the narrated story moment'}, text-free, no readable labels or UI.`,
    { title, narrationText, sceneNumber },
  );
  return {
    scene_number: sceneNumber,
    asset_type: trimString(scene?.asset_type) === 'video' ? 'video' : 'image',
    duration_seconds: Number(scene?.duration_seconds || 5) || 5,
    aspect_ratio: '9:16',
    subject: narrationText || `Scene ${sceneNumber} subject`,
    environment: trimString(scene?.mood) || 'story-specific cinematic environment',
    composition: 'vertical 9:16 composition with a clear focal subject and no readable text',
    camera: trimString(scene?.remotion?.camera_move) || 'subtle cinematic camera movement',
    motion: trimString(scene?.remotion?.instructions) || 'restrained motion matched to the narration beat',
    lighting: 'cinematic natural light with readable subject separation',
    style: 'consistent with the selected Reel style and storyboard',
    continuity_requirements: ['Keep character, environment, lighting, and palette consistent with adjacent scenes.'],
    text_policy: 'No readable text, labels, logos, subtitles, captions, signage, UI, or watermarks in generated visuals.',
    visual_prompt: visualPrompt,
    negative_prompt: trimString(scene?.negative_prompt) || 'readable text, labels, logos, subtitles, captions, signage, watermarks, UI screens',
    fallback_prompt: trimString(scene?.fallback_prompt) || visualPrompt,
    safety_notes: ['Use only the supplied story facts and avoid copyrighted characters, logos, or exact protected designs.'],
    qa_checks: ['Scene matches narration beat.', 'No readable text in generated visual.', 'Style is consistent with the rest of the reel.'],
    fallback_generated: true,
  };
}

async function runDirectorContract({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.reel_type,
        ci.status,
        ci.target_duration_seconds,
        ci.source_payload_json,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(s.raw_response_json, '{}'::jsonb) as raw_response_json,
        sb.storyboard_json,
        coalesce(cac.context_snapshot_json, ci.source_payload_json->'client_account_context', '{}'::jsonb) as client_account_context
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      join storyboards sb on sb.content_id = ci.content_id
      left join content_account_contexts cac on cac.content_id = ci.content_id
      where ci.content_id = $1
        and ci.status in ('validation_complete', 'storyboard_complete')
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No validation_complete content item is ready for director contract: ${contentId}.`);
    }
    return result.rows[0];
  });

  const sourcePayload = asObject(row.source_payload_json);
  const rawResponseJson = asObject(row.raw_response_json);
  const storyboardJson = asArray(row.storyboard_json);
  const sceneGuidanceJson = sceneGuidanceFromRaw(rawResponseJson, storyboardJson);
  const directorResult = await invokeStructuredTextStage('director_contract', {
    content_id: contentId,
    title: trimString(row.title),
    target_duration_seconds: Number(row.target_duration_seconds || 45),
    status_after_success: trimString(row.status) || 'validation_complete',
    prompt_template_data: {
      title: trimString(row.title),
      category: trimString(row.category || 'general') || 'general',
      target_duration_seconds: String(row.target_duration_seconds || 45),
      narration_script: trimString(row.narration_script),
      scene_guidance_json: sceneGuidanceJson,
      script_scene_guidance_json: stringifyPromptJson(sceneGuidanceJson, []),
      scene_count: String(sceneGuidanceJson.length || storyboardJson.length || ''),
      creative_defaults: {
        reel_type: trimString(row.reel_type || 'video') || 'video',
        prompt_profile: asObject(sourcePayload.prompt_profile),
        client_account_context: asObject(row.client_account_context),
      },
      creative_defaults_json: stringifyPromptJson({
        reel_type: trimString(row.reel_type || 'video') || 'video',
        prompt_profile: asObject(sourcePayload.prompt_profile),
        client_account_context: asObject(row.client_account_context),
      }),
      client_account_context: asObject(row.client_account_context),
    },
  });
  const directorJson = asObject(directorResult.director_contract_response);
  if (Object.keys(directorJson).length === 0) {
    fail('director_contract returned an empty director contract.');
  }

  const nextRawResponseJson = {
    ...rawResponseJson,
    director_contract_json: directorJson,
    director_contract_metadata: {
      generation_provider: trimString(directorResult.generation_provider),
      generation_model: trimString(directorResult.generation_model),
      provider_metadata: asObject(directorResult.provider_metadata),
      cost: asObject(directorResult.cost),
    },
  };

  await withTransaction(pool, async (client) => {
    await client.query(
      `insert into directors (
        content_id,
        voice_role,
        tts_delivery,
        global_visual_style,
        visual_strategy,
        global_pacing,
        global_music_direction,
        director_json,
        generation_model
      ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
      on conflict (content_id) do update set
        voice_role = excluded.voice_role,
        tts_delivery = excluded.tts_delivery,
        global_visual_style = excluded.global_visual_style,
        visual_strategy = excluded.visual_strategy,
        global_pacing = excluded.global_pacing,
        global_music_direction = excluded.global_music_direction,
        director_json = excluded.director_json,
        generation_model = excluded.generation_model,
        generated_at = now()`,
      [
        contentId,
        trimString(directorJson.voice_role || directorJson.voice_contract?.voice_role),
        trimString(directorJson.tts_delivery || directorJson.voice_contract?.delivery_summary),
        trimString(directorJson.global_visual_style || directorJson.visual_contract?.style_summary),
        trimString(directorJson.visual_strategy),
        trimString(directorJson.global_pacing),
        trimString(directorJson.global_music_direction || directorJson.music_sfx_contract?.music_direction),
        JSON.stringify(directorJson),
        trimString(directorResult.generation_model),
      ],
    );
    await client.query(
      `update scripts
      set raw_response_json = $2::jsonb,
          generated_at = now()
      where content_id = $1`,
      [contentId, JSON.stringify(nextRawResponseJson)],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'director_contract',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        generation_provider: trimString(directorResult.generation_provider),
        generation_model: trimString(directorResult.generation_model),
        selected_style_pack: trimString(directorJson.selected_style_pack),
        cost: directorResult.cost ?? {},
      },
    });
  });

  return {
    content_id: contentId,
    status_after_success: trimString(row.status) || 'validation_complete',
    selected_style_pack: trimString(directorJson.selected_style_pack),
    generation_provider: trimString(directorResult.generation_provider),
    generation_model: trimString(directorResult.generation_model),
  };
}

function mergeVisualPromptPlan(storyboardJson, visualPlan, { title = '' } = {}) {
  const scenes = asArray(storyboardJson);
  const prompts = asArray(visualPlan.prompts);
  if (scenes.length === 0) {
    fail('visual_prompt_builder requires storyboard_json scenes.');
  }
  const effectivePrompts = prompts.length > 0
    ? prompts
    : scenes.map((scene, index) => fallbackVisualPromptForScene(scene, index, { title }));
  const promptsByScene = new Map(effectivePrompts.map((prompt, index) => [
    Number(prompt?.scene_number ?? index + 1),
    asObject(prompt),
  ]));
  const mergedScenes = scenes.map((scene, index) => {
    const sceneNumber = Number(scene?.scene_number ?? index + 1);
    const prompt = promptsByScene.get(sceneNumber) || fallbackVisualPromptForScene(scene, index, { title });
    const rawVisualPrompt = trimString(
      prompt.visual_prompt
      || scene.visual_prompt
      || scene.image_prompt
      || fallbackVisualPromptForScene(scene, index, { title }).visual_prompt,
    );
    const visualPrompt = sanitizeGeneratedAssetPrompt(rawVisualPrompt, {
      title,
      narrationText: trimString(scene.narration_text),
      sceneNumber,
    });
    const fallbackPrompt = sanitizeGeneratedAssetPrompt(
      trimString(prompt.fallback_prompt || scene.fallback_prompt || visualPrompt),
      { title, narrationText: trimString(scene.narration_text), sceneNumber },
    );
    return {
      ...scene,
      visual_prompt: visualPrompt,
      image_prompt: visualPrompt,
      negative_prompt: trimString(prompt.negative_prompt || scene.negative_prompt),
      fallback_prompt: fallbackPrompt,
      visual_prompt_builder: {
        ...prompt,
        visual_prompt: visualPrompt,
        fallback_prompt: fallbackPrompt,
      },
    };
  });
  return mergedScenes;
}

async function runVisualPromptBuilder({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.reel_type,
        ci.status,
        ci.target_duration_seconds,
        ci.source_payload_json,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(s.raw_response_json, '{}'::jsonb) as raw_response_json,
        sb.storyboard_json,
        coalesce(sb.style_notes, '') as style_notes,
        coalesce(sb.render_manifest_seed_json, '{}'::jsonb) as render_manifest_seed_json,
        coalesce(d.director_json, '{}'::jsonb) as director_json,
        coalesce(cac.context_snapshot_json, ci.source_payload_json->'client_account_context', '{}'::jsonb) as client_account_context
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      join storyboards sb on sb.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      left join content_account_contexts cac on cac.content_id = ci.content_id
      where ci.content_id = $1
        and ci.status in ('validation_complete', 'storyboard_complete')
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No validation_complete content item is ready for visual prompt builder: ${contentId}.`);
    }
    return result.rows[0];
  });

  const directorJson = asObject(row.director_json);
  const storyboardJson = asArray(row.storyboard_json);
  const visualContract = asObject(directorJson.visual_contract);
  const visualResult = await invokeStructuredTextStage('visual_prompt_builder', {
    content_id: contentId,
    title: trimString(row.title),
    target_duration_seconds: Number(row.target_duration_seconds || 45),
    status_after_success: trimString(row.status) || 'validation_complete',
    prompt_template_data: {
      title: trimString(row.title),
      category: trimString(row.category || 'general') || 'general',
      target_duration_seconds: String(row.target_duration_seconds || 45),
      selected_style_pack: selectedStylePackFrom(row, directorJson),
      director_plan: directorJson,
      director_plan_json: stringifyPromptJson(directorJson),
      storyboard_plan: storyboardJson,
      storyboard_plan_json: stringifyPromptJson(storyboardJson, []),
      visual_continuity_notes: compactStrings(visualContract.continuity_rules).join(' | ')
        || trimString(directorJson.global_visual_style)
        || 'Maintain consistent characters, environment, lighting, and color across all scenes.',
      visual_text_policy: trimString(visualContract.text_policy)
        || 'No readable text, labels, logos, subtitles, captions, signage, or watermarks in generated visuals.',
      client_account_context: asObject(row.client_account_context),
    },
  });
  const visualPlan = asObject(visualResult.visual_prompt_response);
  const mergedStoryboard = mergeVisualPromptPlan(storyboardJson, visualPlan, { title: trimString(row.title) });
  const rawResponseJson = asObject(row.raw_response_json);
  const nextRawResponseJson = {
    ...rawResponseJson,
    visual_prompt_plan_json: visualPlan,
    visual_prompt_builder_metadata: {
      generation_provider: trimString(visualResult.generation_provider),
      generation_model: trimString(visualResult.generation_model),
      provider_metadata: asObject(visualResult.provider_metadata),
      cost: asObject(visualResult.cost),
    },
  };
  const styleNotes = [
    trimString(row.style_notes),
    `Visual prompt builder: ${trimString(visualPlan.global_continuity?.style_summary || visualPlan.selected_style_pack || '')}`.trim(),
  ].filter(Boolean).join('\n\n');

  await withTransaction(pool, async (client) => {
    await client.query(
      `update storyboards
      set storyboard_json = $2::jsonb,
          style_notes = $3,
          generated_at = now()
      where content_id = $1`,
      [contentId, JSON.stringify(mergedStoryboard), styleNotes],
    );
    await client.query(
      `update scripts
      set raw_response_json = $2::jsonb,
          generated_at = now()
      where content_id = $1`,
      [contentId, JSON.stringify(nextRawResponseJson)],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'visual_prompt_builder',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        generation_provider: trimString(visualResult.generation_provider),
        generation_model: trimString(visualResult.generation_model),
        scene_count: mergedStoryboard.length,
        selected_style_pack: trimString(visualPlan.selected_style_pack),
        cost: visualResult.cost ?? {},
      },
    });
  });

  return {
    content_id: contentId,
    status_after_success: trimString(row.status) || 'validation_complete',
    scene_count: mergedStoryboard.length,
    generation_provider: trimString(visualResult.generation_provider),
    generation_model: trimString(visualResult.generation_model),
  };
}

function buildVoiceLineMap(storyboardJson) {
  return asArray(storyboardJson).flatMap((scene, sceneIndex) => {
    const sceneNumber = Number(scene?.scene_number ?? sceneIndex + 1);
    const lines = asArray(scene?.dialogue_lines).map((line) => trimString(line)).filter(Boolean);
    const sourceLines = lines.length > 0 ? lines : [trimString(scene?.narration_text)].filter(Boolean);
    return sourceLines.map((lineText, lineIndex) => ({
      voice_line_id: `scene_${sceneNumber}_line_${lineIndex + 1}`,
      scene_number: sceneNumber,
      line_index: lineIndex + 1,
      line_text: lineText,
      scene_duration_seconds: Number(scene?.duration_seconds || 0),
      existing_tts_instructions: trimString(scene?.tts_instructions),
    }));
  });
}

function buildMusicSfxContext(rawResponseJson, directorJson, storyboardJson) {
  const raw = asObject(rawResponseJson);
  const parsed = asObject(raw.parsed_response);
  return {
    music_direction: trimString(parsed.music_direction || raw.music_direction || directorJson.global_music_direction),
    director_music_direction: trimString(directorJson.global_music_direction || directorJson.music_sfx_contract?.music_direction),
    external_music_assets: [],
    music_bed_rendered: false,
    license_status: 'not_applicable_no_external_music_asset',
    license_evidence_required: false,
    scene_music_cues: asArray(storyboardJson).map((scene, index) => ({
      scene_number: Number(scene?.scene_number ?? index + 1),
      music_cue: trimString(scene?.music_cue),
    })),
  };
}

function voiceLinesForScene(voicePlan, sceneNumber) {
  return asArray(voicePlan.lines).filter((line) => Number(line?.scene_number) === Number(sceneNumber));
}

function buildVoicePerformanceInstruction(scene, voicePlan, directorJson) {
  const sceneNumber = Number(scene?.scene_number || 0);
  const lines = voiceLinesForScene(voicePlan, sceneNumber);
  const voiceProfile = asObject(voicePlan.voice_profile);
  const parts = [
    trimString(scene?.tts_instructions),
    trimString(directorJson.tts_delivery || directorJson.voice_contract?.delivery_summary),
    trimString(voiceProfile.delivery_summary),
  ].filter(Boolean);
  for (const line of lines) {
    const emphasis = asArray(line.emphasis)
      .map((entry) => `${trimString(entry.phrase)} => ${trimString(entry.intent)}`.trim())
      .filter((entry) => entry !== '=>')
      .join('; ');
    const pauses = asObject(line.pauses);
    const pronunciation = asArray(line.pronunciation)
      .map((entry) => `${trimString(entry.term)}: ${trimString(entry.guidance)}`.trim())
      .filter((entry) => entry !== ':')
      .join('; ');
    parts.push([
      `Line ${Number(line.line_index || 1)} delivery instruction`,
      trimString(line.tone) ? `tone: ${trimString(line.tone)}` : '',
      trimString(line.pace) ? `pace: ${trimString(line.pace)}` : '',
      `pause before ${Number(pauses.before_seconds || 0)}s, after ${Number(pauses.after_seconds || 0)}s`,
      trimString(pauses.internal_pause_notes) ? `internal pauses: ${trimString(pauses.internal_pause_notes)}` : '',
      emphasis ? `emphasis: ${emphasis}` : '',
      pronunciation ? `pronunciation: ${pronunciation}` : '',
    ].filter(Boolean).join('; '));
  }
  parts.push('Use these as performance instructions only. Do not read emotion tags, parentheticals, brackets, SSML, or stage directions aloud.');
  return parts.join(' ');
}

function mergeVoicePerformanceIntoStoryboard(storyboardJson, voicePlan, directorJson) {
  return asArray(storyboardJson).map((scene) => ({
    ...scene,
    tts_instructions: buildVoicePerformanceInstruction(scene, voicePlan, directorJson),
    voice_performance: {
      voice_profile: asObject(voicePlan.voice_profile),
      lines: voiceLinesForScene(voicePlan, Number(scene?.scene_number || 0)),
      adapter_mapping_policy: asObject(voicePlan.adapter_mapping_policy),
    },
  }));
}

async function runVoicePerformanceScript({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.reel_type,
        ci.status,
        ci.target_duration_seconds,
        ci.source_payload_json,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(s.raw_response_json, '{}'::jsonb) as raw_response_json,
        sb.storyboard_json,
        coalesce(d.director_json, '{}'::jsonb) as director_json,
        count(distinct a.scene_number)::int as scene_asset_count
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      join storyboards sb on sb.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      join assets a on a.content_id = ci.content_id
        and a.asset_role in ('scene_image', 'scene_video')
        and a.status = 'ready'
      where ci.content_id = $1
        and ci.status = 'assets_ready'
      group by ci.content_id, ci.title, ci.category, ci.reel_type, ci.status, ci.target_duration_seconds,
        ci.source_payload_json, s.narration_script, s.raw_response_json, sb.storyboard_json, d.director_json
      having count(distinct a.scene_number) >= jsonb_array_length(sb.storyboard_json)`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No assets_ready content item is ready for voice performance scripting: ${contentId}.`);
    }
    return result.rows[0];
  });

  const storyboardJson = asArray(row.storyboard_json);
  const directorJson = asObject(row.director_json);
  const rawResponseJson = asObject(row.raw_response_json);
  const voiceLineMap = buildVoiceLineMap(storyboardJson);
  if (voiceLineMap.length === 0) {
    fail('voice_performance_script requires at least one narration line.');
  }
  const voiceResult = await invokeStructuredTextStage('voice_performance_script', {
    content_id: contentId,
    title: trimString(row.title),
    target_duration_seconds: Number(row.target_duration_seconds || 45),
    status_after_success: 'assets_ready',
    prompt_template_data: {
      title: trimString(row.title),
      category: trimString(row.category || 'general') || 'general',
      target_duration_seconds: String(row.target_duration_seconds || 45),
      selected_style_pack: selectedStylePackFrom(row, directorJson),
      narration_style: trimString(directorJson.tts_delivery || directorJson.voice_contract?.delivery_summary)
        || 'human, emotionally grounded, clear, natural',
      clean_spoken_script: trimString(row.narration_script),
      narration_script: trimString(row.narration_script),
      director_contract: directorJson,
      director_contract_json: stringifyPromptJson(directorJson),
      storyboard_plan: storyboardJson,
      storyboard_plan_json: stringifyPromptJson(storyboardJson, []),
      voice_line_map: voiceLineMap,
      voice_line_map_json: stringifyPromptJson(voiceLineMap, []),
      music_sfx_context: buildMusicSfxContext(rawResponseJson, directorJson, storyboardJson),
      music_sfx_context_json: stringifyPromptJson(buildMusicSfxContext(rawResponseJson, directorJson, storyboardJson)),
    },
  });
  const voicePlan = asObject(voiceResult.voice_performance_response);
  const mergedStoryboard = mergeVoicePerformanceIntoStoryboard(storyboardJson, voicePlan, directorJson);
  const nextRawResponseJson = {
    ...rawResponseJson,
    voice_performance_json: voicePlan,
    voice_performance_metadata: {
      generation_provider: trimString(voiceResult.generation_provider),
      generation_model: trimString(voiceResult.generation_model),
      provider_metadata: asObject(voiceResult.provider_metadata),
      cost: asObject(voiceResult.cost),
    },
  };

  await withTransaction(pool, async (client) => {
    await client.query(
      `update storyboards
      set storyboard_json = $2::jsonb,
          generated_at = now()
      where content_id = $1`,
      [contentId, JSON.stringify(mergedStoryboard)],
    );
    await client.query(
      `update scripts
      set raw_response_json = $2::jsonb,
          generated_at = now()
      where content_id = $1`,
      [contentId, JSON.stringify(nextRawResponseJson)],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'voice_performance_script',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        generation_provider: trimString(voiceResult.generation_provider),
        generation_model: trimString(voiceResult.generation_model),
        line_count: asArray(voicePlan.lines).length,
        scene_count: mergedStoryboard.length,
        total_estimated_spoken_duration_seconds: Number(voicePlan.total_estimated_spoken_duration_seconds || 0),
        cost: voiceResult.cost ?? {},
      },
    });
  });

  return {
    content_id: contentId,
    status_after_success: 'assets_ready',
    line_count: asArray(voicePlan.lines).length,
    generation_provider: trimString(voiceResult.generation_provider),
    generation_model: trimString(voiceResult.generation_model),
  };
}

function buildAssetGenerationPayload(candidate, workflowName) {
  const directorJson = asObject(candidate.director_json);
  const reelType = trimString(candidate.reel_type || 'video').toLowerCase() || 'video';
  return {
    ...candidate,
    scenes: asArray(candidate.storyboard_json),
    reel_type: reelType,
    strict_video_assets: reelType === 'video'
      && trimString(process.env.ALLOW_VIDEO_TO_IMAGE_FALLBACK).toLowerCase() !== 'true',
    character_reference: asObject(candidate.source_payload_json)?.character_reference ?? null,
    prompt_profile: asObject(asObject(candidate.source_payload_json).prompt_profile),
    director_global_visual_style: trimString(directorJson.global_visual_style),
    director_avoid_rules: [
      trimString(directorJson.global_avoid_rules),
      trimString(directorJson.avoid_rules),
      trimString(directorJson.visual_avoid_rules),
    ].filter(Boolean).join(' | '),
    workflow_name: workflowName,
    run_started_at: new Date().toISOString(),
  };
}

async function persistSceneAssets(pool, contentId, sceneAssets, result, workflowName) {
  await withTransaction(pool, async (client) => {
    await client.query(
      `delete from assets
      where content_id = $1
        and asset_role in ('scene_image', 'scene_video')`,
      [contentId],
    );
    for (const asset of sceneAssets) {
      await client.query(
        `insert into assets (
          content_id,
          scene_number,
          asset_role,
          provider,
          source_url,
          storage_url,
          mime_type,
          duration_seconds,
          width,
          height,
          status,
          metadata_json
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ready',$11::jsonb)`,
        [
          contentId,
          Number(asset.scene_number || 0) || null,
          trimString(asset.asset_role || 'scene_video'),
          trimString(asset.provider),
          trimString(asset.source_url),
          trimString(asset.storage_url),
          trimString(asset.mime_type),
          Number.isFinite(Number(asset.duration_seconds)) ? Number(asset.duration_seconds) : null,
          Number.isFinite(Number(asset.width)) ? Number(asset.width) : null,
          Number.isFinite(Number(asset.height)) ? Number(asset.height) : null,
          JSON.stringify(asObject(asset.metadata_json)),
        ],
      );
    }
    await client.query(
      `update content_items
      set status = 'assets_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName,
      startedAt: result.run_started_at,
      durationMs: durationMsFrom(result.run_started_at),
      details: {
        generation_model: result.generation_model || '',
        generation_provider: result.generation_provider || '',
        rehost_provider: result.rehost_provider || '',
        scene_count: sceneAssets.length,
        cost: result.cost ?? {},
      },
    });
  });
}

async function fetchAndClaimAssetCandidate(pool, contentId) {
  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.reel_type,
        ci.status,
        ci.source_payload_json,
        sb.storyboard_json,
        coalesce(sb.style_notes, '') as style_notes,
        coalesce(s.selected_hook, '') as selected_hook,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(d.director_json, '{}'::jsonb) as director_json
      from content_items ci
      join storyboards sb on sb.content_id = ci.content_id
      join scripts s on s.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      where ci.content_id = $1
        and ci.status in ('validation_complete', 'storyboard_complete', 'generating_assets')
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No storyboard_complete content item is ready for asset generation: ${contentId}.`);
    }
    await client.query(
      `update content_items
      set status = 'generating_assets',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    return result.rows[0];
  });
}

async function runAssetGenerationV3({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const candidate = await fetchAndClaimAssetCandidate(pool, contentId);
  const payload = buildAssetGenerationPayload(candidate, 'wf_asset_generation_v3');
  const payloadInvocation = buildPayloadInvocationArgs(payload, 'asset-generation-v3');
  let result;
  try {
    result = runNodeScript(
      'workflows/scripts/generate_and_rehost_scene_assets_v3.mjs',
      payloadInvocation.args,
      { label: 'asset_generation_v3' },
    );
  } finally {
    payloadInvocation.cleanup();
  }

  const sceneAssets = asArray(result.scene_assets);
  if (sceneAssets.length === 0) {
    fail('asset_generation_v3 returned no scene assets.');
  }

  await persistSceneAssets(pool, contentId, sceneAssets, result, 'wf_asset_generation_v3');

  return {
    content_id: contentId,
    status_after_success: 'assets_ready',
    scene_count: sceneAssets.length,
    cost: result.cost ?? {},
  };
}

async function runImageAssetGeneration({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const candidate = await fetchAndClaimAssetCandidate(pool, contentId);
  const payload = buildAssetGenerationPayload(candidate, 'wf_image_asset_generation');
  const result = runNodeScript(
    'workflows/scripts/generate_and_rehost_scene_assets.mjs',
    [encodePayload(payload)],
    { label: 'image_asset_generation' },
  );

  const sceneAssets = asArray(result.scene_assets);
  if (sceneAssets.length === 0) {
    fail('image_asset_generation returned no scene assets.');
  }

  await persistSceneAssets(pool, contentId, sceneAssets, result, 'wf_image_asset_generation');

  return {
    content_id: contentId,
    status_after_success: 'assets_ready',
    scene_count: sceneAssets.length,
    cost: result.cost ?? {},
  };
}

async function fetchAndClaimNarrationCandidate(pool, contentId) {
  return withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'generating_narration',
          updated_at = now()
      where content_id = $1
        and status in ('assets_ready', 'generating_narration')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No assets_ready content item is ready for narration generation: ${contentId}.`);
    }
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.status,
        ci.target_duration_seconds,
        ci.source_payload_json,
        s.narration_script,
        coalesce(s.raw_response_json->>'v2_story_package', 'false') as is_v2_story_package,
        coalesce(s.raw_response_json->'voice_performance_json', '{}'::jsonb) as voice_performance_json,
        sb.storyboard_json,
        count(distinct a.scene_number)::int as scene_asset_count,
        coalesce(d.director_json, '{}'::jsonb) as director_json
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      join storyboards sb on sb.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      join assets a on a.content_id = ci.content_id
        and a.asset_role in ('scene_image', 'scene_video')
        and a.status = 'ready'
      where ci.content_id = $1
        and ci.status = 'generating_narration'
      group by ci.content_id, ci.title, ci.status, ci.target_duration_seconds, ci.source_payload_json,
        s.narration_script, s.raw_response_json, sb.storyboard_json, d.director_json
      having count(distinct a.scene_number) >= jsonb_array_length(sb.storyboard_json)`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`Content item does not have enough ready scene assets for narration generation: ${contentId}.`);
    }
    return result.rows[0];
  });
}

async function runNarrationGeneration({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const candidate = await fetchAndClaimNarrationCandidate(pool, contentId);
  const directorJson = asObject(candidate.director_json);
  const payload = {
    ...candidate,
    workflow_name: 'wf_narration_generation',
    run_started_at: new Date().toISOString(),
      director_scenes: asArray(directorJson.scenes),
      director_tts_delivery: trimString(directorJson.tts_delivery),
      voice_performance_json: asObject(candidate.voice_performance_json),
      prompt_profile: asObject(candidate.source_payload_json?.prompt_profile),
  };
  const result = runNodeScript(
    'workflows/scripts/generate_and_rehost_narration_audio.mjs',
    [encodePayload(payload)],
    { label: 'narration_generation' },
  );

  const scenes = asArray(result.scenes);
  if (scenes.length === 0) {
    fail('narration_generation returned no narration scenes.');
  }

  await withTransaction(pool, async (client) => {
    await client.query(
      `delete from assets
      where content_id = $1
        and asset_role = 'scene_narration'`,
      [contentId],
    );
    for (const scene of scenes) {
      await client.query(
        `insert into assets (
          content_id,
          scene_number,
          asset_role,
          provider,
          source_url,
          storage_url,
          mime_type,
          duration_seconds,
          status,
          metadata_json
        ) values ($1,$2,'scene_narration',$3,$4,$5,$6,$7,'ready',$8::jsonb)`,
        [
          contentId,
          Number(scene.scene_number || 0) || null,
          trimString(scene.provider),
          trimString(scene.source_url),
          trimString(scene.storage_url),
          trimString(scene.mime_type || 'audio/mpeg'),
          Number.isFinite(Number(scene.duration_seconds)) ? Number(scene.duration_seconds) : null,
          JSON.stringify(asObject(scene.metadata_json)),
        ],
      );
    }
    await client.query(
      `update content_items
      set status = 'narration_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_narration_generation',
      startedAt: result.run_started_at,
      durationMs: durationMsFrom(result.run_started_at),
      details: {
        scene_count: scenes.length,
        total_duration_seconds: Number(result.total_duration_seconds || 0),
        voice: trimString(scenes[0]?.metadata_json?.voice),
        generation_model: trimString(scenes[0]?.metadata_json?.generation_model),
        cost: result.cost ?? {},
      },
    });
  });

  return {
    content_id: contentId,
    status_after_success: 'narration_ready',
    scene_count: scenes.length,
    total_duration_seconds: Number(result.total_duration_seconds || 0),
    cost: result.cost ?? {},
  };
}

function getHeygenConfig({ failOnMissing = true } = {}) {
  const apiKey = trimString(firstEnv(['HEYGEN_API_KEY']));
  const avatarId = trimString(firstEnv(['HEYGEN_AVATAR_ID']));
  const voiceId = trimString(firstEnv(['HEYGEN_VOICE_ID']));
  const missing = [];
  if (!apiKey) missing.push('HEYGEN_API_KEY');
  if (!avatarId) missing.push('HEYGEN_AVATAR_ID');
  if (!voiceId) missing.push('HEYGEN_VOICE_ID');
  if (missing.length && failOnMissing) {
    fail(`Avatar video generation requires ${missing.join(', ')}.`);
  }
  return {
    apiKey,
    avatarId,
    voiceId,
    missing,
    configured: missing.length === 0,
    callbackUrl: trimString(firstEnv(['HEYGEN_CALLBACK_URL'])),
    pollIntervalMs: Math.max(1000, Number.parseInt(trimString(firstEnv(['HEYGEN_POLL_INTERVAL_SECONDS']) || '10'), 10) * 1000 || 10000),
    timeoutMs: Math.max(60000, Number.parseInt(trimString(firstEnv(['HEYGEN_TIMEOUT_SECONDS']) || '900'), 10) * 1000 || 900000),
    mockCompletedUrl: trimString(firstEnv(['HEYGEN_MOCK_COMPLETED_URL'])),
  };
}

const AVATAR_ROUTE_TYPES = new Set(['synthetic_avatar_asset', 'real_person_avatar_asset']);
const SAFE_HEYGEN_OPTION_KEYS = new Set([
  'aspect_ratio',
  'resolution',
  'fit',
  'background',
  'caption',
  'captions',
  'output_format',
  'voice_settings',
  'motion_prompt',
  'expressiveness',
  'engine',
]);
const SECRETISH_KEY_PATTERN = /(secret|token|api[_-]?key|authorization|password|credential)/i;
const DEFAULT_AVATAR_RULES_SUMMARY = [
  'Avatar use must pass account avatar policy, consent metadata, presenter suitability, disclosure, provider identity, and final QA.',
  'Uploaded character references are creative context only and never consent records.',
  'Presenter direction must remain separate from spoken script text unless a future script rewrite stage explicitly allows script changes.',
  'Use non-avatar video fallback when consent, provider configuration, disclosure, safety, or suitability is missing or unclear.',
].join(' ');
const HEYGEN_CAPABILITY_SUMMARY = [
  'HeyGen create-video request options may include aspect_ratio, resolution, fit, background, caption/captions, output_format, voice_settings, motion_prompt, expressiveness, and engine when supported.',
  'Only provider-safe request options may be persisted; never include API keys, tokens, auth headers, secrets, credentials, or provider account secrets.',
].join(' ');

function heygenProviderInventory(config = getHeygenConfig({ failOnMissing: false })) {
  return {
    provider_name: 'heygen',
    provider_source: 'env',
    create_video_endpoint: '/v3/videos',
    configured: config.configured === true,
    missing_env: asArray(config.missing),
    env_present: {
      HEYGEN_API_KEY: Boolean(config.apiKey),
      HEYGEN_AVATAR_ID: Boolean(config.avatarId),
      HEYGEN_VOICE_ID: Boolean(config.voiceId),
      HEYGEN_MOCK_COMPLETED_URL: Boolean(config.mockCompletedUrl),
    },
    provider_avatar_id: config.avatarId || null,
    provider_voice_id: config.voiceId || null,
    safe_request_options: [...SAFE_HEYGEN_OPTION_KEYS],
    default_request_options: {
      aspect_ratio: '9:16',
      caption: false,
    },
    capability_summary: HEYGEN_CAPABILITY_SUMMARY,
  };
}

function presenterProfileInventoryFrom({ sourcePayload, clientAccountContext, config }) {
  const avatarDecision = asObject(sourcePayload.avatar_decision);
  const sourceProfiles = asArray(
    sourcePayload.presenter_profile_inventory
    ?? sourcePayload.presenter_profiles
    ?? clientAccountContext?.avatar_policy?.presenter_profiles,
  );
  const singleProfile = asObject(sourcePayload.presenter_profile ?? avatarDecision.presenter_profile);
  const profiles = [
    ...sourceProfiles,
    ...(Object.keys(singleProfile).length ? [singleProfile] : []),
  ].filter((profile) => Object.keys(asObject(profile)).length > 0);
  if (profiles.length > 0) {
    return profiles;
  }
  return [{
    presenter_profile_id: 'heygen_env_default',
    display_name: 'Configured HeyGen Presenter',
    profile_type: clientAccountContext?.avatar_policy?.default_avatar_mode === 'real_person_with_consent'
      ? 'real_person_with_consent'
      : 'synthetic_persona',
    provider_identity: {
      provider_name: 'heygen',
      provider_avatar_id: config.avatarId || null,
      provider_voice_id: config.voiceId || null,
      provider_config_status: config.configured ? 'approved_for_future_runtime' : 'missing',
      provider_account_required_now: true,
    },
    consent: {
      consent_status: trimString(clientAccountContext?.avatar_policy?.consent_status) || null,
      consent_record_uri: trimString(clientAccountContext?.avatar_policy?.consent_record_uri) || null,
    },
    notes: 'Derived from HeyGen environment configuration for active avatar routing.',
  }];
}

function storyPackageContextFrom(row) {
  const raw = asObject(row.raw_response_json);
  return {
    selected_hook: trimString(row.selected_hook),
    narration_script_excerpt: trimString(row.narration_script).slice(0, 2500),
    target_duration_seconds: Number(row.target_duration_seconds || 45),
    story_package: asObject(
      raw.story_package_json
      ?? raw.story_package_v2_json
      ?? raw.story_package_response
      ?? raw.parsed_response,
    ),
    visual_prompt_plan: asObject(raw.visual_prompt_plan_json),
  };
}

function directorAvatarContractFrom(directorJson) {
  const director = asObject(directorJson);
  const avatarContract = asObject(
    director.avatar_contract
    ?? director.avatar_presenter_contract
    ?? director.presenter_contract
    ?? director.avatar,
  );
  if (Object.keys(avatarContract).length > 0) {
    return avatarContract;
  }
  return {
    avatar_requested: true,
    request_type: 'synthetic_presenter',
    disclosure_required: true,
    notes: 'No dedicated director avatar contract was found; selector must decide conservatively from account policy, story, and provider inventory.',
    director_context: {
      selected_style_pack: trimString(director.selected_style_pack),
      voice_delivery_summary: trimString(director.tts_delivery || director.voice_contract?.delivery_summary),
      visual_strategy: trimString(director.visual_strategy || director.global_visual_style),
    },
  };
}

function avatarDecisionWantsProviderCall(decision) {
  const summary = asObject(decision.decision_summary);
  const selectedRoute = asObject(decision.selected_route);
  const routeType = trimString(selectedRoute.route_type);
  return AVATAR_ROUTE_TYPES.has(routeType)
    && summary.avatar_route_enabled === true
    && (summary.provider_calls_allowed === true || decision.provider_calls_allowed === true || selectedRoute.provider_calls_allowed === true);
}

function safeProviderOptionValue(value, depth = 0) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.slice(0, 1200);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((entry) => safeProviderOptionValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === 'object' && depth < 4) {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SECRETISH_KEY_PATTERN.test(key)) {
        continue;
      }
      const safeValue = safeProviderOptionValue(entry, depth + 1);
      if (safeValue !== undefined) {
        result[key] = safeValue;
      }
    }
    return result;
  }
  return undefined;
}

function sanitizeHeygenRequestOptions(decision = {}) {
  const rawOptions = asObject(
    decision.provider_request_options
    ?? decision.selected_route?.provider_request_options,
  );
  const options = {};
  for (const [key, value] of Object.entries(rawOptions)) {
    if (!SAFE_HEYGEN_OPTION_KEYS.has(key) || SECRETISH_KEY_PATTERN.test(key)) {
      continue;
    }
    const safeValue = safeProviderOptionValue(value);
    if (safeValue !== undefined) {
      options[key] = safeValue;
    }
  }
  if (Object.prototype.hasOwnProperty.call(options, 'captions') && !Object.prototype.hasOwnProperty.call(options, 'caption')) {
    options.caption = options.captions;
  }
  delete options.captions;
  if (options.caption === false || options.caption === null || options.caption === '') {
    delete options.caption;
  }
  if (!options.aspect_ratio) {
    options.aspect_ratio = '9:16';
  }
  return options;
}

function avatarProviderIdentityErrors(decision, config) {
  const selectedRoute = asObject(decision.selected_route);
  const presenterProfile = asObject(decision.presenter_profile);
  const providerIdentity = asObject(presenterProfile.provider_identity);
  const providerName = trimString(selectedRoute.provider_name || providerIdentity.provider_name || 'heygen').toLowerCase();
  const avatarId = trimString(selectedRoute.provider_avatar_id || providerIdentity.provider_avatar_id);
  const voiceId = trimString(selectedRoute.provider_voice_id || providerIdentity.provider_voice_id);
  const errors = [];
  if (providerName !== 'heygen') {
    errors.push(`selected provider '${providerName}' is not supported by avatar_media_generation`);
  }
  if (avatarId && config.avatarId && avatarId !== config.avatarId) {
    errors.push('selected provider avatar id does not match configured HEYGEN_AVATAR_ID');
  }
  if (voiceId && config.voiceId && voiceId !== config.voiceId) {
    errors.push('selected provider voice id does not match configured HEYGEN_VOICE_ID');
  }
  return errors;
}

function avatarDisclosureErrors(decision) {
  const summaryDisclosureRequired = decision.disclosure_required === true
    || asObject(decision.selected_route).disclosure_required === true
    || asObject(decision.presenter_profile).disclosure_policy?.disclosure_required === true;
  const disclosureText = trimString(
    asObject(decision.selected_route).disclosure_text
    || asObject(decision.presenter_profile).disclosure_policy?.disclosure_text,
  );
  if (summaryDisclosureRequired && !disclosureText) {
    return ['avatar decision requires disclosure but did not provide disclosure text'];
  }
  return [];
}

function avatarFallbackReason({ decision, config, consentEvaluation }) {
  const errors = [];
  const wantsAvatar = avatarDecisionWantsProviderCall(decision);
  if (!wantsAvatar) {
    return trimString(
      decision.fallback_plan?.reason
      || decision.decision_summary?.rationale
      || 'avatar selector chose non-avatar video fallback',
    ) || 'avatar selector chose non-avatar video fallback';
  }
  if (!consentEvaluation.allowed) {
    errors.push(...consentEvaluation.errors);
  }
  if (!config.configured) {
    errors.push(`missing HeyGen configuration: ${asArray(config.missing).join(', ') || 'unknown'}`);
  }
  errors.push(...avatarProviderIdentityErrors(decision, config));
  errors.push(...avatarDisclosureErrors(decision));
  if (decision.consent_evaluation?.blocks_avatar_route === true) {
    errors.push('avatar decision consent_evaluation.blocks_avatar_route is true');
  }
  if (errors.length > 0) {
    return errors.join(' ');
  }
  return '';
}

function buildHeygenRequestBody(row, config, decision = {}) {
  const narrationScript = trimString(row.narration_script);
  if (!narrationScript) fail('HeyGen avatar generation requires narration_script.');
  const providerOptions = sanitizeHeygenRequestOptions(decision);
  return {
    type: 'avatar',
    avatar_id: config.avatarId,
    voice_id: config.voiceId,
    script: narrationScript,
    title: trimString(row.title),
    ...providerOptions,
    ...(config.callbackUrl ? { callback_url: config.callbackUrl } : {}),
  };
}

async function updateAvatarRunSummary(client, step, summary) {
  const pipelineRunId = trimString(step?.pipeline_run_id);
  if (!pipelineRunId) {
    return;
  }
  await client.query(
    `update pipeline_runs
    set summary_json = summary_json || $2::jsonb,
        updated_at = now()
    where pipeline_run_id = $1`,
    [pipelineRunId, JSON.stringify(summary ?? {})],
  );
}

function evaluateAvatarConsent({ sourcePayload, clientAccountContext }) {
  const sourceContext = asObject(sourcePayload.client_account_context);
  const context = Object.keys(clientAccountContext).length ? clientAccountContext : sourceContext;
  const avatarPolicy = asObject(context.avatar_policy);
  const avatarDecision = asObject(sourcePayload.avatar_decision);
  const presenterProfile = asObject(sourcePayload.presenter_profile ?? avatarDecision.presenter_profile);
  const presenterConsent = asObject(presenterProfile.consent);
  const allowedStatuses = new Set(['approved', 'active', 'valid', 'documented', 'current']);
  const consentStatus = trimString(
    presenterConsent.status
    || presenterConsent.consent_status
    || avatarPolicy.consent_status,
  ).toLowerCase();
  const consentRecordUri = trimString(
    avatarPolicy.consent_record_uri
    || presenterConsent.consent_record_uri
    || presenterProfile.consent_record_uri
    || firstEnv(['HEYGEN_AVATAR_CONSENT_RECORD_URI']),
  );
  const requiresConsent = avatarPolicy.requires_consent !== false;
  const avatarAllowed = avatarPolicy.avatar_allowed === true;
  const errors = [];

  if (!avatarAllowed) {
    errors.push('client/account avatar_policy.avatar_allowed must be true.');
  }
  if (requiresConsent && !consentRecordUri) {
    errors.push('avatar consent_record_uri is required.');
  }
  if (requiresConsent && consentStatus && !allowedStatuses.has(consentStatus)) {
    errors.push(`avatar consent status '${consentStatus}' is not allowed.`);
  }

  return {
    allowed: errors.length === 0,
    errors,
    avatar_policy: avatarPolicy,
    consent: {
      requires_consent: requiresConsent,
      consent_status: consentStatus || null,
      consent_record_uri: consentRecordUri || null,
    },
  };
}

async function runAvatarPresenterSelector({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'selecting_avatar_route',
          updated_at = now()
      where content_id = $1
        and reel_type = 'avatar'
        and status in ('validation_complete', 'storyboard_complete', 'selecting_avatar_route', 'avatar_route_ready')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No avatar validation_complete content item is ready for avatar presenter selector: ${contentId}.`);
    }
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.reel_type,
        ci.status,
        ci.target_duration_seconds,
        ci.source_payload_json,
        coalesce(s.selected_hook, '') as selected_hook,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(s.raw_response_json, '{}'::jsonb) as raw_response_json,
        sb.storyboard_json,
        coalesce(d.director_json, '{}'::jsonb) as director_json,
        coalesce(cac.account_context_key, '') as account_context_key,
        coalesce(cac.context_snapshot_json, ci.source_payload_json->'client_account_context', '{}'::jsonb) as client_account_context
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      join storyboards sb on sb.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      left join content_account_contexts cac on cac.content_id = ci.content_id
      where ci.content_id = $1
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`Avatar presenter selector requires script/storyboard rows for ${contentId}.`);
    }
    return result.rows[0];
  });

  const config = getHeygenConfig({ failOnMissing: false });
  const sourcePayload = asObject(row.source_payload_json);
  const clientAccountContext = asObject(row.client_account_context);
  const directorJson = asObject(row.director_json);
  const storyboardJson = asArray(row.storyboard_json);
  const selectorResult = await invokeStructuredTextStage('avatar_presenter_selector', {
    content_id: contentId,
    title: trimString(row.title),
    target_duration_seconds: Number(row.target_duration_seconds || 45),
    package_type: 'instagram_reel',
    status_after_success: 'avatar_route_ready',
    prompt_template_data: {
      title: trimString(row.title),
      category: trimString(row.category || 'general') || 'general',
      package_type: 'instagram_reel',
      selected_style_pack: selectedStylePackFrom(row, directorJson),
      client_account_context: clientAccountContext,
      client_account_context_json: stringifyPromptJson(clientAccountContext),
      story_package_context: storyPackageContextFrom(row),
      story_package_context_json: stringifyPromptJson(storyPackageContextFrom(row)),
      director_avatar_contract: directorAvatarContractFrom(directorJson),
      director_avatar_contract_json: stringifyPromptJson(directorAvatarContractFrom(directorJson)),
      storyboard_plan: storyboardJson,
      storyboard_plan_json: stringifyPromptJson(storyboardJson, []),
      character_reference_context: asObject(sourcePayload.character_reference),
      character_reference_context_json: stringifyPromptJson(asObject(sourcePayload.character_reference)),
      presenter_profile_inventory: presenterProfileInventoryFrom({ sourcePayload, clientAccountContext, config }),
      presenter_profile_inventory_json: stringifyPromptJson(
        presenterProfileInventoryFrom({ sourcePayload, clientAccountContext, config }),
        [],
      ),
      avatar_provider_inventory: heygenProviderInventory(config),
      avatar_provider_inventory_json: stringifyPromptJson(heygenProviderInventory(config)),
      avatar_rules_summary: DEFAULT_AVATAR_RULES_SUMMARY,
      heygen_capability_summary: HEYGEN_CAPABILITY_SUMMARY,
    },
  });
  const avatarDecision = asObject(selectorResult.avatar_decision_response);
  if (Object.keys(avatarDecision).length === 0) {
    fail('avatar_presenter_selector returned an empty avatar decision.');
  }

  const rawResponseJson = asObject(row.raw_response_json);
  const nextRawResponseJson = {
    ...rawResponseJson,
    avatar_decision_json: avatarDecision,
    avatar_decision_metadata: {
      generation_provider: trimString(selectorResult.generation_provider),
      generation_model: trimString(selectorResult.generation_model),
      provider_metadata: asObject(selectorResult.provider_metadata),
      cost: asObject(selectorResult.cost),
      provider_inventory: heygenProviderInventory(config),
    },
  };
  const fallbackReasonPreview = avatarFallbackReason({
    decision: avatarDecision,
    config,
    consentEvaluation: evaluateAvatarConsent({ sourcePayload, clientAccountContext }),
  });
  const effectiveReelTypePreview = fallbackReasonPreview ? 'video' : 'avatar';

  await withTransaction(pool, async (client) => {
    await client.query(
      `update scripts
      set raw_response_json = $2::jsonb,
          generated_at = now()
      where content_id = $1`,
      [contentId, JSON.stringify(nextRawResponseJson)],
    );
    await client.query(
      `update content_items
      set status = 'avatar_route_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await updateAvatarRunSummary(client, step, {
      requested_reel_type: 'avatar',
      effective_reel_type: effectiveReelTypePreview,
      avatar_decision_status: trimString(avatarDecision.decision_summary?.decision_status),
      avatar_fallback_reason: fallbackReasonPreview || null,
    });
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'avatar_presenter_selector',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        decision_status: trimString(avatarDecision.decision_summary?.decision_status),
        provider_calls_allowed: avatarDecisionWantsProviderCall(avatarDecision),
        effective_reel_type_preview: effectiveReelTypePreview,
        avatar_fallback_reason_preview: fallbackReasonPreview || null,
        generation_provider: trimString(selectorResult.generation_provider),
        generation_model: trimString(selectorResult.generation_model),
        cost: selectorResult.cost ?? {},
      },
    });
  });

  return {
    content_id: contentId,
    status_after_success: 'avatar_route_ready',
    decision_status: trimString(avatarDecision.decision_summary?.decision_status),
    requested_reel_type: 'avatar',
    effective_reel_type_preview: effectiveReelTypePreview,
    avatar_fallback_reason_preview: fallbackReasonPreview || null,
    generation_provider: trimString(selectorResult.generation_provider),
    generation_model: trimString(selectorResult.generation_model),
  };
}

async function runAvatarConsentGate({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const config = getHeygenConfig();
  const result = await withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'checking_avatar_consent',
          updated_at = now()
      where content_id = $1
        and reel_type = 'avatar'
        and status in ('validation_complete', 'storyboard_complete', 'checking_avatar_consent', 'avatar_consent_ready')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No avatar storyboard_complete content item is ready for avatar consent gate: ${contentId}.`);
    }
    const rowResult = await client.query(
      `select
        ci.content_id,
        coalesce(ci.source_payload_json, '{}'::jsonb) as source_payload_json,
        coalesce(cac.context_snapshot_json, ci.source_payload_json->'client_account_context', '{}'::jsonb) as client_account_context
      from content_items ci
      left join content_account_contexts cac on cac.content_id = ci.content_id
      where ci.content_id = $1
      for update of ci`,
      [contentId],
    );
    if (rowResult.rowCount === 0) {
      fail(`No content item exists for avatar consent gate: ${contentId}.`);
    }
    const evaluation = evaluateAvatarConsent({
      sourcePayload: asObject(rowResult.rows[0].source_payload_json),
      clientAccountContext: asObject(rowResult.rows[0].client_account_context),
    });
    if (!evaluation.allowed) {
      await client.query(
        `update content_items
        set status = 'avatar_consent_blocked',
            updated_at = now()
        where content_id = $1`,
        [contentId],
      );
      await logWorkflowRun(client, {
        contentId,
        workflowName: 'avatar_consent_gate',
        runStatus: 'failed',
        startedAt,
        durationMs: durationMsFrom(startedAt),
        errorMessage: evaluation.errors.join(' '),
        details: {
          provider: 'heygen',
          provider_call_blocked: true,
          consent: evaluation.consent,
          avatar_policy: evaluation.avatar_policy,
          errors: evaluation.errors,
        },
      });
      return { blocked: true, evaluation };
    }
    await client.query(
      `update content_items
      set status = 'avatar_consent_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'avatar_consent_gate',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        provider: 'heygen',
        provider_configured: Boolean(config.apiKey && config.avatarId && config.voiceId),
        consent: evaluation.consent,
        avatar_policy: evaluation.avatar_policy,
      },
    });
    return { blocked: false, evaluation };
  });

  if (result.blocked) {
    fail(`Avatar consent gate blocked provider calls: ${result.evaluation.errors.join(' ')}`);
  }

  return {
    content_id: contentId,
    status_after_success: 'avatar_consent_ready',
    consent: result.evaluation.consent,
  };
}

async function loadAvatarMediaCandidate(pool, contentId) {
  return withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'generating_avatar_media',
          updated_at = now()
      where content_id = $1
        and reel_type = 'avatar'
        and status in ('avatar_route_ready', 'generating_avatar_media', 'avatar_consent_ready', 'avatar_ready')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No avatar_route_ready content item is ready for avatar media generation: ${contentId}.`);
    }
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.reel_type,
        ci.source_payload_json,
        coalesce(s.raw_response_json, '{}'::jsonb) as raw_response_json,
        coalesce(cac.context_snapshot_json, ci.source_payload_json->'client_account_context', '{}'::jsonb) as client_account_context
      from content_items ci
      left join scripts s on s.content_id = ci.content_id
      left join content_account_contexts cac on cac.content_id = ci.content_id
      where ci.content_id = $1
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No content item exists for avatar media generation: ${contentId}.`);
    }
    return result.rows[0];
  });
}

async function updateAvatarRouteResult(client, contentId, routeResult) {
  const scriptResult = await client.query(
    `select coalesce(raw_response_json, '{}'::jsonb) as raw_response_json
    from scripts
    where content_id = $1
    for update`,
    [contentId],
  );
  if (scriptResult.rowCount === 0) {
    return;
  }
  const rawResponseJson = asObject(scriptResult.rows[0].raw_response_json);
  await client.query(
    `update scripts
    set raw_response_json = $2::jsonb,
        generated_at = now()
    where content_id = $1`,
    [
      contentId,
      JSON.stringify({
        ...rawResponseJson,
        avatar_route_result: routeResult,
      }),
    ],
  );
}

async function reuseExistingSceneAssetsForFallback(pool, contentId) {
  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        jsonb_array_length(coalesce(sb.storyboard_json, '[]'::jsonb))::int as storyboard_scene_count,
        count(distinct a.scene_number) filter (where a.asset_role = 'scene_video')::int as ready_scene_video_count
      from storyboards sb
      left join assets a on a.content_id = sb.content_id
        and a.asset_role in ('scene_image', 'scene_video')
        and a.status = 'ready'
      where sb.content_id = $1
      group by sb.content_id, sb.storyboard_json`,
      [contentId],
    );
    const row = result.rows[0] ?? {};
    const storyboardSceneCount = Number(row.storyboard_scene_count || 0);
    const readySceneVideoCount = Number(row.ready_scene_video_count || 0);
    if (storyboardSceneCount < 1 || readySceneVideoCount < storyboardSceneCount) {
      return {
        reused: false,
        status_after_success: 'validation_complete',
        scene_count: readySceneVideoCount,
        cost: { type: 'none', provider: 'none', total_usd: 0 },
      };
    }
    await client.query(
      `update content_items
      set status = 'assets_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_asset_generation_v3',
      startedAt: new Date().toISOString(),
      durationMs: 0,
      details: {
        reused_existing_scene_video_assets: true,
        scene_count: readySceneVideoCount,
        cost: { type: 'none', provider: 'none', total_usd: 0 },
      },
    });
    return {
      reused: true,
      status_after_success: 'assets_ready',
      scene_count: readySceneVideoCount,
      cost: { type: 'none', provider: 'none', total_usd: 0 },
    };
  });
}

async function promoteStoryboardForFallbackVideo(client, contentId) {
  const result = await client.query(
    `select
      ci.title,
      sb.storyboard_json
    from content_items ci
    join storyboards sb on sb.content_id = ci.content_id
    where ci.content_id = $1
    for update of sb`,
    [contentId],
  );
  if (result.rowCount === 0) {
    return { scene_count: 0, repairs: ['storyboard missing during avatar fallback promotion'] };
  }
  const row = result.rows[0];
  const repairs = [];
  const storyboard = asArray(row.storyboard_json).map((sceneValue, index) => {
    const scene = asObject(sceneValue);
    const sceneNumber = Number(scene.scene_number ?? index + 1);
    const narrationText = trimString(scene.narration_text);
    const visualPrompt = sanitizeGeneratedAssetPrompt(scene.visual_prompt || scene.image_prompt || scene.fallback_prompt, {
      title: row.title,
      narrationText,
      sceneNumber,
    });
    const assetPlan = normalizeQualityAssetPlan(
      {
        ...scene,
        visual_prompt: visualPrompt,
        image_prompt: trimString(scene.image_prompt)
          ? sanitizeGeneratedAssetPrompt(scene.image_prompt, { title: row.title, narrationText, sceneNumber })
          : '',
        asset_type: 'video',
        asset_plan: {
          ...asObject(scene.asset_plan),
          mode: 'video',
          provider_intent: 'provider_video',
          video_generation_required: true,
          video_generation_reason: 'Avatar route downgraded to video; generate a real provider video scene instead of a still fallback.',
        },
      },
      index,
      'video',
      repairs,
    );
    const remotion = normalizeQualityRemotion(scene, index, assetPlan, repairs);
    return {
      ...scene,
      scene_number: sceneNumber,
      visual_prompt: visualPrompt,
      image_prompt: visualPrompt,
      fallback_prompt: visualPrompt,
      asset_type: 'video',
      asset_plan: assetPlan,
      remotion,
      is_face_image: false,
      face_image_title: '',
    };
  });
  await client.query(
    `update storyboards
    set storyboard_json = $2::jsonb,
        generated_at = now()
    where content_id = $1`,
    [contentId, JSON.stringify(storyboard)],
  );
  return { scene_count: storyboard.length, repairs };
}

async function runAvatarVideoFallback({ pool, step, reason, decision, startedAt }) {
  const contentId = ensureUuid(step.content_id);
  const routeResult = {
    requested_reel_type: 'avatar',
    effective_reel_type: 'video',
    actual_route: 'fallback_video',
    avatar_fallback_reason: trimString(reason) || 'avatar route unavailable',
    provider_calls_attempted: false,
    provider_calls_allowed: avatarDecisionWantsProviderCall(decision),
    decided_at: new Date().toISOString(),
  };

  await withTransaction(pool, async (client) => {
    await updateAvatarRouteResult(client, contentId, routeResult);
    const fallbackPromotion = await promoteStoryboardForFallbackVideo(client, contentId);
    await client.query(
      `update content_items
      set reel_type = 'video',
          status = 'validation_complete',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await updateAvatarRunSummary(client, step, {
      requested_reel_type: 'avatar',
      effective_reel_type: 'video',
      avatar_fallback_reason: routeResult.avatar_fallback_reason,
    });
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'avatar_media_generation',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        route_result: routeResult,
        decision_status: trimString(decision.decision_summary?.decision_status),
        fallback_video_promotion: fallbackPromotion,
      },
    });
  });

  const existingAssetResult = await reuseExistingSceneAssetsForFallback(pool, contentId);
  const assetResult = existingAssetResult.reused === true
    ? existingAssetResult
    : await runAssetGenerationV3({ pool, step });
  const voiceResult = await runVoicePerformanceScript({ pool, step });
  const narrationResult = await runNarrationGeneration({ pool, step });
  return {
    content_id: contentId,
    status_after_success: 'narration_ready',
    requested_reel_type: 'avatar',
    effective_reel_type: 'video',
    actual_route: 'fallback_video',
    avatar_fallback_reason: routeResult.avatar_fallback_reason,
    asset_generation: {
      status_after_success: assetResult.status_after_success,
      scene_count: assetResult.scene_count,
      cost: assetResult.cost ?? {},
    },
    voice_performance: {
      status_after_success: voiceResult.status_after_success,
      line_count: voiceResult.line_count,
      generation_provider: voiceResult.generation_provider,
      generation_model: voiceResult.generation_model,
    },
    narration_generation: {
      status_after_success: narrationResult.status_after_success,
      scene_count: narrationResult.scene_count,
      total_duration_seconds: narrationResult.total_duration_seconds,
      cost: narrationResult.cost ?? {},
    },
  };
}

async function runAvatarMediaGeneration({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await loadAvatarMediaCandidate(pool, contentId);
  const sourcePayload = asObject(row.source_payload_json);
  const clientAccountContext = asObject(row.client_account_context);
  const rawResponseJson = asObject(row.raw_response_json);
  const decision = asObject(rawResponseJson.avatar_decision_json);
  const config = getHeygenConfig({ failOnMissing: false });
  const consentEvaluation = evaluateAvatarConsent({ sourcePayload, clientAccountContext });

  if (Object.keys(decision).length === 0) {
    return runAvatarVideoFallback({
      pool,
      step,
      reason: 'avatar presenter selector decision is missing',
      decision,
      startedAt,
    });
  }

  const fallbackReason = avatarFallbackReason({ decision, config, consentEvaluation });
  if (fallbackReason) {
    return runAvatarVideoFallback({
      pool,
      step,
      reason: fallbackReason,
      decision,
      startedAt,
    });
  }

  await withTransaction(pool, async (client) => {
    await updateAvatarRouteResult(client, contentId, {
      requested_reel_type: 'avatar',
      effective_reel_type: 'avatar',
      actual_route: 'avatar_video',
      provider: 'heygen',
      provider_calls_attempted: Boolean(!config.mockCompletedUrl),
      provider_calls_allowed: true,
      disclosure_required: decision.disclosure_required === true || decision.selected_route?.disclosure_required === true,
      decided_at: new Date().toISOString(),
    });
    await client.query(
      `update content_items
      set reel_type = 'avatar',
          status = 'avatar_consent_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await updateAvatarRunSummary(client, step, {
      requested_reel_type: 'avatar',
      effective_reel_type: 'avatar',
      avatar_fallback_reason: null,
    });
  });

  try {
    const result = await runHeygenAvatarGeneration({
      pool,
      step,
      avatarDecision: decision,
      heygenConfig: config,
      workflowName: 'avatar_media_generation',
    });
    return {
      ...result,
      requested_reel_type: 'avatar',
      effective_reel_type: 'avatar',
      actual_route: 'avatar_video',
    };
  } catch (error) {
    const message = String(error?.message || error || 'HeyGen avatar generation failed.').slice(0, 1000);
    return runAvatarVideoFallback({
      pool,
      step,
      reason: `HeyGen avatar generation failed; auto-downgraded to video. ${message}`,
      decision,
      startedAt,
    });
  }
}

function extractHeygenVideoId(body = {}) {
  const data = asObject(body.data);
  const video = asObject(data.video);
  return trimString(
    body.video_id
    || body.id
    || data.video_id
    || data.id
    || video.video_id
    || video.id,
  );
}

function normalizeHeygenStatus(body = {}) {
  const data = asObject(body.data);
  const video = asObject(data.video);
  const status = trimString(
    body.status
    || body.provider_status
    || data.status
    || data.video_status
    || video.status,
  ).toLowerCase();
  return {
    status: status || 'unknown',
    outputUrl: trimString(
      body.output_url
      || body.video_url
      || body.url
      || data.output_url
      || data.video_url
      || data.url
      || video.output_url
      || video.video_url
      || video.url,
    ),
    thumbnailUrl: trimString(
      body.thumbnail_url
      || data.thumbnail_url
      || data.cover_url
      || video.thumbnail_url
      || video.cover_url,
    ),
    durationSeconds: Number(body.duration_seconds ?? data.duration_seconds ?? data.duration ?? video.duration_seconds ?? video.duration ?? 0) || null,
  };
}

async function heygenRequest({ method = 'GET', path: requestPath, apiKey, body = null }) {
  const response = await fetch(`https://api.heygen.com${requestPath}`, {
    method,
    headers: {
      'X-Api-Key': apiKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`HeyGen request failed (${response.status}): ${JSON.stringify(responseBody)}`);
  }
  return responseBody;
}

async function fetchBinaryAsset(assetUrl, label) {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    fail(`${label} download failed (${response.status}).`);
  }
  return {
    binary: Buffer.from(await response.arrayBuffer()),
    contentType: trimString(response.headers.get('content-type') || 'video/mp4') || 'video/mp4',
  };
}

async function runHeygenAvatarGeneration({
  pool,
  step,
  avatarDecision = null,
  heygenConfig = null,
  workflowName = 'heygen_avatar_generation',
} = {}) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const config = heygenConfig ?? getHeygenConfig();
  if (config.configured !== true) {
    fail(`Avatar video generation requires ${asArray(config.missing).join(', ') || 'HeyGen configuration'}.`);
  }
  const row = await withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'generating_avatar',
          updated_at = now()
      where content_id = $1
        and reel_type = 'avatar'
        and status in ('avatar_consent_ready', 'generating_avatar')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No avatar_consent_ready content item is ready for HeyGen generation: ${contentId}.`);
    }
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.target_duration_seconds,
        coalesce(ci.source_payload_json, '{}'::jsonb) as source_payload_json,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(s.raw_response_json, '{}'::jsonb) as raw_response_json
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      where ci.content_id = $1
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`HeyGen avatar generation requires a story script for ${contentId}.`);
    }
    return result.rows[0];
  });

  const narrationScript = trimString(row.narration_script);
  if (!narrationScript) fail('HeyGen avatar generation requires narration_script.');
  const decision = avatarDecision ?? asObject(asObject(row.raw_response_json).avatar_decision_json);
  const requestBody = buildHeygenRequestBody(row, config, decision);
  const providerRequestOptions = sanitizeHeygenRequestOptions(decision);

  const avatarGeneration = await withTransaction(pool, async (client) => {
    const insert = await client.query(
      `insert into avatar_generations (
        content_id,
        provider,
        provider_status,
        request_json
      ) values ($1,'heygen','queued',$2::jsonb)
      returning avatar_generation_id`,
      [contentId, JSON.stringify(requestBody)],
    );
    return insert.rows[0];
  });

  try {
    let createResponse = {};
    let statusResponse = {};
    let videoId = '';
    let finalStatus = {
      status: 'completed',
      outputUrl: config.mockCompletedUrl,
      thumbnailUrl: trimString(firstEnv(['HEYGEN_MOCK_THUMBNAIL_URL'])),
      durationSeconds: Number(firstEnv(['HEYGEN_MOCK_DURATION_SECONDS']) || row.target_duration_seconds || 0) || null,
    };

    if (!config.mockCompletedUrl) {
      createResponse = await heygenRequest({
        method: 'POST',
        path: '/v3/videos',
        apiKey: config.apiKey,
        body: requestBody,
      });
      videoId = extractHeygenVideoId(createResponse);
      if (!videoId) {
        fail(`HeyGen create-video response did not include a video_id: ${JSON.stringify(createResponse)}`);
      }
      await withTransaction(pool, async (client) => {
        await client.query(
          `update avatar_generations
          set provider_video_id = $2,
              provider_request_id = $2,
              provider_status = 'submitted',
              response_json = $3::jsonb,
              updated_at = now()
          where avatar_generation_id = $1`,
          [avatarGeneration.avatar_generation_id, videoId, JSON.stringify(createResponse)],
        );
      });

      const deadline = Date.now() + config.timeoutMs;
      while (Date.now() < deadline) {
        statusResponse = await heygenRequest({
          path: `/v3/videos/${encodeURIComponent(videoId)}`,
          apiKey: config.apiKey,
        });
        finalStatus = normalizeHeygenStatus(statusResponse);
        await withTransaction(pool, async (client) => {
          await client.query(
            `update avatar_generations
            set provider_status = $2,
                response_json = $3::jsonb,
                updated_at = now()
            where avatar_generation_id = $1`,
            [avatarGeneration.avatar_generation_id, finalStatus.status, JSON.stringify(statusResponse)],
          );
        });
        if (['completed', 'success', 'done', 'failed', 'error'].includes(finalStatus.status)) {
          break;
        }
        await sleep(config.pollIntervalMs);
      }
    }

    if (!['completed', 'success', 'done'].includes(finalStatus.status)) {
      fail(`HeyGen avatar generation did not complete. Last status: ${finalStatus.status || 'unknown'}.`);
    }
    if (!trimString(finalStatus.outputUrl)) {
      fail('HeyGen completed without an output video URL.');
    }

    const downloaded = await fetchBinaryAsset(finalStatus.outputUrl, 'HeyGen avatar video');
    const objectKey = objectKeyForRole(contentId, 'avatar-video', 'mp4');
    const storage = await uploadBinaryAsset('avatar_video', downloaded.binary, {
      objectKey,
      contentType: downloaded.contentType || 'video/mp4',
      fileName: path.basename(objectKey),
    });

    await withTransaction(pool, async (client) => {
      await client.query(
        `delete from assets
        where content_id = $1
          and asset_role = 'avatar_video'`,
        [contentId],
      );
      await client.query(
        `insert into assets (
          content_id,
          scene_number,
          asset_role,
          provider,
          source_url,
          storage_url,
          mime_type,
          duration_seconds,
          status,
          metadata_json
        ) values ($1,null,'avatar_video','heygen',$2,$3,$4,$5,'ready',$6::jsonb)`,
        [
          contentId,
          finalStatus.outputUrl,
          storage.url,
          downloaded.contentType || 'video/mp4',
          finalStatus.durationSeconds,
          JSON.stringify({
            provider: 'heygen',
            provider_video_id: videoId || 'mock',
            avatar_generation_id: avatarGeneration.avatar_generation_id,
            source_type: config.mockCompletedUrl ? 'mock_completed_url_rehosted' : 'heygen_direct_video_rehosted',
            thumbnail_url: finalStatus.thumbnailUrl || null,
            avatar_decision_status: trimString(decision.decision_summary?.decision_status),
            disclosure_required: decision.disclosure_required === true || decision.selected_route?.disclosure_required === true,
            provider_request_options: providerRequestOptions,
            rehost_provider: storage.mode,
            storage_object_key: storage.objectKey,
            generated_at: new Date().toISOString(),
          }),
        ],
      );
      await client.query(
        `update avatar_generations
        set provider_status = 'completed',
            output_url = $2,
            thumbnail_url = nullif($3, ''),
            duration_seconds = $4,
            response_json = case when $5::jsonb = '{}'::jsonb then response_json else $5::jsonb end,
            completed_at = now(),
            updated_at = now()
        where avatar_generation_id = $1`,
        [
          avatarGeneration.avatar_generation_id,
          storage.url,
          finalStatus.thumbnailUrl || '',
          finalStatus.durationSeconds,
          JSON.stringify(statusResponse),
        ],
      );
      await updateAvatarRouteResult(client, contentId, {
        requested_reel_type: 'avatar',
        effective_reel_type: 'avatar',
        actual_route: 'avatar_video',
        provider: 'heygen',
        provider_video_id: videoId || 'mock',
        output_video_url: storage.url,
        duration_seconds: finalStatus.durationSeconds,
        disclosure_required: decision.disclosure_required === true || decision.selected_route?.disclosure_required === true,
        disclosure_text: trimString(decision.selected_route?.disclosure_text || decision.presenter_profile?.disclosure_policy?.disclosure_text) || null,
        provider_request_options: providerRequestOptions,
        completed_at: new Date().toISOString(),
      });
      await client.query(
        `update content_items
        set status = 'avatar_ready',
            updated_at = now()
        where content_id = $1`,
        [contentId],
      );
      await logWorkflowRun(client, {
        contentId,
        workflowName,
        startedAt,
        durationMs: durationMsFrom(startedAt),
        details: {
          provider: 'heygen',
          provider_video_id: videoId || 'mock',
          avatar_generation_id: avatarGeneration.avatar_generation_id,
          output_video_url: storage.url,
          duration_seconds: finalStatus.durationSeconds,
          provider_request_options: providerRequestOptions,
          avatar_decision_status: trimString(decision.decision_summary?.decision_status),
          cost: { type: 'provider_dashboard', provider: 'heygen', total_usd: 0 },
        },
      });
    });

    return {
      content_id: contentId,
      status_after_success: 'avatar_ready',
      provider: 'heygen',
      provider_video_id: videoId || 'mock',
      output_video_url: storage.url,
      duration_seconds: finalStatus.durationSeconds,
    };
  } catch (error) {
    const message = String(error?.message || error || 'HeyGen avatar generation failed.').slice(0, 4000);
    await withTransaction(pool, async (client) => {
      await client.query(
        `update avatar_generations
        set provider_status = 'failed',
            error_message = $2,
            updated_at = now()
        where avatar_generation_id = $1
          and provider_status <> 'completed'`,
        [avatarGeneration.avatar_generation_id, message],
      );
      await client.query(
        `update content_items
        set status = 'avatar_failed',
            updated_at = now()
        where content_id = $1
          and status <> 'avatar_ready'`,
        [contentId],
      );
      await logWorkflowRun(client, {
        contentId,
        workflowName,
        runStatus: 'failed',
        startedAt,
        durationMs: durationMsFrom(startedAt),
        errorMessage: message,
        details: {
          provider: 'heygen',
          avatar_generation_id: avatarGeneration.avatar_generation_id,
          provider_call_attempted: !config.mockCompletedUrl,
        },
      });
    });
    throw error;
  }
}

function inferAssetType(asset) {
  const mimeType = trimString(asset?.mime_type).toLowerCase();
  const assetRole = trimString(asset?.asset_role).toLowerCase();
  const storageUrl = trimString(asset?.storage_url).toLowerCase();
  if (mimeType.startsWith('video/') || assetRole === 'scene_video' || storageUrl.endsWith('.mp4')) {
    return 'video';
  }
  return 'image';
}

function normalizeAssetPlanForRender(scene, assetType, asset = {}) {
  const metadata = asObject(asset?.metadata_json);
  const rawPlan = asObject(scene?.asset_plan);
  const metadataPlan = asObject(metadata.asset_plan);
  const plan = Object.keys(rawPlan).length ? rawPlan : metadataPlan;
  const requestedMode = trimString(plan.mode || metadata.requested_asset_type || scene?.asset_type).toLowerCase();
  let mode = requestedMode === 'video' ? 'video' : (requestedMode === 'image' ? 'image' : 'image_with_motion');
  if (assetType === 'image' && (mode === 'video' || metadata.fallback_from_video === true)) {
    mode = 'image_with_motion';
  }
  return {
    mode,
    provider_intent: mode === 'video' ? 'provider_video' : (mode === 'image' ? 'static_image' : 'remotion_motion'),
    motion_requirement: trimString(plan.motion_requirement || metadata?.remotion?.motion_intensity || 'medium') || 'medium',
    video_generation_required: mode === 'video',
    video_generation_reason: trimString(plan.video_generation_reason || ''),
    fallback_mode: 'image_with_motion',
    budget_priority: trimString(plan.budget_priority || (mode === 'video' ? 'premium' : 'standard')) || 'standard',
    review_required: mode === 'video',
    requested_mode: requestedMode || mode,
    actual_asset_type: assetType,
    fallback_from_video: metadata.fallback_from_video === true,
    fallback_reason: trimString(metadata.fallback_reason),
  };
}

function normalizeRemotionForRender(scene, assetPlan, index, asset = {}) {
  const metadata = asObject(asset?.metadata_json);
  const raw = Object.keys(asObject(scene?.remotion)).length
    ? asObject(scene.remotion)
    : asObject(metadata.remotion);
  const cameraMoves = new Set(['push_in', 'pull_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'drift', 'hold']);
  const directions = new Set(['center_push', 'center_pull', 'left_to_right', 'right_to_left', 'bottom_to_top', 'top_to_bottom', 'diagonal_up', 'diagonal_down', 'hold']);
  const transitions = new Set(['cut', 'crossfade', 'soft_cut', 'dip_to_black', 'slide_left', 'slide_right', 'wipe_up', 'match_cut']);
  const overlays = new Set(['none', 'subtle_vignette', 'warm_gradient', 'cool_gradient', 'documentary_shadow', 'soft_light_leak']);
  const pacingValues = new Set(['quick', 'steady', 'slow', 'linger']);
  const motion = trimString(raw.motion_intensity || assetPlan.motion_requirement || 'medium').toLowerCase();
  const defaultCamera = motion === 'high'
    ? ['pan_left', 'pan_right', 'tilt_up', 'push_in'][index % 4]
    : ['push_in', 'pan_right', 'tilt_down', 'drift'][index % 4];
  const cameraMove = cameraMoves.has(trimString(raw.camera_move).toLowerCase()) ? trimString(raw.camera_move).toLowerCase() : defaultCamera;
  const directionByMove = {
    pull_out: 'center_pull',
    pan_left: 'right_to_left',
    pan_right: 'left_to_right',
    tilt_up: 'bottom_to_top',
    tilt_down: 'top_to_bottom',
    drift: 'diagonal_up',
    hold: 'hold',
  };
  const panZoomDirection = directions.has(trimString(raw.pan_zoom_direction).toLowerCase())
    ? trimString(raw.pan_zoom_direction).toLowerCase()
    : (directionByMove[cameraMove] || 'center_push');
  const transitionType = transitions.has(trimString(raw.transition_type || scene?.transition).toLowerCase().replace(/[\s-]+/g, '_'))
    ? trimString(raw.transition_type || scene?.transition).toLowerCase().replace(/[\s-]+/g, '_')
    : (index === 0 ? 'cut' : 'soft_cut');
  const overlayStyle = overlays.has(trimString(raw.overlay_style).toLowerCase())
    ? trimString(raw.overlay_style).toLowerCase()
    : (motion === 'high' ? 'documentary_shadow' : 'subtle_vignette');
  const pacing = pacingValues.has(trimString(raw.pacing).toLowerCase())
    ? trimString(raw.pacing).toLowerCase()
    : (motion === 'low' ? 'linger' : 'steady');
  return {
    camera_move: cameraMove,
    pan_zoom_direction: panZoomDirection,
    motion_intensity: ['low', 'medium', 'high'].includes(motion) ? motion : 'medium',
    transition_type: transitionType,
    overlay_style: overlayStyle,
    pacing,
    motion_layers: asArray(raw.motion_layers).map((entry) => trimString(entry)).filter(Boolean).slice(0, 4),
    instructions: trimString(raw.instructions),
  };
}

function renderOutputSettings(seed) {
  const outputWidth = Number.parseInt(trimString(process.env.RENDER_OUTPUT_WIDTH || seed?.output?.width || '1080'), 10);
  const outputHeight = Number.parseInt(trimString(process.env.RENDER_OUTPUT_HEIGHT || seed?.output?.height || '1920'), 10);
  const outputFps = Number.parseInt(trimString(process.env.RENDER_OUTPUT_FPS || seed?.output?.fps || '30'), 10);
  const outputFormat = trimString(process.env.RENDER_OUTPUT_FORMAT || seed?.output?.format || 'mp4') || 'mp4';
  return {
    width: Number.isFinite(outputWidth) ? outputWidth : 1080,
    height: Number.isFinite(outputHeight) ? outputHeight : 1920,
    fps: Number.isFinite(outputFps) ? outputFps : 30,
    format: outputFormat,
    aspect_ratio: '9:16',
  };
}

function titleOverlay(text) {
  const normalizedText = trimString(text);
  if (!normalizedText) {
    return null;
  }
  return {
    text: normalizedText,
    enabled: true,
    duration_seconds: 2.0,
    mode: 'opening_title_card',
    renderer_owned: true,
  };
}

function narrationTailPaddingSeconds() {
  const configured = Number.parseFloat(trimString(process.env.NARRATION_SCENE_TAIL_SECONDS || process.env.RENDER_NARRATION_TAIL_SECONDS || '0.35'));
  if (!Number.isFinite(configured)) {
    return 0.35;
  }
  return Math.min(1.5, Math.max(0, Number(configured.toFixed(2))));
}

function reelMaxDurationSeconds() {
  const configured = Number.parseFloat(trimString(firstEnv([
    'INSTAGRAM_REEL_MAX_SECONDS',
    'RENDER_MAX_DURATION_SECONDS',
    'REEL_MAX_DURATION_SECONDS',
  ]) || '60'));
  if (!Number.isFinite(configured) || configured <= 0) {
    return 60;
  }
  return Number(configured.toFixed(2));
}

function effectiveNarrationTailPaddingSeconds(sceneNarrationAssets) {
  const rawTailPadding = narrationTailPaddingSeconds();
  const narratedScenes = asArray(sceneNarrationAssets).filter((asset) => Number(asset?.duration_seconds ?? 0) > 0);
  if (rawTailPadding <= 0 || narratedScenes.length === 0) {
    return rawTailPadding;
  }
  const narrationTotalSeconds = narratedScenes.reduce((sum, asset) => sum + Math.max(Number(asset.duration_seconds ?? 0), 0), 0);
  const maxDurationSeconds = reelMaxDurationSeconds();
  const projectedTotalSeconds = narrationTotalSeconds + (rawTailPadding * narratedScenes.length);
  if (projectedTotalSeconds <= maxDurationSeconds) {
    return rawTailPadding;
  }
  const remainingTailBudget = maxDurationSeconds - narrationTotalSeconds;
  if (remainingTailBudget <= 0) {
    return 0;
  }
  return Number(Math.max(0, remainingTailBudget / narratedScenes.length).toFixed(2));
}

function buildAvatarRenderManifest(row, {
  contentId,
  title,
  storyboard,
  subtitleLines,
  seed,
  output,
  subtitleStyle,
}) {
  const avatarAssets = asArray(row.avatar_assets_json).filter((asset) => trimString(asset?.storage_url));
  if (avatarAssets.length === 0) {
    fail('Avatar render manifest requires one ready avatar_video asset.');
  }
  const avatarAsset = avatarAssets[0];
  const durationSeconds = roundToHundredths(Math.max(
    Number(avatarAsset.duration_seconds ?? row.target_duration_seconds ?? 0) || 0,
    0.5,
  ));
  const firstStoryboardScene = storyboard[0] ?? {};
  const faceImageScene = storyboard.find((scene) => scene.is_face_image === true) ?? firstStoryboardScene;
  const faceImageTitle = trimString(faceImageScene?.face_image_title);
  const thumbnailUrl = trimString(avatarAsset.metadata_json?.thumbnail_url);
  const coverImageUrl = thumbnailUrl || trimString(row.cover_image_url);
  const manifestScenes = [{
    scene_number: 1,
    start_time_seconds: 0,
    end_time_seconds: durationSeconds,
    duration_seconds: durationSeconds,
    transition: trimString(firstStoryboardScene.transition),
    mood: trimString(firstStoryboardScene.mood),
    music_cue: trimString(firstStoryboardScene.music_cue),
    visual_prompt: trimString(firstStoryboardScene.visual_prompt || 'Avatar presenter video'),
    narration_text: trimString(row.narration_script),
    narration_url: '',
    narration_duration_seconds: durationSeconds,
    asset: {
      asset_role: 'avatar_video',
      asset_type: 'video',
      provider: trimString(avatarAsset.provider || 'heygen'),
      storage_url: trimString(avatarAsset.storage_url),
      mime_type: trimString(avatarAsset.mime_type || 'video/mp4'),
      width: Number(avatarAsset.width ?? 0),
      height: Number(avatarAsset.height ?? 0),
    },
    subtitle: null,
  }];
  const renderManifest = {
    manifest_version: 2,
    render_mode: 'avatar',
    reel_type: 'avatar',
    content_id: contentId,
    title,
    title_overlay: titleOverlay(faceImageTitle),
    output,
    audio: {
      narration: {
        mode: 'embedded_avatar',
        provider: trimString(avatarAsset.provider || 'heygen'),
        storage_url: '',
        total_duration_seconds: durationSeconds,
      },
    },
    subtitles: {
      enabled: false,
      style: subtitleStyle,
      lines: subtitleLines,
    },
    timing: {
      mode: 'avatar_primary_video',
      total_duration_seconds: durationSeconds,
      scene_count: 1,
    },
    scenes: manifestScenes,
    timeline: [{
      scene_number: 1,
      start_time_seconds: 0,
      end_time_seconds: durationSeconds,
      duration_seconds: durationSeconds,
      asset_url: trimString(avatarAsset.storage_url),
      asset_type: 'video',
      narration_url: '',
      transition: trimString(firstStoryboardScene.transition),
    }],
    total_duration_seconds: durationSeconds,
    cover_image_url: coverImageUrl,
    seed,
  };
  return {
    render_manifest_json: renderManifest,
    render_manifest_summary: {
      reel_type: 'avatar',
      scene_count: 1,
      total_duration_seconds: durationSeconds,
      timeline_mode: 'avatar_primary_video',
      output,
      cover_image_url: coverImageUrl,
      scene_asset_types: [{ scene_number: 1, asset_type: 'video', asset_role: 'avatar_video' }],
    },
    cover_image_url: coverImageUrl,
    resolution: `${output.width}x${output.height}`,
    aspect_ratio: '9:16',
    duration_seconds: durationSeconds,
    render_status: 'manifest_ready',
  };
}

function buildRenderManifest(row) {
  const contentId = ensureUuid(row.content_id);
  const title = trimString(row.title);
  const reelType = trimString(row.reel_type || 'video').toLowerCase() || 'video';
  const storyboard = asArray(row.storyboard_json);
  const faceImageScene = storyboard.find((scene) => scene.is_face_image === true) ?? storyboard[0] ?? null;
  const faceImageTitle = trimString(faceImageScene?.face_image_title);
  const subtitleLines = asArray(row.subtitle_lines_json);
  const sceneAssets = asArray(row.scene_assets_json);
  const sceneNarrationAssets = asArray(row.scene_narration_assets_json);
  const seed = asObject(row.render_manifest_seed_json);
  const output = renderOutputSettings(seed);
  const subtitleStyle = trimString(process.env.RENDER_SUBTITLE_STYLE || seed?.subtitles?.style || 'cinematic_center_safe') || 'cinematic_center_safe';

  if (!title) fail('Render manifest candidate did not return title.');
  if (storyboard.length < 4) fail('A render manifest requires at least 4 storyboard scenes.');
  if (reelType === 'avatar') {
    return buildAvatarRenderManifest(row, {
      contentId,
      title,
      storyboard,
      subtitleLines,
      seed,
      output,
      subtitleStyle,
    });
  }
  if (sceneAssets.length < 4) fail('A render manifest requires at least 4 ready scene assets.');
  if (sceneNarrationAssets.length < storyboard.length) {
    fail(`A render manifest requires ${storyboard.length} scene_narration assets, got ${sceneNarrationAssets.length}.`);
  }

  const narrationSpeed = Number.isFinite(Number(sceneNarrationAssets[0]?.metadata_json?.speed))
    ? Number(sceneNarrationAssets[0].metadata_json.speed)
    : 1;
  const narrationTailPadding = effectiveNarrationTailPaddingSeconds(sceneNarrationAssets);
  const narrationByScene = Object.fromEntries(sceneNarrationAssets.map((asset) => [Number(asset.scene_number), asset]));

  let currentTime = 0;
  const manifestScenes = storyboard.map((scene, index) => {
    const sceneNumber = Number(scene?.scene_number ?? index + 1);
    const narrationAsset = narrationByScene[sceneNumber] ?? null;
    if (!narrationAsset) fail(`Missing scene_narration asset for scene ${sceneNumber}.`);
    const narrationDurationSeconds = roundToHundredths(Math.max(Number(narrationAsset.duration_seconds ?? 0), 0.5));
    const durationSeconds = roundToHundredths(Math.max(narrationDurationSeconds + narrationTailPadding, 0.5));
    const matchingAsset = sceneAssets.find((asset) => Number(asset?.scene_number ?? 0) === sceneNumber);
    if (!matchingAsset) fail(`Missing scene asset for scene ${sceneNumber}.`);
    if (!trimString(matchingAsset.storage_url)) fail(`Scene ${sceneNumber} asset is missing storage_url.`);
    const startTime = roundToHundredths(currentTime);
    const endTime = roundToHundredths(currentTime + durationSeconds);
    currentTime = endTime;
    const subtitle = subtitleLines.find((line) => Number(line?.scene_number ?? 0) === sceneNumber);
    const assetType = inferAssetType(matchingAsset);
    const assetPlan = normalizeAssetPlanForRender(scene, assetType, matchingAsset);
    const remotion = normalizeRemotionForRender(scene, assetPlan, index, matchingAsset);
    return {
      scene_number: sceneNumber,
      start_time_seconds: startTime,
      end_time_seconds: endTime,
      duration_seconds: durationSeconds,
      transition: trimString(scene?.transition),
      asset_plan: assetPlan,
      remotion,
      mood: trimString(scene?.mood),
      music_cue: trimString(scene?.music_cue),
      visual_prompt: trimString(scene?.visual_prompt),
      narration_text: trimString(scene?.narration_text),
      narration_url: trimString(narrationAsset.storage_url),
      narration_duration_seconds: narrationDurationSeconds,
      narration_tail_padding_seconds: narrationTailPadding,
      asset: {
        asset_role: trimString(matchingAsset.asset_role),
        asset_type: assetType,
        provider: trimString(matchingAsset.provider),
        storage_url: trimString(matchingAsset.storage_url),
        mime_type: trimString(matchingAsset.mime_type),
        width: Number(matchingAsset.width ?? 0),
        height: Number(matchingAsset.height ?? 0),
        metadata_json: asObject(matchingAsset.metadata_json),
      },
      subtitle: subtitle ? {
        text: trimString(subtitle.text),
        style: subtitleStyle,
      } : null,
    };
  });
  const totalDuration = roundToHundredths(manifestScenes.reduce((sum, scene) => sum + scene.duration_seconds, 0));
  const coverImageUrl = trimString((sceneAssets.find((asset) => inferAssetType(asset) === 'image') ?? sceneAssets[0])?.storage_url);
  const renderManifest = {
    manifest_version: 2,
    render_mode: reelType === 'image' ? 'image' : 'video',
    reel_type: reelType,
    content_id: contentId,
    title,
    title_overlay: titleOverlay(faceImageTitle),
    output,
    audio: {
      narration: {
        mode: 'per_scene',
        scenes: sceneNarrationAssets.map((asset) => ({
          scene_number: Number(asset.scene_number),
          provider: trimString(asset.provider),
          storage_url: trimString(asset.storage_url),
          mime_type: trimString(asset.mime_type || 'audio/mpeg'),
          duration_seconds: Number(asset.duration_seconds ?? 0),
          tail_padding_seconds: narrationTailPadding,
        })),
        total_duration_seconds: totalDuration,
        voice: trimString(sceneNarrationAssets[0]?.metadata_json?.voice),
        speed: narrationSpeed,
      },
    },
    subtitles: {
      enabled: false,
      style: subtitleStyle,
      lines: subtitleLines,
    },
    timing: {
      mode: 'per_scene_narration',
      total_duration_seconds: totalDuration,
      narration_speed: narrationSpeed,
      scene_count: manifestScenes.length,
    },
    scenes: manifestScenes,
    timeline: manifestScenes.map((scene) => ({
      scene_number: scene.scene_number,
      start_time_seconds: scene.start_time_seconds,
      end_time_seconds: scene.end_time_seconds,
      duration_seconds: scene.duration_seconds,
      asset_url: scene.asset.storage_url,
      asset_type: scene.asset.asset_type,
      narration_url: scene.narration_url,
      narration_duration_seconds: scene.narration_duration_seconds,
      narration_tail_padding_seconds: scene.narration_tail_padding_seconds,
      transition: scene.transition,
      asset_plan: scene.asset_plan,
      remotion: scene.remotion,
    })),
    total_duration_seconds: totalDuration,
    cover_image_url: coverImageUrl,
    seed,
  };
  const summary = {
    scene_count: manifestScenes.length,
    total_duration_seconds: totalDuration,
    timeline_mode: 'per_scene_narration',
    narration_speed: narrationSpeed,
    output: renderManifest.output,
    cover_image_url: coverImageUrl,
    scene_asset_types: manifestScenes.map((scene) => ({
      scene_number: scene.scene_number,
      asset_type: scene.asset.asset_type,
      asset_role: scene.asset.asset_role,
      asset_plan_mode: scene.asset_plan.mode,
      fallback_from_video: scene.asset_plan.fallback_from_video,
    })),
  };
  return {
    render_manifest_json: renderManifest,
    render_manifest_summary: summary,
    cover_image_url: coverImageUrl,
    resolution: `${output.width}x${output.height}`,
    aspect_ratio: '9:16',
    duration_seconds: totalDuration,
    render_status: 'manifest_ready',
  };
}

async function runRenderManifestConstruction({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'building_render_manifest',
          updated_at = now()
      where content_id = $1
        and status in ('narration_ready', 'avatar_ready', 'building_render_manifest')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No narration_ready/avatar_ready content item is ready for render manifest construction: ${contentId}.`);
    }
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.reel_type,
        ci.target_duration_seconds,
        ci.status,
        coalesce(s.narration_script, '') as narration_script,
        sb.storyboard_json,
        sb.subtitle_lines_json,
        sb.render_manifest_seed_json,
        jsonb_agg(
          jsonb_build_object(
            'scene_number', a.scene_number,
            'asset_role', a.asset_role,
            'provider', a.provider,
            'storage_url', a.storage_url,
            'mime_type', a.mime_type,
            'duration_seconds', a.duration_seconds,
            'width', a.width,
            'height', a.height,
            'metadata_json', a.metadata_json
          )
          order by a.scene_number, a.asset_role
        ) filter (where a.asset_role in ('scene_image', 'scene_video') and a.status = 'ready') as scene_assets_json,
        jsonb_agg(
          jsonb_build_object(
            'scene_number', a.scene_number,
            'provider', a.provider,
            'storage_url', a.storage_url,
            'mime_type', a.mime_type,
            'duration_seconds', a.duration_seconds,
            'metadata_json', a.metadata_json
          )
          order by a.scene_number
        ) filter (where a.asset_role = 'scene_narration' and a.status = 'ready') as scene_narration_assets_json,
        jsonb_agg(
          jsonb_build_object(
            'asset_role', a.asset_role,
            'provider', a.provider,
            'storage_url', a.storage_url,
            'mime_type', a.mime_type,
            'duration_seconds', a.duration_seconds,
            'width', a.width,
            'height', a.height,
            'metadata_json', a.metadata_json
          )
          order by a.created_at desc
        ) filter (where a.asset_role = 'avatar_video' and a.status = 'ready') as avatar_assets_json
      from content_items ci
      join storyboards sb on sb.content_id = ci.content_id
      left join scripts s on s.content_id = ci.content_id
      left join assets a on a.content_id = ci.content_id
      where ci.content_id = $1
        and ci.status = 'building_render_manifest'
      group by ci.content_id, ci.title, ci.reel_type, ci.target_duration_seconds, ci.status,
        s.narration_script, sb.storyboard_json, sb.subtitle_lines_json, sb.render_manifest_seed_json`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`Content item does not have enough ready assets for render manifest construction: ${contentId}.`);
    }
    return result.rows[0];
  });

  const manifest = buildRenderManifest(row);
  await withTransaction(pool, async (client) => {
    await client.query(
      `insert into renders (
        content_id,
        render_manifest_json,
        output_video_url,
        cover_image_url,
        resolution,
        aspect_ratio,
        duration_seconds,
        render_status,
        render_log,
        requested_at,
        completed_at
      ) values ($1,$2::jsonb,null,$3,$4,$5,$6,$7,null,now(),null)
      on conflict (content_id) do update set
        render_manifest_json = excluded.render_manifest_json,
        output_video_url = null,
        cover_image_url = excluded.cover_image_url,
        resolution = excluded.resolution,
        aspect_ratio = excluded.aspect_ratio,
        duration_seconds = excluded.duration_seconds,
        render_status = excluded.render_status,
        render_log = null,
        requested_at = now(),
        completed_at = null`,
      [
        contentId,
        JSON.stringify(manifest.render_manifest_json),
        manifest.cover_image_url,
        manifest.resolution,
        manifest.aspect_ratio,
        manifest.duration_seconds,
        manifest.render_status,
      ],
    );
    await client.query(
      `update content_items
      set status = 'render_manifest_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_remotion_manifest',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        render_manifest: manifest.render_manifest_summary,
      },
    });
  });
  return {
    content_id: contentId,
    status_after_success: 'render_manifest_ready',
    render_status: manifest.render_status,
    ...manifest.render_manifest_summary,
  };
}

function parseNumber(value, fallback) {
  const parsed = Number.parseFloat(trimString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildRenderRequest(row) {
  const contentId = ensureUuid(row.content_id);
  const manifest = asObject(row.render_manifest_json);
  const renderMode = trimString(manifest.render_mode || row.reel_type || 'video').toLowerCase() || 'video';
  const sourcePayload = asObject(row.source_payload_json);
  const promptProfile = asObject(sourcePayload.prompt_profile);
  const creativeDefaults = asObject(sourcePayload.creative_defaults);
  const directorJson = asObject(row.director_json);
  const narrationMode = trimString(manifest?.audio?.narration?.mode);
  const isPerScene = narrationMode === 'per_scene';
  const isEmbeddedAvatar = narrationMode === 'embedded_avatar' || renderMode === 'avatar';
  const minTimelineEntries = renderMode === 'avatar' ? 1 : 4;
  if (!Array.isArray(manifest.scenes) || manifest.scenes.length < minTimelineEntries) fail('render_manifest_json is missing scenes.');
  if (!Array.isArray(manifest.timeline) || manifest.timeline.length < minTimelineEntries) fail('render_manifest_json is missing timeline entries.');
  if (isPerScene) {
    const narrationScenes = asArray(manifest?.audio?.narration?.scenes);
    if (narrationScenes.length === 0) fail('render_manifest_json has empty per-scene narration.');
    const missingUrl = narrationScenes.find((scene) => !trimString(scene?.storage_url));
    if (missingUrl) fail(`render_manifest_json per_scene narration scene ${missingUrl.scene_number ?? '?'} is missing storage_url.`);
  } else if (!isEmbeddedAvatar && !trimString(manifest?.audio?.narration?.storage_url)) {
    fail('render_manifest_json is missing narration audio.');
  }

  const configuredSyncUrl = trimString(process.env.RENDER_WORKER_SYNC_URL);
  const configuredWorkerUrl = trimString(process.env.RENDER_WORKER_URL);
  const workerUrl = configuredSyncUrl || (configuredWorkerUrl ? configuredWorkerUrl.replace(/\/render\/?$/, '/render-sync') : 'http://remotion-renderer:8081/render-sync');
  const outputPrefix = trimString(process.env.RENDER_OUTPUT_PATH_PREFIX || 'reels').replace(/^\/+|\/+$/g, '') || 'reels';
  const renderProvider = trimString(process.env.RENDER_PROVIDER || 'remotion').toLowerCase() || 'remotion';
  const requestId = `render-${contentId}-${Date.now()}`;
  const backgroundMusicVolume = Math.min(1, Math.max(0, parseNumber(process.env.BACKGROUND_MUSIC_DEFAULT_VOLUME, 0.12)));
  const backgroundMusicFadeInSeconds = Math.max(0, parseNumber(process.env.BACKGROUND_MUSIC_FADE_IN_SECONDS, 0.8));
  const backgroundMusicFadeOutSeconds = Math.max(0, parseNumber(process.env.BACKGROUND_MUSIC_FADE_OUT_SECONDS, 2.5));
  const sceneMoods = manifest.scenes.flatMap((scene) => [trimString(scene?.mood), trimString(scene?.music_cue)]).filter(Boolean);
  const scenePromptSummary = manifest.scenes.map((scene) => trimString(scene?.visual_prompt)).filter(Boolean).slice(0, 6).join(' | ');
  const scriptMusicDirection = trimString(row.script_music_direction);
  const narrationScript = trimString(row.narration_script);
  const backgroundMusicDirection = [
    trimString(directorJson.global_music_direction),
    trimString(creativeDefaults.music_mood),
    trimString(promptProfile?.narration_generation?.background_music_direction),
    scriptMusicDirection,
  ].filter(Boolean).join(' | ');
  const narrationStyle = [
    trimString(directorJson.tts_delivery),
    trimString(creativeDefaults.narrator_style),
    trimString(promptProfile?.narration_generation?.narration_style),
  ].filter(Boolean).join(' | ');
  const styleNotes = [
    trimString(directorJson.global_visual_style),
    trimString(directorJson.visual_strategy),
    trimString(creativeDefaults.visual_strategy),
    trimString(promptProfile?.storyboard_and_prompts?.visual_style_rules),
    trimString(promptProfile?.scene_asset_generation?.style_notes),
    trimString(promptProfile?.post_image_generation?.style_notes),
  ].filter(Boolean).join(' | ');

  return {
    worker_url: workerUrl,
    request_id: requestId,
    render_provider: renderProvider,
    render_request: {
      content_id: contentId,
      request_id: requestId,
      reel_type: trimString(manifest.reel_type || row.reel_type || 'video') || 'video',
      render_mode: renderMode,
      title: trimString(row.title),
      title_overlay: manifest.title_overlay && typeof manifest.title_overlay === 'object'
        ? { ...manifest.title_overlay }
        : { enabled: false },
      render_provider: renderProvider,
      render_manifest: manifest,
      output: manifest.output,
      timeline: manifest.timeline.map((scene) => ({
        scene_number: scene.scene_number,
        asset_url: scene.asset_url,
        asset_type: scene.asset_type,
        start_time: scene.start_time_seconds,
        end_time: scene.end_time_seconds,
        duration_seconds: scene.duration_seconds,
        narration_url: trimString(scene.narration_url) || null,
        transition: scene.transition,
      })),
      audio: {
        narration_url: isPerScene || isEmbeddedAvatar ? null : (trimString(manifest.audio?.narration?.storage_url) || null),
        narration: {
          ...asObject(manifest.audio?.narration),
          mode: narrationMode || (isEmbeddedAvatar ? 'embedded_avatar' : 'single'),
          storage_url: isPerScene || isEmbeddedAvatar ? null : (trimString(manifest.audio?.narration?.storage_url) || null),
        },
        music_url: null,
        music_path: null,
        music_volume: backgroundMusicVolume,
        music_fade_in_seconds: backgroundMusicFadeInSeconds,
        music_fade_out_seconds: backgroundMusicFadeOutSeconds,
      },
      music_context: {
        category: trimString(row.category || 'general') || 'general',
        selected_hook: trimString(row.selected_hook),
        narration_script_excerpt: narrationScript.slice(0, 1500),
        scene_prompt_summary: scenePromptSummary,
        prompt_profile_summary: trimString(sourcePayload.prompt_profile_summary),
        background_music_direction: backgroundMusicDirection,
        narration_style: narrationStyle,
        style_notes: styleNotes,
        scene_moods: sceneMoods,
        script_music_direction: scriptMusicDirection,
      },
      subtitles: {
        enabled: false,
        subtitle_lines: asArray(manifest.subtitles?.lines),
        style: trimString(manifest.subtitles?.style || process.env.RENDER_SUBTITLE_STYLE || 'cinematic_center_safe'),
      },
      cover: {
        enabled: Boolean(manifest.cover_image_url),
        cover_asset_url: trimString(manifest.cover_image_url) || null,
      },
      storage: {
        output_path: `${outputPrefix}/${contentId}/final.${trimString(manifest.output?.format || 'mp4') || 'mp4'}`,
      },
    },
  };
}

async function runRenderSyncCompletion({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.reel_type,
        ci.status,
        ci.category,
        ci.source_payload_json,
        coalesce(d.director_json, '{}'::jsonb) as director_json,
        r.render_manifest_json,
        r.render_status,
        r.resolution,
        r.aspect_ratio,
        r.duration_seconds,
        r.cover_image_url,
        coalesce(s.selected_hook, '') as selected_hook,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(s.raw_response_json->'parsed_response'->>'music_direction', s.raw_response_json->>'music_direction', '') as script_music_direction
      from content_items ci
      join renders r on r.content_id = ci.content_id
      left join scripts s on s.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      where ci.content_id = $1
        and ci.status in ('render_manifest_ready', 'dispatching_render')
        and r.render_status in ('manifest_ready', 'queued')
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No render_manifest_ready content item is ready for render sync: ${contentId}.`);
    }
    await client.query(
      `update content_items
      set status = 'dispatching_render',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await client.query(
      `update renders
      set render_status = 'queued',
          render_log = null,
          completed_at = null
      where content_id = $1`,
      [contentId],
    );
    return result.rows[0];
  });

  const request = buildRenderRequest(row);
  const fallbackCoverImageUrl = trimString(request.render_request?.cover?.cover_asset_url || row.cover_image_url);
  const fallbackDurationSeconds = Number(row.duration_seconds ?? request.render_request?.output?.duration_seconds ?? 0);
  const fallbackResolution = trimString(row.resolution || request.render_request?.output?.resolution);
  let renderResult;
  if (!request.worker_url) {
    renderResult = {
      render_status: 'failed',
      output_video_url: '',
      cover_image_url: fallbackCoverImageUrl,
      duration_seconds: fallbackDurationSeconds,
      resolution: fallbackResolution,
      render_log: '',
      error_message: 'Set RENDER_WORKER_SYNC_URL or RENDER_WORKER_URL before running render sync.',
    };
  } else {
    try {
      const response = await fetch(request.worker_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.render_request),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && trimString(body.render_status).toLowerCase() === 'success') {
        renderResult = {
          render_status: 'success',
          output_video_url: trimString(body.output_video_url),
          cover_image_url: trimString(body.cover_image_url || fallbackCoverImageUrl),
          duration_seconds: Number(body.duration_seconds ?? 0),
          resolution: trimString(body.resolution),
          render_log: trimString(body.render_log),
          error_message: '',
        };
      } else {
        const serializedBody = Object.keys(asObject(body)).length ? JSON.stringify(body) : '';
        renderResult = {
          render_status: 'failed',
          output_video_url: '',
          cover_image_url: trimString(body.cover_image_url || fallbackCoverImageUrl),
          duration_seconds: Number(body.duration_seconds ?? fallbackDurationSeconds),
          resolution: trimString(body.resolution || fallbackResolution),
          render_log: trimString(body.render_log),
          error_message: trimString(body.error_message || body.message || serializedBody || `Render worker request failed (${response.status}).`),
        };
      }
    } catch (error) {
      const errorMessage = [
        String(error?.message || error || 'unknown error').trim(),
        String(error?.cause?.message || '').trim(),
      ].filter(Boolean).join(' | ');
      renderResult = {
        render_status: 'failed',
        output_video_url: '',
        cover_image_url: fallbackCoverImageUrl,
        duration_seconds: fallbackDurationSeconds,
        resolution: fallbackResolution,
        render_log: '',
        error_message: `Render worker request failed before response: ${errorMessage}`,
      };
    }
  }

  const isSuccess = renderResult.render_status === 'success';
  await withTransaction(pool, async (client) => {
    await client.query(
      `update renders
      set render_status = $2,
          output_video_url = nullif($3, ''),
          cover_image_url = coalesce(nullif($4, ''), cover_image_url),
          duration_seconds = $5,
          resolution = nullif($6, ''),
          render_log = nullif($7, ''),
          completed_at = now()
      where content_id = $1`,
      [
        contentId,
        isSuccess ? 'success' : 'failed',
        renderResult.output_video_url,
        renderResult.cover_image_url,
        Number(renderResult.duration_seconds || 0),
        renderResult.resolution,
        renderResult.render_log || renderResult.error_message,
      ],
    );
    await client.query(
      `update content_items
      set status = $2,
          updated_at = now()
      where content_id = $1`,
      [contentId, isSuccess ? 'render_complete' : 'render_failed'],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_remotion_render',
      runStatus: isSuccess ? 'success' : 'failed',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      errorMessage: renderResult.error_message || null,
      details: {
        render_sync: {
          render_status: isSuccess ? 'success' : 'failed',
          request_id: request.request_id,
          output_video_url: renderResult.output_video_url,
          cover_image_url: renderResult.cover_image_url,
          duration_seconds: Number(renderResult.duration_seconds || 0),
          resolution: renderResult.resolution,
          error_message: renderResult.error_message,
        },
      },
    });
  });

  if (!isSuccess) {
    fail(renderResult.error_message || 'Render worker failed.');
  }

  return {
    content_id: contentId,
    status_after_success: 'render_complete',
    render_status: 'success',
    output_video_url: renderResult.output_video_url,
    duration_seconds: Number(renderResult.duration_seconds || 0),
  };
}

function extractHashtags(value) {
  const seen = new Set();
  const matches = String(value || '').match(/#[A-Za-z0-9_]+/g) ?? [];
  return matches
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function stripHashtags(value) {
  return String(value || '')
    .split(/\n/)
    .map((line) => line.replace(/(?:^|\s)#[A-Za-z0-9_]+/g, '').trimEnd())
    .filter((line) => line.trim())
    .join('\n')
    .trim();
}

function hashtagsForCategory(category) {
  const normalizedCategory = trimString(category || 'general').toLowerCase();
  const hashtagMap = {
    ai: '#AIExplained #LLM #ArtificialIntelligence #MachineLearning #TechEducation #HowAIWorks',
    artificial: '#ArtificialIntelligence #AIExplained #MachineLearning #LLM #TechEducation #FutureTech',
    technology: '#TechEducation #AIExplained #FutureTech #MachineLearning #DigitalLearning #Innovation',
    education: '#LearnOnInstagram #EducationalReels #TechEducation #ExplainedSimply #KnowledgeShare #CuriousMinds',
    science: '#science #facts #discovery #educational #learnsomethingnew #explained',
    history: '#history #historical #worldhistory #historyfacts #ancienthistory #truestory',
    mystery: '#mystery #unsolved #truemystery #unexplained #creepy #truecrime',
    'true crime': '#truecrime #crimestory #coldcase #truecrimeaddict #crimepodcast #realstory',
    crime: '#crime #truecrime #crimestory #coldcase #realstory #truestory',
    war: '#war #military #history #warhistory #historicalfacts #truestory',
    culture: '#culture #history #worldhistory #traditions #heritage #truestory',
  };
  const matchedKey = Object.keys(hashtagMap).find((key) => normalizedCategory.includes(key));
  return matchedKey
    ? hashtagMap[matchedKey]
    : '#ExplainedSimply #LearnOnInstagram #EducationalReels #CuriousMinds #KnowledgeShare #Reels';
}

function formatCaption({ title, category, selectedHook, captionDraft, ctaLine }) {
  const captionParts = [];
  if (captionDraft) captionParts.push(captionDraft);
  if (ctaLine) captionParts.push(ctaLine);
  const rawCaptionFinal = captionParts.join('\n\n') || selectedHook || title;
  const extractedHashtags = extractHashtags(rawCaptionFinal);
  const captionFinal = stripHashtags(rawCaptionFinal) || selectedHook || title;
  return {
    caption_final: captionFinal,
    hashtags_final: extractedHashtags.length ? extractedHashtags.join(' ') : hashtagsForCategory(category),
    selection_rationale: extractedHashtags.length
      ? 'Assembled from research caption_draft and split embedded hashtags into hashtags_final'
      : 'Assembled from research caption_draft and selected category fallback hashtags',
    cost: { type: 'none', provider: 'none', total_usd: 0 },
  };
}

async function runCaptionAndHashtags({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.status,
        s.selected_hook,
        s.narration_script,
        s.caption_draft,
        s.cta_line,
        coalesce(p.publish_status, 'draft') as existing_publish_status
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      left join publishes p on p.content_id = ci.content_id and p.platform = 'instagram'
      where ci.content_id = $1
        and ci.status = 'render_complete'
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No render_complete content item is ready for caption generation: ${contentId}.`);
    }
    return result.rows[0];
  });
  const selectedHook = trimString(row.selected_hook);
  const narrationScript = trimString(row.narration_script);
  if (!selectedHook) fail('Caption generation requires selected_hook.');
  if (!narrationScript) fail('Caption generation requires narration_script.');
  const caption = formatCaption({
    title: trimString(row.title),
    category: trimString(row.category),
    selectedHook,
    captionDraft: trimString(row.caption_draft),
    ctaLine: trimString(row.cta_line),
  });

  await withTransaction(pool, async (client) => {
    await client.query(
      `insert into publishes (
        content_id,
        platform,
        publish_status,
        caption_final,
        hashtags_final
      ) values ($1,'instagram','draft',$2,$3)
      on conflict (content_id) do update set
        platform = 'instagram',
        publish_status = case
          when publishes.publish_status = 'published' then publishes.publish_status
          else 'draft'
        end,
        caption_final = excluded.caption_final,
        hashtags_final = excluded.hashtags_final`,
      [contentId, caption.caption_final, caption.hashtags_final],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_caption_and_hashtags',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        generation_model: '',
        selection_rationale: caption.selection_rationale,
        caption_iteration: {
          provider: 'none',
          assembled_from_draft: true,
          output: {
            caption_final: caption.caption_final,
            hashtags_final: caption.hashtags_final,
          },
        },
        cost: caption.cost,
      },
    });
  });

  return {
    content_id: contentId,
    publish_status_after_success: 'draft',
    caption_final: caption.caption_final,
    hashtags_final: caption.hashtags_final,
    cost: caption.cost,
  };
}

async function runFinalQaApprovalGate({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.reel_type,
        ci.target_duration_seconds,
        ci.source_payload_json,
        ci.status as content_status,
        coalesce(s.raw_response_json, '{}'::jsonb) as raw_response_json,
        coalesce(s.selected_hook, '') as selected_hook,
        coalesce(s.narration_script, '') as narration_script,
        sb.storyboard_json,
        coalesce(d.director_json, '{}'::jsonb) as director_json,
        r.render_id,
        r.render_status,
        coalesce(r.output_video_url, '') as output_video_url,
        coalesce(r.cover_image_url, '') as cover_image_url,
        r.duration_seconds as render_duration_seconds,
        coalesce(r.resolution, '') as render_resolution,
        coalesce(r.aspect_ratio, '') as render_aspect_ratio,
        coalesce(r.render_log, '') as render_log,
        coalesce(p.caption_final, '') as caption_final,
        coalesce(p.hashtags_final, '') as hashtags_final,
        coalesce(p.publish_status, '') as publish_status,
        coalesce(cac.account_context_key, '') as account_context_key,
        coalesce(cac.context_snapshot_json, '{}'::jsonb) as client_account_context,
        coalesce(generated_assets.assets_json, '[]'::jsonb) as generated_assets_json,
        coalesce(narration_assets.assets_json, '[]'::jsonb) as narration_assets_json
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      join storyboards sb on sb.content_id = ci.content_id
      join renders r on r.content_id = ci.content_id
      join publishes p on p.content_id = ci.content_id and p.platform = 'instagram'
      left join directors d on d.content_id = ci.content_id
      left join content_account_contexts cac on cac.content_id = ci.content_id
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'asset_id', a.asset_id,
          'scene_number', a.scene_number,
          'asset_role', a.asset_role,
          'provider', a.provider,
          'storage_url', a.storage_url,
          'duration_seconds', a.duration_seconds,
          'status', a.status,
          'metadata_json', a.metadata_json
        ) order by a.scene_number, a.asset_role) as assets_json
        from assets a
        where a.content_id = ci.content_id
          and a.asset_role in ('scene_image', 'scene_video')
      ) generated_assets on true
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'asset_id', a.asset_id,
          'scene_number', a.scene_number,
          'asset_role', a.asset_role,
          'provider', a.provider,
          'storage_url', a.storage_url,
          'duration_seconds', a.duration_seconds,
          'status', a.status,
          'metadata_json', a.metadata_json
        ) order by a.scene_number) as assets_json
        from assets a
        where a.content_id = ci.content_id
          and a.asset_role = 'scene_narration'
      ) narration_assets on true
      where ci.content_id = $1
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) fail(`No rendered package exists for final QA gate: ${contentId}.`);
    return result.rows[0];
  });

  if (trimString(row.content_status) !== 'render_complete') fail(`Final QA gate requires content status render_complete, got ${row.content_status || '<empty>'}.`);
  if (trimString(row.render_status) !== 'success') fail(`Final QA gate requires render_status success, got ${row.render_status || '<empty>'}.`);
  if (!trimString(row.output_video_url)) fail('Final QA gate requires output_video_url.');
  if (!trimString(row.caption_final)) fail('Final QA gate requires caption_final.');

  const rawResponseJson = asObject(row.raw_response_json);
  const directorJson = asObject(row.director_json);
  const clientContext = asObject(row.client_account_context);
  const platformAccountId = trimString(
    process.env.INSTAGRAM_IG_USER_ID
    || process.env.INSTAGRAM_TARGET_IG_USER_ID
    || clientContext?.publishing_policy?.platform_account_id
    || clientContext?.platform_account?.platform_account_id,
  );
  const platformAccountUsername = trimString(
    process.env.INSTAGRAM_USERNAME
    || clientContext?.publishing_policy?.platform_account_username
    || clientContext?.platform_account?.platform_account_username
    || clientContext?.platform_account?.username,
  );
  const captionPublishJson = {
    publish_status: trimString(row.publish_status),
    caption_final: trimString(row.caption_final),
    hashtags_final: trimString(row.hashtags_final),
  };
  const renderResultJson = {
    render_id: trimString(row.render_id),
    render_status: trimString(row.render_status),
    output_video_url: trimString(row.output_video_url),
    cover_image_url: trimString(row.cover_image_url),
    duration_seconds: Number(row.render_duration_seconds || 0),
    resolution: trimString(row.render_resolution),
    aspect_ratio: trimString(row.render_aspect_ratio),
    render_log: trimString(row.render_log).slice(0, 2000),
  };
  const platformPublishContextJson = {
    platform: 'instagram',
    account_context_key: trimString(row.account_context_key),
    platform_account_id: platformAccountId,
    platform_account_username: platformAccountUsername,
    human_approval_required: true,
    output_video_url_present: Boolean(trimString(row.output_video_url)),
  };
  const qaInvocation = await invokeStructuredTextStage('final_qa_validator', {
    content_id: contentId,
    title: trimString(row.title),
    target_duration_seconds: Number(row.target_duration_seconds || 45),
    package_type: 'instagram_reel',
    status_after_success: 'awaiting_approval',
    prompt_template_data: {
      title: trimString(row.title),
      category: trimString(row.category || 'general') || 'general',
      package_type: 'instagram_reel',
      selected_style_pack: selectedStylePackFrom(row, directorJson),
      director_contract_json: stringifyPromptJson(directorJson),
      storyboard_plan_json: stringifyPromptJson(asArray(row.storyboard_json), []),
      visual_prompt_plan_json: stringifyPromptJson(rawResponseJson.visual_prompt_plan_json || {}),
      voice_performance_json: stringifyPromptJson(rawResponseJson.voice_performance_json || {}),
      music_sfx_plan_json: stringifyPromptJson(buildMusicSfxContext(rawResponseJson, directorJson, asArray(row.storyboard_json))),
      generated_assets_json: stringifyPromptJson(asArray(row.generated_assets_json), []),
      narration_assets_json: stringifyPromptJson(asArray(row.narration_assets_json), []),
      render_result_json: stringifyPromptJson(renderResultJson),
      caption_publish_json: stringifyPromptJson(captionPublishJson),
      avatar_consent_context_json: stringifyPromptJson({
        reel_type: trimString(row.reel_type || 'video'),
        avatar_mode: trimString(asObject(row.source_payload_json)?.avatar_mode || clientContext?.avatar_policy?.default_avatar_mode),
        consent_required: clientContext?.avatar_policy?.requires_consent !== false,
        avatar_decision: asObject(rawResponseJson.avatar_decision_json),
        actual_route: trimString(rawResponseJson.avatar_route_result?.actual_route),
        requested_reel_type: trimString(rawResponseJson.avatar_route_result?.requested_reel_type),
        effective_reel_type: trimString(rawResponseJson.avatar_route_result?.effective_reel_type || row.reel_type || 'video'),
        avatar_fallback_reason: trimString(rawResponseJson.avatar_route_result?.avatar_fallback_reason),
        disclosure_required: rawResponseJson.avatar_route_result?.disclosure_required === true
          || rawResponseJson.avatar_decision_json?.disclosure_required === true
          || rawResponseJson.avatar_decision_json?.selected_route?.disclosure_required === true,
        disclosure_text: trimString(
          rawResponseJson.avatar_route_result?.disclosure_text
          || rawResponseJson.avatar_decision_json?.selected_route?.disclosure_text
          || rawResponseJson.avatar_decision_json?.presenter_profile?.disclosure_policy?.disclosure_text,
        ),
      }),
      platform_publish_context_json: stringifyPromptJson(platformPublishContextJson),
      client_account_context: clientContext,
    },
  });
  const qaResult = asObject(qaInvocation.final_qa_response);
  if (Object.keys(qaResult).length === 0) {
    fail('final_qa_validator returned an empty QA result.');
  }

  const publishDecision = trimString(qaResult.publish_decision || 'blocked');
  const blocksPublish = qaResult.summary?.blocks_publish === true
    || qaResult.publish_requirements?.blocks_publish === true
    || publishDecision === 'blocked';
  const qaStatus = blocksPublish
    ? 'failed'
    : (publishDecision === 'approved' ? 'passed' : 'needs_review');
  const approvalStatus = qaStatus === 'passed'
    ? 'pending'
    : (qaStatus === 'needs_review' ? 'pending_review' : 'blocked');
  const approvalNote = trimString(
    qaResult.final_recommendation
    || qaResult.summary?.notes
    || (blocksPublish ? 'Final QA blocked publish.' : 'Awaiting Studio approval.'),
  ).slice(0, 1000);

  await withTransaction(pool, async (client) => {
    if (platformAccountId) {
      await client.query(
        `insert into publish_approvals (
          content_id,
          platform,
          platform_account_id,
          platform_account_username,
          package_type,
          selected_video_id,
          selected_asset_id,
          qa_status,
          qa_result_json,
          approval_status,
          approval_note,
          updated_at
        ) values ($1,'instagram',$2,nullif($3,''),'instagram_reel',$4,null,$5,$6::jsonb,$7,$8,now())
        on conflict (content_id, platform, package_type) do update set
          platform_account_id = excluded.platform_account_id,
          platform_account_username = excluded.platform_account_username,
          selected_video_id = excluded.selected_video_id,
          selected_asset_id = excluded.selected_asset_id,
          qa_status = excluded.qa_status,
          qa_result_json = excluded.qa_result_json,
          approval_status = case
            when publish_approvals.approval_status = 'approved'
              and publish_approvals.selected_video_id = excluded.selected_video_id
              and excluded.qa_status = 'passed'
              then publish_approvals.approval_status
            else excluded.approval_status
          end,
          approved_by = case
            when publish_approvals.approval_status = 'approved'
              and publish_approvals.selected_video_id = excluded.selected_video_id
              and excluded.qa_status = 'passed'
              then publish_approvals.approved_by
            else null
          end,
          approved_at = case
            when publish_approvals.approval_status = 'approved'
              and publish_approvals.selected_video_id = excluded.selected_video_id
              and excluded.qa_status = 'passed'
              then publish_approvals.approved_at
            else null
          end,
          approval_note = case
            when publish_approvals.approval_status = 'approved'
              and publish_approvals.selected_video_id = excluded.selected_video_id
              and excluded.qa_status = 'passed'
              then publish_approvals.approval_note
            else excluded.approval_note
          end,
          updated_at = now()`,
        [
          contentId,
          platformAccountId,
          platformAccountUsername,
          row.render_id,
          qaStatus,
          JSON.stringify(qaResult),
          approvalStatus,
          approvalNote,
        ],
      );
    }
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'final_qa_validator',
      runStatus: blocksPublish ? 'failed' : 'success',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      errorMessage: blocksPublish ? approvalNote : null,
      details: {
        qa_result: qaResult,
        generation_provider: trimString(qaInvocation.generation_provider),
        generation_model: trimString(qaInvocation.generation_model),
        cost: qaInvocation.cost ?? {},
        approval_record: platformAccountId ? approvalStatus : 'not_created_missing_platform_account_id',
        selected_video_id: row.render_id,
      },
    });
  });

  if (blocksPublish) {
    fail(approvalNote || 'Final QA blocked publish.');
  }

  return {
    content_id: contentId,
    pipeline_status_after_success: 'awaiting_approval',
    content_status_after_success: 'render_complete',
    qa_status: qaStatus,
    approval_status: platformAccountId ? approvalStatus : 'not_created_missing_platform_account_id',
    selected_video_id: row.render_id,
  };
}

function joinGuidanceList(values = []) {
  return compactStrings(values).join('\n');
}

async function runPerformanceFeedbackAnalysis({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const data = await withTransaction(pool, async (client) => {
    const targetResult = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.reel_type,
        ci.status,
        ci.target_duration_seconds,
        ci.source_payload_json,
        coalesce(s.selected_hook, '') as selected_hook,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(p.caption_final, '') as caption_final,
        coalesce(p.hashtags_final, '') as hashtags_final,
        coalesce(r.duration_seconds, 0) as render_duration_seconds,
        coalesce(d.director_json, '{}'::jsonb) as director_json,
        cac.account_context_id,
        coalesce(cac.account_context_key, '') as account_context_key,
        coalesce(cac.context_snapshot_json, cc.context_json, ci.source_payload_json->'client_account_context', '{}'::jsonb) as client_account_context,
        coalesce(cc.context_json->'performance_guidance', '{}'::jsonb) as existing_performance_guidance
      from content_items ci
      left join scripts s on s.content_id = ci.content_id
      left join publishes p on p.content_id = ci.content_id and p.platform = 'instagram'
      left join renders r on r.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      left join content_account_contexts cac on cac.content_id = ci.content_id
      left join client_account_contexts cc on cc.account_context_id = cac.account_context_id
      where ci.content_id = $1`,
      [contentId],
    );
    if (targetResult.rowCount === 0) {
      fail(`No content item exists for performance feedback analysis: ${contentId}.`);
    }
    const target = targetResult.rows[0];
    const accountContextKey = trimString(target.account_context_key);
    const insightsResult = await client.query(
      `select
        i.snapshot_id,
        i.content_id,
        ci.title,
        ci.category,
        ci.reel_type,
        coalesce(s.selected_hook, '') as selected_hook,
        coalesce(p.caption_final, '') as caption_final,
        i.platform,
        i.snapshot_window,
        i.views,
        i.plays,
        i.reach,
        i.likes,
        i.comments,
        i.shares,
        i.saves,
        i.engagement_rate,
        i.completion_rate,
        i.raw_payload_json,
        i.snapshot_taken_at
      from insight_snapshots i
      join content_items ci on ci.content_id = i.content_id
      left join content_account_contexts cac on cac.content_id = ci.content_id
      left join scripts s on s.content_id = ci.content_id
      left join publishes p on p.content_id = ci.content_id and p.platform = i.platform
      where i.platform = 'instagram'
        and (
          i.content_id = $1
          or ($2 <> '' and cac.account_context_key = $2)
        )
      order by i.snapshot_taken_at desc
      limit 30`,
      [contentId, accountContextKey],
    );
    const reviewResult = await client.query(
      `select
        pr.content_id,
        ci.title,
        pr.review_summary,
        pr.what_worked,
        pr.what_failed,
        pr.hook_analysis,
        pr.category_analysis,
        pr.visual_analysis,
        pr.next_recommendation,
        pr.review_generated_at
      from performance_reviews pr
      join content_items ci on ci.content_id = pr.content_id
      left join content_account_contexts cac on cac.content_id = ci.content_id
      where pr.content_id = $1
        or ($2 <> '' and cac.account_context_key = $2)
      order by pr.review_generated_at desc
      limit 10`,
      [contentId, accountContextKey],
    );
    return {
      target,
      insights: insightsResult.rows,
      priorReviews: reviewResult.rows,
    };
  });

  if (data.insights.length === 0) {
    fail(`No Instagram insight snapshots are available for performance feedback analysis: ${contentId}.`);
  }

  const target = data.target;
  const targetContentJson = {
    content_id: trimString(target.content_id),
    title: trimString(target.title),
    category: trimString(target.category),
    reel_type: trimString(target.reel_type),
    status: trimString(target.status),
    target_duration_seconds: Number(target.target_duration_seconds || 0),
    selected_hook: trimString(target.selected_hook),
    narration_script_excerpt: trimString(target.narration_script).slice(0, 1200),
    caption_final: trimString(target.caption_final),
    hashtags_final: trimString(target.hashtags_final),
    render_duration_seconds: Number(target.render_duration_seconds || 0),
    director_contract: asObject(target.director_json),
  };
  const accountContextKey = trimString(target.account_context_key) || 'default';
  const feedbackInvocation = await invokeStructuredTextStage('performance_feedback_analysis', {
    content_id: contentId,
    title: trimString(target.title),
    account_context_key: accountContextKey,
    platform: 'instagram',
    status_after_success: 'performance_feedback_updated',
    prompt_template_data: {
      account_context_key: accountContextKey,
      platform: 'instagram',
      analysis_window: `Latest ${data.insights.length} Instagram insight snapshot(s) available in the database.`,
      account_context_json: stringifyPromptJson(asObject(target.client_account_context)),
      target_content_json: stringifyPromptJson(targetContentJson),
      recent_insights_json: stringifyPromptJson(data.insights, []),
      prior_performance_reviews_json: stringifyPromptJson(data.priorReviews, []),
      existing_performance_guidance_json: stringifyPromptJson(asObject(target.existing_performance_guidance)),
    },
  });
  const feedback = asObject(feedbackInvocation.performance_feedback_response);
  if (Object.keys(feedback).length === 0) {
    fail('performance_feedback_analysis returned an empty guidance object.');
  }

  await withTransaction(pool, async (client) => {
    await client.query(
      `insert into performance_reviews (
        content_id,
        review_summary,
        what_worked,
        what_failed,
        hook_analysis,
        category_analysis,
        visual_analysis,
        next_recommendation,
        review_generated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,now())
      on conflict (content_id) do update set
        review_summary = excluded.review_summary,
        what_worked = excluded.what_worked,
        what_failed = excluded.what_failed,
        hook_analysis = excluded.hook_analysis,
        category_analysis = excluded.category_analysis,
        visual_analysis = excluded.visual_analysis,
        next_recommendation = excluded.next_recommendation,
        review_generated_at = now()`,
      [
        contentId,
        trimString(feedback.summary),
        joinGuidanceList(feedback.winning_patterns),
        joinGuidanceList(feedback.weak_patterns),
        trimString(feedback.hook_guidance),
        trimString(feedback.generation_guidance),
        trimString(feedback.visual_guidance),
        [
          trimString(feedback.voice_guidance),
          trimString(feedback.caption_guidance),
          compactStrings(feedback.avoid_repeating).length
            ? `Avoid repeating:\n${joinGuidanceList(feedback.avoid_repeating)}`
            : '',
        ].filter(Boolean).join('\n\n'),
      ],
    );
    if (target.account_context_id) {
      await client.query(
        `update client_account_contexts
        set context_json = jsonb_set(context_json, '{performance_guidance}', $2::jsonb, true),
            updated_at = now()
        where account_context_id = $1`,
        [target.account_context_id, JSON.stringify(feedback)],
      );
    }
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'performance_feedback_analysis',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        generation_provider: trimString(feedbackInvocation.generation_provider),
        generation_model: trimString(feedbackInvocation.generation_model),
        account_context_key: accountContextKey,
        updated_account_context: Boolean(target.account_context_id),
        insight_snapshot_count: data.insights.length,
        confidence: trimString(feedback.confidence),
        cost: feedbackInvocation.cost ?? {},
      },
    });
  });

  return {
    content_id: contentId,
    status_after_success: 'performance_feedback_updated',
    account_context_key: accountContextKey,
    updated_account_context: Boolean(target.account_context_id),
    insight_snapshot_count: data.insights.length,
    confidence: trimString(feedback.confidence),
  };
}

function isLocalOnlyAssetHost(assetUrl) {
  const match = trimString(assetUrl).match(/^https?:\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/i);
  const host = trimString(match?.[1]).toLowerCase();
  const privateIpv4 = /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  return !host
    || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|minio|host\.docker\.internal)$/i.test(host)
    || host === '::1'
    || host.endsWith('.local')
    || privateIpv4;
}

async function graphRequest({ method = 'GET', path: graphPath, token, qs, body }) {
  const graphApiVersion = trimString(process.env.GRAPH_API_VERSION || 'v25.0');
  const url = new URL(`https://graph.facebook.com/${graphApiVersion}/${graphPath}`);
  for (const [key, value] of Object.entries(qs ?? {})) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = await response.json().catch(() => ({}));
  return {
    ok: response.ok && !responseBody.error,
    status: response.status,
    body: responseBody,
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runInstagramReelPublish({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `with candidate_data as materialized (
        select
          ci.content_id,
          ci.title,
          ci.status as content_status,
          p.publish_status as previous_publish_status,
          p.caption_final,
          p.hashtags_final,
          p.scheduled_for,
          p.instagram_media_id as existing_instagram_media_id,
          p.instagram_container_id as existing_instagram_container_id,
          p.published_at as existing_published_at,
          r.render_id as selected_video_id,
          r.output_video_url,
          r.cover_image_url,
          r.duration_seconds,
          r.resolution,
          r.render_status,
          pa.approval_id,
          pa.platform as approval_platform,
          pa.platform_account_id as approval_platform_account_id,
          coalesce(pa.platform_account_username, '') as approval_platform_account_username,
          pa.approval_status,
          pa.qa_status,
          coalesce(pa.approved_by, '') as approved_by,
          pa.approved_at,
          coalesce(cac.account_context_key, '') as account_context_key,
          coalesce(cac.context_snapshot_json, '{}'::jsonb) as client_account_context
        from content_items ci
        left join content_account_contexts cac on cac.content_id = ci.content_id
        join publishes p on p.content_id = ci.content_id
        join renders r on r.content_id = ci.content_id
        join publish_approvals pa on pa.content_id = ci.content_id
          and pa.platform = 'instagram'
          and pa.package_type = 'instagram_reel'
          and pa.approval_status = 'approved'
          and pa.qa_status = 'passed'
          and pa.selected_video_id = r.render_id
          and coalesce(nullif(btrim(pa.approved_by), ''), '') <> ''
          and pa.approved_at is not null
          and coalesce(nullif(btrim(pa.platform_account_id), ''), '') <> ''
          and (
            coalesce(nullif(btrim(cac.context_snapshot_json->'publishing_policy'->>'platform_account_id'), ''), '') = ''
            or cac.context_snapshot_json->'publishing_policy'->>'platform_account_id' = pa.platform_account_id
          )
        where ci.content_id = $1
          and p.platform = 'instagram'
          and p.publish_status in ('draft', 'failed')
          and ci.status = 'render_complete'
          and r.render_status = 'success'
          and coalesce(nullif(btrim(r.output_video_url), ''), '') <> ''
          and (p.scheduled_for is null or p.scheduled_for <= now())
          and p.published_at is null
          and coalesce(nullif(btrim(p.instagram_media_id), ''), '') = ''
        limit 1
      ), claim as (
        update publishes p
        set publish_status = 'publishing',
            publish_error = null
        where p.content_id = (select content_id from candidate_data)
          and p.platform = 'instagram'
          and p.publish_status in ('draft', 'failed')
          and p.published_at is null
          and coalesce(nullif(btrim(p.instagram_media_id), ''), '') = ''
        returning p.content_id, p.publish_status
      )
      select c.*, cl.publish_status
      from candidate_data c
      join claim cl on cl.content_id = c.content_id`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No approved Reel publish candidate is ready for ${contentId}.`);
    }
    return result.rows[0];
  });

  const errors = [];
  const rootAccessToken = trimString(process.env.INSTAGRAM_GRAPH_API_TOKEN);
  const publishEnabled = trimString(process.env.INSTAGRAM_PUBLISH_ENABLED || 'false').toLowerCase() === 'true';
  const preferredPageId = trimString(process.env.INSTAGRAM_TARGET_PAGE_ID);
  const preferredIgUserId = trimString(process.env.INSTAGRAM_IG_USER_ID);
  const assetUrl = trimString(row.output_video_url);
  const captionFinal = trimString(row.caption_final);
  const hashtagsFinal = trimString(row.hashtags_final);
  const composedCaption = [captionFinal, hashtagsFinal].filter(Boolean).join('\n\n').trim();
  const approvalPlatformAccountId = trimString(row.approval_platform_account_id);
  const clientAccountContext = asObject(row.client_account_context);
  const expectedContextPlatformAccountId = trimString(
    clientAccountContext?.publishing_policy?.platform_account_id
    || clientAccountContext?.platform_account?.platform_account_id,
  );

  if (trimString(row.content_status) !== 'render_complete') errors.push('Content status must be render_complete before Reel publish.');
  if (trimString(row.render_status) !== 'success') errors.push('Render status must be success before Reel publish.');
  if (!captionFinal) errors.push('caption_final is empty.');
  if (!assetUrl || !/^https?:\/\//i.test(assetUrl) || isLocalOnlyAssetHost(assetUrl)) errors.push('output_video_url must be a public http(s) MP4 URL.');
  if (!/\.mp4(?:[?#].*)?$/i.test(assetUrl)) errors.push('The Reel asset must resolve to a public MP4 delivery URL.');
  if (!publishEnabled) errors.push('INSTAGRAM_PUBLISH_ENABLED is not true.');
  if (!rootAccessToken) errors.push('INSTAGRAM_GRAPH_API_TOKEN is empty.');
  if (preferredIgUserId && approvalPlatformAccountId && approvalPlatformAccountId !== preferredIgUserId) {
    errors.push(`Approval account ${approvalPlatformAccountId} does not match INSTAGRAM_IG_USER_ID ${preferredIgUserId}.`);
  }
  if (expectedContextPlatformAccountId && approvalPlatformAccountId !== expectedContextPlatformAccountId) {
    errors.push(`Approval account ${approvalPlatformAccountId} does not match client/account context publish account ${expectedContextPlatformAccountId}.`);
  }

  const details = {
    checked_at: new Date().toISOString(),
    publish_enabled: publishEnabled,
    content_id: contentId,
    approval_id: row.approval_id,
    approval_platform_account_id: approvalPlatformAccountId,
    asset: {
      url: assetUrl,
      mime_type: 'video/mp4',
      duration_seconds: Number(row.duration_seconds ?? 0) || null,
      resolution: trimString(row.resolution) || null,
      cover_image_url: trimString(row.cover_image_url) || null,
    },
    caption_preview: composedCaption.slice(0, 500),
  };

  let publishResult = {
    run_status: 'failed',
    publish_status_after_run: 'failed',
    error_message: errors.join(' | '),
    instagram_media_id: '',
    instagram_container_id: '',
    details_json: { ...details, validation_errors: errors },
  };

  if (errors.length === 0) {
    const pagesResponse = await graphRequest({
      path: 'me/accounts',
      token: rootAccessToken,
      qs: { fields: 'id,name' },
    });
    details.page_lookup = {
      http_status: pagesResponse.status,
      page_count: Array.isArray(pagesResponse.body?.data) ? pagesResponse.body.data.length : 0,
    };
    if (!pagesResponse.ok) {
      publishResult.error_message = `/me/accounts failed: ${pagesResponse.body?.error?.message ?? 'unknown error'}`;
      publishResult.details_json = { ...details, page_lookup: { ...details.page_lookup, body: pagesResponse.body } };
    } else {
      const pages = Array.isArray(pagesResponse.body?.data) ? pagesResponse.body.data : [];
      const selectedPage = preferredPageId ? pages.find((page) => String(page.id) === preferredPageId) : pages[0];
      if (!selectedPage) {
        publishResult.error_message = preferredPageId
          ? `INSTAGRAM_TARGET_PAGE_ID=${preferredPageId} was not returned by /me/accounts.`
          : 'No linked Facebook Pages were returned by /me/accounts.';
        publishResult.details_json = { ...details, linked_pages: pages };
      } else {
        details.selected_page = { id: selectedPage.id, name: selectedPage.name };
        const pageDetailsResponse = await graphRequest({
          path: String(selectedPage.id),
          token: rootAccessToken,
          qs: { fields: 'id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}' },
        });
        if (!pageDetailsResponse.ok) {
          publishResult.error_message = `Page metadata lookup failed: ${pageDetailsResponse.body?.error?.message ?? 'unknown error'}`;
          publishResult.details_json = { ...details, page_details_lookup: { http_status: pageDetailsResponse.status, body: pageDetailsResponse.body } };
        } else {
          const pageDetails = pageDetailsResponse.body ?? {};
          const discoveredIgAccount = pageDetails.instagram_business_account ?? pageDetails.connected_instagram_account ?? null;
          const selectedIgAccount = preferredIgUserId
            ? (discoveredIgAccount && String(discoveredIgAccount.id) === preferredIgUserId ? discoveredIgAccount : null)
            : discoveredIgAccount;
          if (!selectedIgAccount) {
            publishResult.error_message = preferredIgUserId
              ? `INSTAGRAM_IG_USER_ID=${preferredIgUserId} was not returned for the selected Page.`
              : 'No Instagram professional account was returned for the selected Page.';
            publishResult.details_json = { ...details, page_details_lookup: { http_status: pageDetailsResponse.status } };
          } else if (approvalPlatformAccountId !== String(selectedIgAccount.id)) {
            publishResult.error_message = `Approval account ${approvalPlatformAccountId} does not match selected Instagram account ${selectedIgAccount.id}.`;
            publishResult.details_json = details;
          } else {
            const pageAccessToken = trimString(pageDetails.access_token) || rootAccessToken;
            const limitResponse = await graphRequest({
              path: `${selectedIgAccount.id}/content_publishing_limit`,
              token: pageAccessToken,
            });
            details.content_publishing_limit = {
              http_status: limitResponse.status,
              quota_usage: Number(limitResponse.body?.data?.[0]?.quota_usage ?? 0),
            };
            if (!limitResponse.ok) {
              publishResult.error_message = `content_publishing_limit failed: ${limitResponse.body?.error?.message ?? 'unknown error'}`;
              publishResult.details_json = { ...details, content_publishing_limit: { ...details.content_publishing_limit, body: limitResponse.body } };
            } else if (details.content_publishing_limit.quota_usage >= 100) {
              publishResult.error_message = `The account has already reached ${details.content_publishing_limit.quota_usage} API-published posts in the current 24-hour window.`;
              publishResult.details_json = details;
            } else {
              const containerResponse = await graphRequest({
                method: 'POST',
                path: `${selectedIgAccount.id}/media`,
                token: pageAccessToken,
                body: {
                  media_type: 'REELS',
                  video_url: assetUrl,
                  caption: composedCaption,
                  share_to_feed: true,
                },
              });
              details.container_create = { http_status: containerResponse.status, body: containerResponse.body };
              if (!containerResponse.ok || !containerResponse.body?.id) {
                publishResult.instagram_container_id = trimString(containerResponse.body?.id);
                publishResult.error_message = `Reel container creation failed: ${containerResponse.body?.error?.message ?? 'unknown error'}`;
                publishResult.details_json = details;
              } else {
                const containerId = trimString(containerResponse.body.id);
                let finalContainerStatus = '';
                const statusChecks = [];
                for (let attempt = 1; attempt <= 18; attempt += 1) {
                  const statusResponse = await graphRequest({
                    path: containerId,
                    token: pageAccessToken,
                    qs: { fields: 'status_code' },
                  });
                  const statusCode = trimString(statusResponse.body?.status_code).toUpperCase();
                  statusChecks.push({ attempt, http_status: statusResponse.status, status_code: statusCode || null, body: statusResponse.body });
                  if (!statusResponse.ok) {
                    publishResult.instagram_container_id = containerId;
                    publishResult.error_message = `Container status polling failed: ${statusResponse.body?.error?.message ?? 'unknown error'}`;
                    publishResult.details_json = { ...details, container_status_checks: statusChecks };
                    break;
                  }
                  finalContainerStatus = statusCode;
                  if (statusCode === 'FINISHED' || statusCode === 'ERROR' || statusCode === 'EXPIRED') break;
                  await sleep(5000);
                }
                details.container_status_checks = statusChecks;
                if (!publishResult.error_message) {
                  if (finalContainerStatus !== 'FINISHED') {
                    publishResult.instagram_container_id = containerId;
                    publishResult.error_message = `Container ${containerId} did not reach FINISHED status. Last status: ${finalContainerStatus || 'unknown'}.`;
                    publishResult.details_json = details;
                  } else {
                    const publishResponse = await graphRequest({
                      method: 'POST',
                      path: `${selectedIgAccount.id}/media_publish`,
                      token: pageAccessToken,
                      body: { creation_id: containerId },
                    });
                    details.publish_response = { http_status: publishResponse.status, body: publishResponse.body };
                    if (!publishResponse.ok || !publishResponse.body?.id) {
                      publishResult.instagram_container_id = containerId;
                      publishResult.error_message = `media_publish failed: ${publishResponse.body?.error?.message ?? 'unknown error'}`;
                      publishResult.details_json = details;
                    } else {
                      publishResult = {
                        run_status: 'success',
                        publish_status_after_run: 'published',
                        error_message: '',
                        instagram_media_id: trimString(publishResponse.body.id),
                        instagram_container_id: containerId,
                        details_json: details,
                      };
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  await withTransaction(pool, async (client) => {
    await client.query(
      `insert into publishes (
        content_id,
        platform,
        publish_status,
        caption_final,
        hashtags_final,
        instagram_media_id,
        instagram_container_id,
        published_at,
        publish_error
      ) values ($1,'instagram',$2,$3,$4,nullif($5,''),nullif($6,''),case when $2 = 'published' then now() else null end,nullif($7,''))
      on conflict (content_id) do update set
        publish_status = excluded.publish_status,
        caption_final = excluded.caption_final,
        hashtags_final = excluded.hashtags_final,
        instagram_media_id = excluded.instagram_media_id,
        instagram_container_id = excluded.instagram_container_id,
        published_at = excluded.published_at,
        publish_error = excluded.publish_error`,
      [
        contentId,
        publishResult.publish_status_after_run,
        captionFinal,
        hashtagsFinal,
        publishResult.instagram_media_id,
        publishResult.instagram_container_id,
        publishResult.error_message,
      ],
    );
    if (publishResult.run_status === 'success') {
      await client.query(
        `update content_items
        set status = 'published',
            published_at = now(),
            updated_at = now()
        where content_id = $1`,
        [contentId],
      );
    }
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_instagram_reel_publish',
      runStatus: publishResult.run_status,
      startedAt,
      durationMs: durationMsFrom(startedAt),
      errorMessage: publishResult.error_message || null,
      details: publishResult.details_json,
    });
  });

  if (publishResult.run_status !== 'success') {
    fail(publishResult.error_message || 'Instagram Reel publish failed.');
  }
  return {
    content_id: contentId,
    publish_status_after_success: 'published',
    instagram_media_id: publishResult.instagram_media_id,
    instagram_container_id: publishResult.instagram_container_id,
  };
}

const STAGE_HANDLERS = Object.freeze({
  story_package_generation: runStoryPackageGeneration,
  story_package_quality_gate: runStoryPackageQualityGate,
  director_contract: runDirectorContract,
  visual_prompt_builder: runVisualPromptBuilder,
  image_asset_generation: runImageAssetGeneration,
  asset_generation_v3: runAssetGenerationV3,
  voice_performance_script: runVoicePerformanceScript,
  narration_generation: runNarrationGeneration,
  avatar_presenter_selector: runAvatarPresenterSelector,
  avatar_media_generation: runAvatarMediaGeneration,
  avatar_consent_gate: runAvatarConsentGate,
  heygen_avatar_generation: runHeygenAvatarGeneration,
  remotion_manifest: runRenderManifestConstruction,
  render_manifest_construction: runRenderManifestConstruction,
  remotion_render: runRenderSyncCompletion,
  render_sync_completion: runRenderSyncCompletion,
  caption_and_hashtags: runCaptionAndHashtags,
  final_qa_approval_gate: runFinalQaApprovalGate,
  instagram_reel_publish: runInstagramReelPublish,
  performance_feedback_analysis: runPerformanceFeedbackAnalysis,
});

export const __avatarRuntimeTestHooks = Object.freeze({
  getHeygenConfig,
  avatarDecisionWantsProviderCall,
  avatarFallbackReason,
  sanitizeHeygenRequestOptions,
  buildHeygenRequestBody,
  sanitizeGeneratedAssetPrompt,
  buildAssetGenerationPayload,
});

export async function executePipelineStage(stageKey, context) {
  const handler = STAGE_HANDLERS[stageKey];
  if (!handler) {
    fail(`No code-first pipeline handler exists for stage '${stageKey}'.`);
  }
  return handler(context);
}
