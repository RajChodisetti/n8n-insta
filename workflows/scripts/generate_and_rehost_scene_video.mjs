#!/usr/bin/env node

import crypto from 'node:crypto';
import { uploadBinaryAsset } from './asset_host_adapters.mjs';
import { firstEnv, selectVideoApiKey } from './adapter_config.mjs';
import { computeVideoCost } from './cost_calculator.mjs';
import { getNoVisibleTextNegativePrompt } from './prompt_hard_rules.mjs';

function fail(message) {
  throw new Error(message);
}

function decodePayload() {
  const encoded = String(process.argv[2] || '').trim();
  if (!encoded) fail('Missing base64 payload argument.');
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch (e) {
    fail(`Could not decode workflow payload: ${e.message}`);
  }
}

function ensureString(name, value) {
  const v = String(value ?? '').trim();
  if (!v) fail(`${name} is required.`);
  return v;
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

const DEFAULT_FAL_VEO_VIDEO_MODEL = 'fal-ai/veo3.1/fast';

function normalizeFalVeoModel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    !normalized
    || normalized === 'veo'
    || normalized === 'veo-latest'
    || normalized === 'veo-3.1'
    || normalized === 'veo-3.1-latest'
    || normalized === 'fal-ai/wan-t2v'
    || normalized === 'wan-t2v'
    || normalized === 'seedance'
    || normalized === 'seedance-2'
    || normalized === 'seedance-2.0'
    || normalized === 'seedance-2.0-text-to-video'
    || normalized === 'bytedance/seedance'
    || normalized.startsWith('bytedance/seedance-2.0')
  ) {
    return DEFAULT_FAL_VEO_VIDEO_MODEL;
  }
  if (normalized === 'veo-3.1-fast' || normalized === 'veo-fast' || normalized === 'fal-ai/veo3.1/fast') {
    return 'fal-ai/veo3.1/fast';
  }
  if (normalized === 'veo-3.1-lite' || normalized === 'veo-lite' || normalized === 'fal-ai/veo3.1/lite') {
    return 'fal-ai/veo3.1/lite';
  }
  if (normalized.endsWith('/image-to-video')) {
    return normalized.replace(/\/image-to-video$/, '');
  }
  return normalized;
}

function isFalVeoModel(value) {
  return String(value || '').trim().toLowerCase().startsWith('fal-ai/veo3.1');
}

function normalizeWanModel(value) {
  const normalized = normalizeFalVeoModel(value);
  if (isFalVeoModel(normalized)) return normalized;
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

function normalizeFalVeoResolution(value, model = '') {
  const normalized = String(value || '720p').trim().toLowerCase();
  const allowed = String(model || '').includes('/lite')
    ? new Set(['720p', '1080p'])
    : new Set(['720p', '1080p', '4k']);
  return allowed.has(normalized) ? normalized : '720p';
}

function nearestFalVeoDurationSeconds(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 8;
  return [4, 6, 8].reduce((best, current) => (
    Math.abs(current - parsed) < Math.abs(best - parsed) ? current : best
  ), 8);
}

function parseEnvBoolean(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function objectKeyForSceneVideo(contentId, title, sceneNumber) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const prefix = String(process.env.REELS_STORAGE_KEY_PREFIX || 'generated/instagram-posts')
    .trim().replace(/^\/+|\/+$/g, '');
  const titleSlug = slugify(title, 'story');
  const sceneStr = `scene-${String(sceneNumber).padStart(2, '0')}`;
  return `${prefix}/scene-videos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${contentId}-${sceneStr}-${titleSlug}.mp4`;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function downloadVideoFromUrl(videoUrl, label) {
  const dlResponse = await fetch(videoUrl);
  if (!dlResponse.ok) fail(`${label} download failed (${dlResponse.status}): ${videoUrl}`);
  const binary = Buffer.from(await dlResponse.arrayBuffer());
  if (!binary.length) fail(`${label} download returned empty payload.`);
  return binary;
}

async function fetchQueuedFalVideoResult({ apiKey, model, body, label }) {
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
    fail(`${label} generation failed (${response.status}): ${errMsg}`);
  }

  const requestId = String(responseBody.request_id || '').trim();
  const statusUrl = String(responseBody.status_url || '').trim();
  const responseUrl = String(responseBody.response_url || '').trim();
  if (!requestId || !statusUrl) {
    fail(`${label} generation did not return queue metadata. Response: ${JSON.stringify(responseBody).slice(0, 500)}`);
  }

  const deadline = Date.now() + (12 * 60 * 1000);
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`${statusUrl}${statusUrl.includes('?') ? '&' : '?'}logs=1`, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    const statusBody = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      fail(`${label} status check failed (${statusResponse.status}): ${JSON.stringify(statusBody).slice(0, 500)}`);
    }

    const status = String(statusBody.status || '').trim().toUpperCase();
    if (status === 'COMPLETED') {
      const resultResponse = await fetch(responseUrl || `${queueEndpoint}/requests/${encodeURIComponent(requestId)}`, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      const finalResult = await resultResponse.json().catch(() => ({}));
      if (!resultResponse.ok) {
        fail(`${label} result fetch failed (${resultResponse.status}): ${JSON.stringify(finalResult).slice(0, 500)}`);
      }
      return finalResult;
    }

    if (status && status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') {
      fail(`${label} entered unexpected status '${status}'. Body: ${JSON.stringify(statusBody).slice(0, 500)}`);
    }
    await sleep(4000);
  }

  fail(`${label} generation timed out after waiting for request ${requestId}.`);
}

