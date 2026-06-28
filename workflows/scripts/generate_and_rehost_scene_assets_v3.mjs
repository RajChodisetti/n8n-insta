#!/usr/bin/env node

/**
 * generate_and_rehost_scene_assets_v3.mjs
 *
 * Combined v3 asset generator:
 *   - Scenes with asset_plan.mode=image/image_with_motion: still image via the existing image pipeline
 *   - Scenes with asset_plan.mode=video: Wan text-to-video/reference-to-video
 *   - Scenes marked with includes_primary_character=true can switch to
 *     Wan reference-to-video when a character reference image is available
 *   - Billing/quota/provider-availability video failures fall back to images for
 *     the failed scene and remaining video scenes so Remotion can animate them.
 *
 * Returns a unified scene_assets array with both image and video entries.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { loadRenderedPromptAsset } from './prompt_utils.mjs';
import { generateImageAsset } from './image_generation_adapters.mjs';
import { uploadBinaryAsset } from './asset_host_adapters.mjs';
import { selectVideoApiKey } from './adapter_config.mjs';
import { getNoVisibleTextNegativePrompt, getSceneImageRelevanceGuard, getSceneImageTextGuard } from './prompt_hard_rules.mjs';
import { resolveStagePromptTemplateData } from './prompt_stage_defaults.mjs';
import { computeImageCost, computeVideoCost } from './cost_calculator.mjs';

function fail(message) {
  throw new Error(message);
}

function decodePayload() {
  const payloadFileIndex = process.argv.indexOf('--payload-file');
  if (payloadFileIndex >= 0) {
    const payloadFile = String(process.argv[payloadFileIndex + 1] || '').trim();
    if (!payloadFile) fail('Missing value for --payload-file.');
    try {
      return JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
    } catch (error) {
      fail(`Could not read workflow payload file: ${error.message}`);
    }
  }
  const encoded = String(process.argv[2] || '').trim();
  if (!encoded) fail('Missing base64 payload argument.');
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch (error) {
    fail(`Could not decode workflow payload: ${error.message}`);
  }
}

function ensureString(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) fail(`${name} is required.`);
  return normalized;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function parseDimensions(size) {
  const match = String(size || '').trim().match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!match) return { width: 1024, height: 1536 };
  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
  };
}

function slugify(value, fallback) {
  return String(value || fallback || 'scene')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback || 'scene';
}

function slugId(value, fallback) {
  return String(value || fallback || 'adapter')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback || 'adapter';
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function trimString(value) {
  return String(value ?? '').trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleVariants(title) {
  const normalizedTitle = trimString(title);
  if (!normalizedTitle) return [];
  return [...new Set([
    normalizedTitle,
    normalizedTitle.replace(/[“”"]/g, '').trim(),
    normalizedTitle.split(/[—–-]/)[0]?.trim(),
  ].filter((value) => trimString(value).length >= 8))];
}

function wordCount(value) {
  return trimString(value).split(/\s+/).filter(Boolean).length;
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

function normalizeAssetPlan(scene = {}) {
  const raw = plainObject(scene.asset_plan);
  const rawMode = String(raw.mode || scene.asset_type || '').trim().toLowerCase();
  const mode = rawMode === 'video'
    ? 'video'
    : (rawMode === 'image' ? 'image' : 'image_with_motion');
  return {
    ...raw,
    mode,
    provider_intent: mode === 'video' ? 'provider_video' : (mode === 'image' ? 'static_image' : 'remotion_motion'),
    motion_requirement: ['low', 'medium', 'high'].includes(String(raw.motion_requirement || '').trim().toLowerCase())
      ? String(raw.motion_requirement).trim().toLowerCase()
      : 'medium',
    video_generation_required: mode === 'video',
    fallback_mode: 'image_with_motion',
  };
}

function shouldFallbackVideoToImage(error, { strictVideoAssets = false } = {}) {
  if (strictVideoAssets || String(process.env.DISABLE_VIDEO_TO_IMAGE_FALLBACK || '').trim().toLowerCase() === 'true') {
    return false;
  }
  const message = String(error?.message || error || '').toLowerCase();
  return /\b(exhausted|balance|top up|billing|quota|credit|payment|required|api key|not configured|locked|unauthorized|forbidden|403|401)\b/.test(message);
}

function compactErrorMessage(error) {
  return String(error?.message || error || 'unknown provider failure')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function normalizeWanModel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'fal-ai/wan-t2v';
  if (
    normalized === 'fal-ai/wan/v2.5/t2v/1.3b'
    || normalized === 'fal-ai/wan/v2.1/t2v/14b'
    || normalized === 'fal-ai/wan-2.1-t2v-14b'
    || normalized === 'wan-2.1-t2v-14b'
    || normalized === 'wan-t2v'
  ) {
    return 'fal-ai/wan-t2v';
  }
  return normalized;
}

function normalizeWanReferenceModel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'fal-ai/wan/v2.7/reference-to-video';
  if (
    normalized === 'fal-ai/wan/reference-to-video'
    || normalized === 'wan-reference-to-video'
    || normalized === 'reference-to-video'
  ) {
    return 'fal-ai/wan/v2.7/reference-to-video';
  }
  return normalized;
}

function normalizeCharacterReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const storageUrl = String(value.storage_url || value.source_url || '').trim();
  if (!storageUrl) {
    return null;
  }
  return {
    role: 'primary_character',
    character_name: String(value.character_name || '').trim(),
    character_description: String(value.character_description || '').trim(),
    storage_url: storageUrl,
    mime_type: String(value.mime_type || '').trim().toLowerCase(),
  };
}

function clampSceneVideoDurationSeconds(value, fallback = 5) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(2, Math.min(10, Math.round(fallback)));
  }
  return Math.max(2, Math.min(10, Math.round(parsed)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildWanNegativePrompt() {
  return `${getNoVisibleTextNegativePrompt()}, blurry, low quality, distorted faces, deformed`;
}

function buildCharacterContinuityHint(characterReference) {
  if (!characterReference) {
    return '';
  }
  const characterIdentity = [
    characterReference.character_name ? `Character identity: ${characterReference.character_name}.` : '',
    characterReference.character_description ? `Reference details: ${characterReference.character_description}.` : '',
    'Keep the same recurring character identity, face or head design, age cues, body proportions, color palette, and signature outfit or exterior design as the provided reference image.',
  ].filter(Boolean).join(' ');
  return characterIdentity;
}

function roundUsd(value) {
  return Number(Number(value || 0).toFixed(6));
}

async function downloadBinaryFromUrl(fileUrl, label) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    fail(`${label} download failed (${response.status}): ${fileUrl}`);
  }
  const binary = Buffer.from(await response.arrayBuffer());
  if (!binary.length) {
    fail(`${label} download returned empty payload.`);
  }
  return binary;
}

// ---------------------------------------------------------------------------
// Image helpers (scene 1 / face image)
// ---------------------------------------------------------------------------

function objectKeyForScene(contentId, title, sceneNumber) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const prefix = String(process.env.REELS_STORAGE_KEY_PREFIX || 'generated/instagram-posts')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const titleSlug = slugify(title, 'story');
  const sceneSlug = `scene-${String(sceneNumber).padStart(2, '0')}`;
  return `${prefix}/scene-assets/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${contentId}-${sceneSlug}-${titleSlug}.jpg`;
}

function fileNameFromObjectKey(objectKey) {
  const parts = String(objectKey || '').split('/');
  return parts[parts.length - 1] || 'scene-image.jpg';
}

function describeHostProvider(provider) {
  if (provider === 'google_cloud_storage') return 'Google Cloud Storage';
  if (provider === 'object_storage') return 'object storage';
  return provider;
}

function buildSceneImageMetadata(storage, scene, generation, title, workflowName, options = {}) {
  const request = generation.request ?? {};
  const metadata = {
    provider: generation.provider,
    generation_provider: generation.provider,
    asset_host_provider: storage.mode,
    workflow_name: workflowName,
    generation_model: String(request.model || ''),
    title,
    scene_number: Number(scene.scene_number),
    duration_seconds: Number(scene.duration_seconds),
    narration_text: String(scene.narration_text || ''),
    mood: String(scene.mood || ''),
    transition: String(scene.transition || ''),
    visual_prompt: String(scene.visual_prompt || ''),
    requested_asset_type: String(scene.asset_type || ''),
    asset_plan: normalizeAssetPlan(scene),
    remotion: plainObject(scene.remotion ?? scene.remotion_guidance),
    fallback_from_video: options.fallbackFromVideo === true,
    fallback_reason: options.fallbackReason ? String(options.fallbackReason) : '',
    image_prompt: String(request.prompt || ''),
    revised_prompt: generation.revisedPrompt ?? null,
    output_format: 'jpeg',
    output_compression: Number(request.output_compression ?? 90),
    quality: String(request.quality || ''),
    size: String(request.size || ''),
    source_type: `${generation.provider}_binary_rehosted`,
    rehost_provider: storage.mode,
    image_sha256: sha256Hex(generation.binary),
    generated_at: new Date().toISOString(),
    asset_validation_note: `Generated the scene creative with ${generation.provider}, uploaded the JPEG to ${describeHostProvider(storage.mode)}, and persisted the public delivery URL.`,
  };

  if (storage.mode === 'google_cloud_storage') {
    metadata.google_cloud_storage = {
      bucket: storage.bucket,
      endpoint: storage.endpoint,
      public_base_url: storage.publicBaseUrl,
      region: storage.region,
      object_key: storage.objectKey,
      size: storage.size,
    };
  } else {
    metadata.storage_bucket = storage.bucket;
    metadata.storage_endpoint = storage.endpoint;
    metadata.storage_public_base_url = storage.publicBaseUrl;
    metadata.storage_region = storage.region;
    metadata.storage_object_key = storage.objectKey;
  }

  return metadata;
}

function buildProviderId(generationProvider, model, hostProvider) {
  return `${slugId(generationProvider, 'provider')}_${slugId(model, 'model')}_rehosted_jpeg_${slugId(hostProvider, 'host')}`;
}

const GENERIC_SCENE_PROMPT_PATTERNS = [
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

function ensureScenePromptSpecificity(scene) {
  const sceneNumber = Number(scene?.scene_number ?? 0);
  const visualPrompt = trimString(scene?.visual_prompt);
  const narrationText = trimString(scene?.narration_text);
  const visualWordCount = visualPrompt.split(/\s+/).filter(Boolean).length;

  if (!narrationText) {
    fail(`Scene ${sceneNumber || '<unknown>'} is missing narration_text, so the image prompt cannot be verified against the narrated beat.`);
  }

  if (visualWordCount < 12) {
    fail(`Scene ${sceneNumber || '<unknown>'} visual_prompt is too vague. It must be specific enough to name the subject, action, and setting.`);
  }

  if (GENERIC_SCENE_PROMPT_PATTERNS.some((pattern) => pattern.test(visualPrompt))) {
    fail(`Scene ${sceneNumber || '<unknown>'} visual_prompt is too generic for production. Replace mood-board wording with a concrete subject, action, and setting.`);
  }
}

async function generateSceneImage(scene, payload, imageRequest, title, category, selectedHook, narrationScriptExcerpt, styleNotes, directorGlobalVisualStyle, directorAvoidRules, workflowName) {
  const sceneNumber = Number(scene.scene_number);
  const sanitizedScene = {
    ...scene,
    visual_prompt: sanitizeGeneratedAssetPrompt(scene.visual_prompt, {
      title,
      narrationText: scene.narration_text,
      sceneNumber,
    }),
    image_prompt: trimString(scene.image_prompt)
      ? sanitizeGeneratedAssetPrompt(scene.image_prompt, {
        title,
        narrationText: scene.narration_text,
        sceneNumber,
      })
      : '',
    fallback_prompt: trimString(scene.fallback_prompt)
      ? sanitizeGeneratedAssetPrompt(scene.fallback_prompt, {
        title,
        narrationText: scene.narration_text,
        sceneNumber,
      })
      : '',
  };
  ensureScenePromptSpecificity(sanitizedScene);

  const basePrompt = trimString(sanitizedScene.image_prompt) || await loadRenderedPromptAsset(
    'scene_asset_generation/prompt.md',
    resolveStagePromptTemplateData('scene_asset_generation', {
      prompt_profile: payload.prompt_profile ?? {},
      title,
      category,
      scene_number: String(sceneNumber),
      selected_hook: selectedHook,
      narration_text: trimString(sanitizedScene.narration_text),
      visual_prompt: trimString(sanitizedScene.visual_prompt),
      mood: trimString(sanitizedScene.mood),
      transition: trimString(sanitizedScene.transition),
      narration_script_excerpt: narrationScriptExcerpt,
      style_notes: styleNotes,
      director_global_visual_style: directorGlobalVisualStyle,
      director_avoid_rules: directorAvoidRules,
      scene_duration_seconds: String(scene.duration_seconds ?? ''),
    }),
  );

  const prompt = [
    ensureString(`scene ${sceneNumber} base prompt`, basePrompt),
    getSceneImageRelevanceGuard(sanitizedScene),
    getSceneImageTextGuard(sceneNumber),
  ].join('\n').trim();

  return generateImageAsset('scene_image', prompt, imageRequest, workflowName);
}

// ---------------------------------------------------------------------------
// Video helpers (scenes 2+)
// ---------------------------------------------------------------------------

function objectKeyForSceneVideo(contentId, title, sceneNumber) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const prefix = String(process.env.REELS_STORAGE_KEY_PREFIX || 'generated/instagram-posts')
    .trim().replace(/^\/+|\/+$/g, '');
  const titleSlug = slugify(title, 'story');
  const sceneStr = `scene-${String(sceneNumber).padStart(2, '0')}`;
  return `${prefix}/scene-videos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${contentId}-${sceneStr}-${titleSlug}.mp4`;
}

async function generateWanVideo(videoPrompt) {
  const apiKey = ensureString('SCENE_VIDEO_FAL_AI_API_KEY or FAL_AI_API_KEY', selectVideoApiKey('scene_video', 'fal_ai'));
  const model = normalizeWanModel(process.env.WAN_VIDEO_MODEL || 'fal-ai/wan-t2v');
  const numFrames = Number.parseInt(String(process.env.WAN_VIDEO_NUM_FRAMES || '81'), 10);
  const frameRate = Number.parseInt(String(process.env.WAN_VIDEO_FRAME_RATE || '16'), 10);
  const resolution = String(process.env.WAN_VIDEO_RESOLUTION || '720p').trim();

  const negativePrompt = buildWanNegativePrompt();

  const body = {
    prompt: videoPrompt.length > 2000 ? videoPrompt.slice(0, 2000) : videoPrompt,
    negative_prompt: negativePrompt,
    num_frames: Number.isFinite(numFrames) ? Math.max(25, Math.min(121, numFrames)) : 81,
    frames_per_second: Number.isFinite(frameRate) ? Math.max(5, Math.min(24, frameRate)) : 16,
    resolution,
    aspect_ratio: '9:16',
    num_inference_steps: Number.parseInt(String(process.env.WAN_VIDEO_INFERENCE_STEPS || '30'), 10) || 30,
    enable_safety_checker: true,
    enable_prompt_expansion: false,
  };

  const endpoint = `https://fal.run/${model}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok || responseBody.detail) {
    const errMsg = Array.isArray(responseBody.detail)
      ? responseBody.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
      : (responseBody.detail || responseBody.message || 'unknown error');
    fail(`Wan video generation failed (${response.status}): ${errMsg}`);
  }

  const videoUrl = responseBody?.video?.url || responseBody?.videos?.[0]?.url;
  if (!videoUrl) {
    fail(`Wan video generation returned no video URL. Response: ${JSON.stringify(responseBody).slice(0, 500)}`);
  }

  const binary = await downloadBinaryFromUrl(videoUrl, 'Wan video');

  const estimatedDuration = numFrames / Math.max(frameRate, 1);

  return {
    provider: 'fal_ai_wan',
    model,
    binary,
    estimatedDuration,
    sha256: sha256Hex(binary),
  };
}

async function generateWanReferenceVideo(videoPrompt, scene, characterReference) {
  const apiKey = ensureString('WAN_REFERENCE_VIDEO_FAL_AI_API_KEY, SCENE_VIDEO_FAL_AI_API_KEY, or FAL_AI_API_KEY', selectVideoApiKey('wan_reference_video', 'fal_ai'));
  const model = normalizeWanReferenceModel(process.env.WAN_REFERENCE_VIDEO_MODEL || 'fal-ai/wan/v2.7/reference-to-video');
  const resolution = String(process.env.WAN_VIDEO_RESOLUTION || '720p').trim();
  const duration = clampSceneVideoDurationSeconds(scene?.duration_seconds, 5);
  const body = {
    prompt: videoPrompt.length > 5000 ? videoPrompt.slice(0, 5000) : videoPrompt,
    reference_image_urls: [characterReference.storage_url],
    negative_prompt: buildWanNegativePrompt().slice(0, 500),
    aspect_ratio: '9:16',
    resolution: resolution === '1080p' ? '1080p' : '720p',
    duration,
    multi_shots: false,
    enable_safety_checker: true,
  };

  const queueEndpoint = `https://queue.fal.run/${model}`;
  const response = await fetch(queueEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = Array.isArray(responseBody.detail)
      ? responseBody.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
      : (responseBody.detail || responseBody.message || 'unknown error');
    fail(`Wan reference video generation failed (${response.status}): ${errMsg}`);
  }

  const requestId = String(responseBody.request_id || '').trim();
  const statusUrl = String(responseBody.status_url || '').trim();
  const responseUrl = String(responseBody.response_url || '').trim();
  if (!requestId || !statusUrl) {
    fail(`Wan reference video generation did not return queue metadata. Response: ${JSON.stringify(responseBody).slice(0, 500)}`);
  }

  const deadline = Date.now() + (12 * 60 * 1000);
  let finalResult = null;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`${statusUrl}${statusUrl.includes('?') ? '&' : '?'}logs=1`, {
      headers: {
        Authorization: `Key ${apiKey}`,
      },
    });
    const statusBody = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      fail(`Wan reference video status check failed (${statusResponse.status}): ${JSON.stringify(statusBody).slice(0, 500)}`);
    }

    const status = String(statusBody.status || '').trim().toUpperCase();
    if (status === 'COMPLETED') {
      const resultResponse = await fetch(responseUrl || `${queueEndpoint}/requests/${encodeURIComponent(requestId)}`, {
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      });
      finalResult = await resultResponse.json().catch(() => ({}));
      if (!resultResponse.ok) {
        fail(`Wan reference video result fetch failed (${resultResponse.status}): ${JSON.stringify(finalResult).slice(0, 500)}`);
      }
      break;
    }

    if (status && status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') {
      fail(`Wan reference video entered unexpected status '${status}'. Body: ${JSON.stringify(statusBody).slice(0, 500)}`);
    }

    await sleep(4000);
  }

  if (!finalResult) {
    fail(`Wan reference video generation timed out after waiting for request ${requestId}.`);
  }

  const videoUrl = finalResult?.video?.url || finalResult?.videos?.[0]?.url;
  if (!videoUrl) {
    fail(`Wan reference video generation returned no video URL. Response: ${JSON.stringify(finalResult).slice(0, 500)}`);
  }

  const binary = await downloadBinaryFromUrl(videoUrl, 'Wan reference video');
  const actualDuration = Number(finalResult?.video?.duration || duration);

  return {
    provider: 'fal_ai_wan_reference',
    model,
    binary,
    estimatedDuration: Number.isFinite(actualDuration) && actualDuration > 0 ? actualDuration : duration,
    sha256: sha256Hex(binary),
    referenceImageUrl: characterReference.storage_url,
    seed: finalResult?.seed ?? null,
    actualPrompt: finalResult?.actual_prompt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const payload = decodePayload();
  const contentId = ensureString('content_id', payload.content_id);
  const title = ensureString('title', payload.title);
  const category = String(payload.category || 'general').trim() || 'general';
  const selectedHook = String(payload.selected_hook || '').trim();
  const narrationScriptExcerpt = String(payload.narration_script || '').trim().slice(0, 800);
  const styleNotes = (String(payload.style_notes || '').trim() || 'cinematic, moody, realistic, vertical-frame storytelling').slice(0, 600);
  const directorGlobalVisualStyle = String(payload.director_global_visual_style || '').trim();
  const directorAvoidRules = String(payload.director_avoid_rules || '').trim();
  const characterReference = normalizeCharacterReference(payload.character_reference);
  const workflowName = String(payload.workflow_name || 'wf_asset_generation_v3').trim() || 'wf_asset_generation_v3';
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  const imageRequest = payload.image_request ?? payload.openai_image_request ?? {};
  const strictVideoAssets = payload.strict_video_assets === true
    || (
      String(payload.reel_type || '').trim().toLowerCase() === 'video'
      && String(process.env.ALLOW_VIDEO_TO_IMAGE_FALLBACK || '').trim().toLowerCase() !== 'true'
    );

  if (scenes.length === 0) fail('No scenes were provided for scene asset generation.');

  const dimensions = parseDimensions(imageRequest.size);
  const generatedScenes = [];
  const imageUsageByKey = new Map();
  const videoUsageByKey = new Map();

  function trackImageUsage(provider, model) {
    const key = `${String(provider || '').trim()}::${String(model || '').trim()}`;
    const current = imageUsageByKey.get(key) ?? {
      provider: String(provider || '').trim(),
      model: String(model || '').trim(),
      image_count: 0,
    };
    current.image_count += 1;
    imageUsageByKey.set(key, current);
  }

  function trackVideoUsage(provider, model, durationSeconds) {
    const key = `${String(provider || '').trim()}::${String(model || '').trim()}`;
    const current = videoUsageByKey.get(key) ?? {
      provider: String(provider || '').trim(),
      model: String(model || '').trim(),
      video_count: 0,
      total_duration_seconds: 0,
    };
    current.video_count += 1;
    current.total_duration_seconds += Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : 0;
    videoUsageByKey.set(key, current);
  }

  async function generateAndStoreSceneImage(scene, { fallbackFromVideo = false, fallbackReason = '' } = {}) {
    const sceneNumber = Number(scene.scene_number);
    const sceneForImage = {
      ...scene,
      visual_prompt: sanitizeGeneratedAssetPrompt(scene.visual_prompt, {
        title,
        narrationText: scene.narration_text,
        sceneNumber,
      }),
      image_prompt: trimString(scene.image_prompt)
        ? sanitizeGeneratedAssetPrompt(scene.image_prompt, {
          title,
          narrationText: scene.narration_text,
          sceneNumber,
        })
        : '',
      fallback_prompt: trimString(scene.fallback_prompt)
        ? sanitizeGeneratedAssetPrompt(scene.fallback_prompt, {
          title,
          narrationText: scene.narration_text,
          sceneNumber,
        })
        : '',
    };
    const generation = await generateSceneImage(
      sceneForImage, payload, imageRequest, title, category, selectedHook,
      narrationScriptExcerpt, styleNotes, directorGlobalVisualStyle,
      directorAvoidRules, workflowName,
    );
    const objectKey = objectKeyForScene(contentId, title, sceneNumber);
    const storage = await uploadBinaryAsset('scene_image', generation.binary, {
      objectKey,
      contentType: 'image/jpeg',
      fileName: fileNameFromObjectKey(objectKey),
    });
    const metadata = buildSceneImageMetadata(storage, sceneForImage, generation, title, workflowName, {
      fallbackFromVideo,
      fallbackReason,
    });
    generatedScenes.push({
      scene_number: sceneNumber,
      asset_role: 'scene_image',
      provider: buildProviderId(generation.provider, generation.request?.model, storage.mode),
      source_url: storage.url,
      storage_url: storage.url,
      mime_type: 'image/jpeg',
      width: dimensions.width,
      height: dimensions.height,
      duration_seconds: Number(scene.duration_seconds),
      metadata_json: metadata,
    });
    trackImageUsage(generation.provider, generation.request?.model);
  }

  async function generateAndStoreSceneVideo(scene, assetPlan) {
    const sceneNumber = Number(scene.scene_number);
    const narrationText = trimString(scene.narration_text);
    const visualPrompt = sanitizeGeneratedAssetPrompt(scene.visual_prompt, {
      title,
      narrationText,
      sceneNumber,
    });
    const mood = String(scene.mood || '').trim();
    const includesPrimaryCharacter = scene?.includes_primary_character === true;
    const useCharacterReference = includesPrimaryCharacter && Boolean(characterReference?.storage_url);

    if (!visualPrompt) fail(`Scene ${sceneNumber} has no visual_prompt for video generation.`);

    const remotion = plainObject(scene.remotion ?? scene.remotion_guidance);
    const videoPrompt = [
      visualPrompt,
      mood ? `Mood: ${mood}.` : '',
      narrationText ? `The scene shows: ${narrationText.slice(0, 200)}` : '',
      assetPlan.motion_requirement ? `Motion requirement: ${assetPlan.motion_requirement}.` : '',
      assetPlan.video_generation_reason ? `Generate only the needed motion: ${String(assetPlan.video_generation_reason).slice(0, 280)}` : '',
      remotion.instructions ? `Camera/motion intent for this generated clip: ${String(remotion.instructions).slice(0, 280)}` : '',
      useCharacterReference ? buildCharacterContinuityHint(characterReference) : '',
      'Cinematic vertical video, 9:16 aspect ratio. Absolutely no readable text, no subtitles, no captions, no title cards, no logos, no signs, no labels, no UI, no watermarks. The renderer adds the opening title card and final pacing later.',
    ].filter(Boolean).join(' ');

    const generation = useCharacterReference
      ? await generateWanReferenceVideo(videoPrompt, scene, characterReference)
      : await generateWanVideo(videoPrompt);
    const objectKey = objectKeyForSceneVideo(contentId, title, sceneNumber);
    const storage = await uploadBinaryAsset('scene_video', generation.binary, {
      objectKey,
      contentType: 'video/mp4',
      fileName: objectKey.split('/').pop() || `scene-${sceneNumber}.mp4`,
    });

    generatedScenes.push({
      scene_number: sceneNumber,
      asset_role: 'scene_video',
      provider: `fal_ai_wan_${slugId(generation.model, 'wan')}_rehosted_mp4_${slugId(storage.mode, 'host')}`,
      source_url: storage.url,
      storage_url: storage.url,
      mime_type: 'video/mp4',
      width: 0,
      height: 0,
      duration_seconds: generation.estimatedDuration,
      metadata_json: {
        scene_number: sceneNumber,
        provider: generation.provider,
        generation_model: generation.model,
        generation_mode: useCharacterReference ? 'reference_to_video' : 'text_to_video',
        asset_host_provider: storage.mode,
        workflow_name: workflowName,
        visual_prompt: visualPrompt,
        requested_asset_type: 'video',
        asset_plan: assetPlan,
        remotion,
        mood,
        narration_text: narrationText,
        scene_includes_primary_character: includesPrimaryCharacter,
        character_reference_used: useCharacterReference,
        character_reference_url: useCharacterReference ? characterReference.storage_url : '',
        character_name: useCharacterReference ? characterReference.character_name : '',
        character_description: useCharacterReference ? characterReference.character_description : '',
        actual_prompt: generation.actualPrompt ?? null,
        generation_seed: generation.seed ?? null,
        estimated_duration_seconds: generation.estimatedDuration,
        video_sha256: generation.sha256,
        generated_at: new Date().toISOString(),
        ...(storage.mode === 'google_cloud_storage' ? {
          google_cloud_storage: {
            bucket: storage.bucket,
            endpoint: storage.endpoint,
            public_base_url: storage.publicBaseUrl,
            region: storage.region,
            object_key: storage.objectKey || objectKey,
            size: storage.size,
          },
        } : {
          storage_bucket: storage.bucket,
          storage_endpoint: storage.endpoint,
          storage_public_base_url: storage.publicBaseUrl,
          storage_object_key: storage.objectKey || objectKey,
        }),
      },
    });
    trackVideoUsage(generation.provider, generation.model, generation.estimatedDuration);
  }

  let forceImageFallbackForRemaining = false;
  let videoFallbackReason = '';
  for (const scene of scenes) {
    const sceneNumber = Number(scene.scene_number);
    if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
      fail(`Invalid scene_number: ${scene.scene_number}`);
    }

    const assetPlan = normalizeAssetPlan(scene);
    if (assetPlan.mode !== 'video' || forceImageFallbackForRemaining) {
      await generateAndStoreSceneImage(scene, {
        fallbackFromVideo: assetPlan.mode === 'video',
        fallbackReason: assetPlan.mode === 'video' ? videoFallbackReason : '',
      });
      continue;
    }

    try {
      await generateAndStoreSceneVideo(scene, assetPlan);
    } catch (error) {
      if (!shouldFallbackVideoToImage(error, { strictVideoAssets })) {
        throw error;
      }
      forceImageFallbackForRemaining = true;
      videoFallbackReason = compactErrorMessage(error);
      await generateAndStoreSceneImage(scene, {
        fallbackFromVideo: true,
        fallbackReason: videoFallbackReason,
      });
    }
  }

  const costComponents = [
    ...Array.from(imageUsageByKey.values(), (entry) => computeImageCost(entry.provider, entry.model, entry.image_count)),
    ...Array.from(videoUsageByKey.values(), (entry) => computeVideoCost(entry.provider, entry.model, entry)),
  ];
  const totalAssetCostUsd = costComponents.reduce((sum, component) => sum + Number(component.total_usd || 0), 0);
  const imageTotalUsd = costComponents
    .filter((component) => component.type === 'image')
    .reduce((sum, component) => sum + Number(component.total_usd || 0), 0);
  const videoTotalUsd = costComponents
    .filter((component) => component.type === 'video')
    .reduce((sum, component) => sum + Number(component.total_usd || 0), 0);
  const sceneImageCount = generatedScenes.filter((scene) => scene.asset_role === 'scene_image').length;
  const sceneVideoCount = generatedScenes.filter((scene) => scene.asset_role === 'scene_video').length;
  const assetCost = {
    type: 'asset_generation',
    provider: costComponents.length === 1 ? String(costComponents[0].provider || '') : 'mixed',
    model: costComponents.length === 1 ? String(costComponents[0].model || '') : 'mixed',
    scene_image_count: sceneImageCount,
    scene_video_count: sceneVideoCount,
    image_total_usd: roundUsd(imageTotalUsd),
    video_total_usd: roundUsd(videoTotalUsd),
    total_usd: roundUsd(totalAssetCostUsd),
    estimated_from_usage: true,
    priced: costComponents.length > 0 && costComponents.every((component) => component.priced === true),
    components: costComponents,
  };

  const firstImageScene = generatedScenes.find((s) => s.mime_type === 'image/jpeg');
  const firstVideoScene = generatedScenes.find((s) => s.mime_type === 'video/mp4');

  process.stdout.write(JSON.stringify({
    content_id: contentId,
    title,
    workflow_name: workflowName,
    run_started_at: String(payload.run_started_at || new Date().toISOString()).trim() || new Date().toISOString(),
    status_after_success: 'assets_ready',
    scene_assets: generatedScenes,
    scene_count: generatedScenes.length,
    generation_provider: firstVideoScene ? `${String(firstVideoScene?.metadata_json?.provider || 'fal_ai_wan')}+scene_image` : String(firstImageScene?.metadata_json?.generation_provider || ''),
    generation_model: firstVideoScene
      ? `${String(firstVideoScene?.metadata_json?.generation_model || '')}+${String(imageRequest.model || '')}`
      : String(imageRequest.model || ''),
    rehost_provider: String(firstImageScene?.metadata_json?.rehost_provider || firstVideoScene?.metadata_json?.asset_host_provider || ''),
    cost: assetCost,
  }));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
