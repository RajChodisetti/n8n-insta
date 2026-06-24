#!/usr/bin/env node

import crypto from 'node:crypto';
import { uploadBinaryAsset } from './asset_host_adapters.mjs';
import { selectVideoApiKey } from './adapter_config.mjs';
import { computeVideoCost } from './cost_calculator.mjs';

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

async function generateWanVideo(prompt, scene) {
  const apiKey = ensureString('SCENE_VIDEO_FAL_AI_API_KEY or FAL_AI_API_KEY', selectVideoApiKey('scene_video', 'fal_ai'));
  const model = normalizeWanModel(process.env.WAN_VIDEO_MODEL || 'fal-ai/wan-t2v');
  const numFrames = Number.parseInt(String(process.env.WAN_VIDEO_NUM_FRAMES || '81'), 10);
  const frameRate = Number.parseInt(String(process.env.WAN_VIDEO_FRAME_RATE || '16'), 10);
  const resolution = String(process.env.WAN_VIDEO_RESOLUTION || '720p').trim();

  const negativePrompt = 'text, words, letters, captions, subtitles, watermark, logo, speech bubble, dialogue bubble, comic text, writing, typography, readable characters, signage, label, blurry, low quality, distorted faces, deformed';

  const body = {
    prompt: prompt.length > 2000 ? prompt.slice(0, 2000) : prompt,
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

  const dlResponse = await fetch(videoUrl);
  if (!dlResponse.ok) fail(`Wan video download failed (${dlResponse.status}): ${videoUrl}`);
  const binary = Buffer.from(await dlResponse.arrayBuffer());
  if (!binary.length) fail('Wan video download returned empty payload.');

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
      'Cinematic vertical video, 9:16 aspect ratio, no text or subtitles, no logos.',
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
      provider: `fal_ai_wan_${slugId(generation.model, 'wan')}_rehosted_mp4_${slugId(storage.mode, 'host')}`,
      source_url: storage.url,
      storage_url: storage.url,
      mime_type: 'video/mp4',
      duration_seconds: generation.estimatedDuration,
      metadata_json: {
        scene_number: sceneNumber,
        provider: 'fal_ai_wan',
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

  const generationModel = normalizeWanModel(process.env.WAN_VIDEO_MODEL || 'fal-ai/wan-t2v');
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
    generation_provider: 'fal_ai_wan',
    generation_model: generationModel,
    rehost_provider: sceneResults[0]?.metadata_json?.asset_host_provider ?? '',
    cost: computeVideoCost('fal_ai_wan', generationModel, {
      video_count: sceneResults.length,
      total_duration_seconds: totalDurationSeconds,
    }),
  }));
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