async function generateFalVeoVideo(prompt, scene, requestedModel) {
  const apiKey = ensureString('SCENE_VIDEO_FAL_AI_API_KEY or FAL_AI_API_KEY', selectVideoApiKey('scene_video', 'fal_ai'));
  const model = normalizeFalVeoModel(requestedModel);
  const resolution = normalizeFalVeoResolution(firstEnv(['VEO_VIDEO_RESOLUTION', 'WAN_VIDEO_RESOLUTION']) || '720p', model);
  const durationSeconds = nearestFalVeoDurationSeconds(firstEnv(['VEO_VIDEO_DURATION_SECONDS']) || scene?.duration_seconds);
  const promptLimit = Number.parseInt(String(firstEnv(['VEO_PROMPT_MAX_CHARS']) || '5000'), 10) || 5000;
  const seed = Number.parseInt(String(firstEnv(['VEO_SEED']) || '').trim(), 10);
  const body = {
    prompt: prompt.length > promptLimit ? prompt.slice(0, promptLimit) : prompt,
    negative_prompt: `${getNoVisibleTextNegativePrompt()}, blurry, low quality, distorted faces, deformed`.slice(0, 500),
    duration: `${durationSeconds}s`,
    aspect_ratio: '9:16',
    resolution,
    generate_audio: parseEnvBoolean(firstEnv(['VEO_GENERATE_AUDIO']), false),
    auto_fix: parseEnvBoolean(firstEnv(['VEO_AUTO_FIX']), true),
    safety_tolerance: String(firstEnv(['VEO_SAFETY_TOLERANCE']) || '4').trim() || '4',
  };
  if (Number.isInteger(seed)) {
    body.seed = seed;
  }

  const finalResult = await fetchQueuedFalVideoResult({
    apiKey,
    model,
    body,
    label: 'Fal Veo video',
  });
  const videoUrl = finalResult?.video?.url || finalResult?.videos?.[0]?.url;
  if (!videoUrl) {
    fail(`Fal Veo video generation returned no video URL. Response: ${JSON.stringify(finalResult).slice(0, 500)}`);
  }

  const binary = await downloadVideoFromUrl(videoUrl, 'Fal Veo video');
  const actualDuration = Number(finalResult?.video?.duration || durationSeconds);
  return {
    provider: 'fal_ai_veo',
    model,
    binary,
    estimatedDuration: Number.isFinite(actualDuration) && actualDuration > 0 ? actualDuration : durationSeconds,
    sha256: sha256Hex(binary),
    seed: finalResult?.seed ?? seed ?? null,
    actualPrompt: finalResult?.actual_prompt ?? null,
  };
}

async function generateWanVideo(prompt, scene) {
  const model = normalizeWanModel(firstEnv(['VEO_VIDEO_MODEL', 'WAN_VIDEO_MODEL']) || DEFAULT_FAL_VEO_VIDEO_MODEL);
  if (isFalVeoModel(model)) {
    return generateFalVeoVideo(prompt, scene, model);
  }

  const apiKey = ensureString('SCENE_VIDEO_FAL_AI_API_KEY or FAL_AI_API_KEY', selectVideoApiKey('scene_video', 'fal_ai'));
  const numFrames = Number.parseInt(String(firstEnv(['WAN_VIDEO_NUM_FRAMES']) || '81'), 10);
  const frameRate = Number.parseInt(String(firstEnv(['WAN_VIDEO_FRAME_RATE']) || '16'), 10);
  const resolution = String(firstEnv(['WAN_VIDEO_RESOLUTION']) || '720p').trim();

  const negativePrompt = `${getNoVisibleTextNegativePrompt()}, blurry, low quality, distorted faces, deformed`;

  const body = {
    prompt: prompt.length > 2000 ? prompt.slice(0, 2000) : prompt,
    negative_prompt: negativePrompt,
    num_frames: Number.isFinite(numFrames) ? Math.max(25, Math.min(121, numFrames)) : 81,
    frames_per_second: Number.isFinite(frameRate) ? Math.max(5, Math.min(24, frameRate)) : 16,
    resolution,
    aspect_ratio: '9:16',
    num_inference_steps: Number.parseInt(String(firstEnv(['WAN_VIDEO_INFERENCE_STEPS']) || '30'), 10) || 30,
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

  const binary = await downloadVideoFromUrl(videoUrl, 'Wan video');

  const estimatedDuration = (numFrames / Math.max(frameRate, 1));

  return {
    provider: 'fal_ai_wan',
    model,
    binary,
    estimatedDuration,
    sha256: sha256Hex(binary),
  };
}

async function main() {
  const payload = decodePayload();
  const contentId = ensureString('content_id', payload.content_id);
  const title = ensureString('title', payload.title);
  const workflowName = String(payload.workflow_name || 'wf_scene_video_generation').trim();
  const scenes = Array.isArray(payload.storyboard_json) ? payload.storyboard_json : [];

  if (scenes.length === 0) fail('storyboard_json is required and must have at least one scene.');

  const sceneResults = [];

  for (const scene of scenes) {
    const sceneNumber = Number(scene.scene_number ?? 0);

    // Scene 1 is always a face image — skip video generation for it
    if (scene.is_face_image === true || sceneNumber === 1 || String(scene.asset_type || '').trim().toLowerCase() === 'image') {
      continue;
    }

    const visualPrompt = String(scene.visual_prompt || '').trim();
    const narrationText = String(scene.narration_text || '').trim();
    const mood = String(scene.mood || '').trim();

    if (!visualPrompt) fail(`Scene ${sceneNumber} has no visual_prompt for video generation.`);

    // Build a rich video generation prompt from storyboard data
    const videoPrompt = [
      visualPrompt,
      mood ? `Mood: ${mood}.` : '',
      narrationText ? `The scene shows: ${narrationText.slice(0, 200)}` : '',
      'Cinematic vertical video, 9:16 aspect ratio. Absolutely no readable text, no subtitles, no captions, no title cards, no logos, no signs, no labels, no UI, no watermarks. The renderer adds the 2-second opening title card later.',
    ].filter(Boolean).join(' ');

    const generation = await generateWanVideo(videoPrompt, scene);

    const objectKey = objectKeyForSceneVideo(contentId, title, sceneNumber);
    const storage = await uploadBinaryAsset('scene_video', generation.binary, {
      objectKey,
      contentType: 'video/mp4',
      fileName: objectKey.split('/').pop() || `scene-${sceneNumber}.mp4`,
    });

    sceneResults.push({
      scene_number: sceneNumber,
      asset_role: 'scene_video',
      provider: `${slugId(generation.provider, 'fal_ai_video')}_${slugId(generation.model, 'video')}_rehosted_mp4_${slugId(storage.mode, 'host')}`,
      source_url: storage.url,
      storage_url: storage.url,
      mime_type: 'video/mp4',
      duration_seconds: generation.estimatedDuration,
      metadata_json: {
        scene_number: sceneNumber,
        provider: generation.provider,
        generation_model: generation.model,
        asset_host_provider: storage.mode,
        workflow_name: workflowName,
        visual_prompt: visualPrompt,
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
  }

  const generationModel = normalizeWanModel(firstEnv(['VEO_VIDEO_MODEL', 'WAN_VIDEO_MODEL']) || DEFAULT_FAL_VEO_VIDEO_MODEL);
  const generationProvider = isFalVeoModel(generationModel) ? 'fal_ai_veo' : 'fal_ai_wan';
  const totalDurationSeconds = sceneResults.reduce(
    (sum, scene) => sum + (Number.isFinite(Number(scene.duration_seconds)) ? Number(scene.duration_seconds) : 0),
    0,
  );

  process.stdout.write(JSON.stringify({
    content_id: contentId,
    title,
    workflow_name: workflowName,
    run_started_at: String(payload.run_started_at || new Date().toISOString()),
    status_after_success: 'assets_ready',
    scene_assets: sceneResults,
    scene_count: sceneResults.length,
    generation_provider: generationProvider,
    generation_model: generationModel,
    rehost_provider: sceneResults[0]?.metadata_json?.asset_host_provider ?? '',
    cost: computeVideoCost(generationProvider, generationModel, {
      video_count: sceneResults.length,
      total_duration_seconds: totalDurationSeconds,
    }),
  }));
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
