#!/usr/bin/env node

import crypto from 'node:crypto';
import { loadRenderedPromptAsset } from './prompt_utils.mjs';
import { generateNarrationAudio } from './tts_adapters.mjs';
import { uploadBinaryAsset } from './asset_host_adapters.mjs';
import { buildSceneTimingPlan, resolveStagePromptTemplateData } from './prompt_stage_defaults.mjs';
import { computeTtsCost } from './cost_calculator.mjs';

function fail(message) {
  throw new Error(message);
}

function decodePayload() {
  const encoded = String(process.argv[2] || '').trim();
  if (!encoded) {
    fail('Missing base64 payload argument.');
  }

  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch (error) {
    fail(`Could not decode workflow payload: ${error.message}`);
  }
}

function ensureString(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    fail(`${name} is required.`);
  }
  return normalized;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function slugify(value, fallback) {
  return String(value || fallback || 'story')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback || 'story';
}

function slugId(value, fallback) {
  return String(value || fallback || 'adapter')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback || 'adapter';
}

function objectKeyForSceneNarration(contentId, title, sceneNumber, ext = 'mp3') {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const prefix = String(process.env.REELS_STORAGE_KEY_PREFIX || 'generated/instagram-posts')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const titleSlug = slugify(title, 'story');
  const sceneStr = String(sceneNumber).padStart(2, '0');
  return `${prefix}/narration/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${contentId}-${titleSlug}-scene${sceneStr}.${ext}`;
}

function fileNameFromObjectKey(objectKey) {
  const parts = String(objectKey || '').split('/');
  return parts[parts.length - 1] || 'narration.mp3';
}

function describeHostProvider(provider) {
  if (provider === 'google_cloud_storage') {
    return 'Google Cloud Storage';
  }
  if (provider === 'object_storage') {
    return 'object storage';
  }
  return provider;
}

function buildProviderId(generationProvider, model, hostProvider) {
  return `${slugId(generationProvider, 'provider')}_${slugId(model, 'model')}_rehosted_mp3_${slugId(hostProvider, 'host')}`;
}

async function main() {
  const payload = decodePayload();
  const contentId = ensureString('content_id', payload.content_id);
  const title = ensureString('title', payload.title);
  const workflowName = String(payload.workflow_name || 'wf_narration_generation').trim() || 'wf_narration_generation';
  const scenes = Array.isArray(payload.storyboard_json) ? payload.storyboard_json : [];

  if (scenes.length === 0) {
    fail('storyboard_json is required and must contain at least one scene for per-scene narration generation.');
  }

  const ttsRequest = payload.tts_request ?? payload.openai_tts_request ?? {};
  const responseFormat = String(ttsRequest.response_format || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
  const audioExt = responseFormat === 'wav' ? 'wav' : 'mp3';
  const contentType = responseFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';
  const mimeType = responseFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';

  const directorScenes = Array.isArray(payload.director_scenes) ? payload.director_scenes : [];
  const directorByScene = Object.fromEntries(directorScenes.map((s) => [Number(s.scene_number), s]));

  const buildGlobalInstructions = async () => {
    const templateData = resolveStagePromptTemplateData('narration_generation', {
      prompt_profile: payload.prompt_profile ?? {},
      title: String(payload.title || '').trim(),
      narration_script: String(payload.narration_script || '').trim(),
      target_duration_seconds: String(payload.target_duration_seconds || '').trim(),
      storyboard_json: scenes,
      scene_timing_plan: String(payload.scene_timing_plan || '').trim() || buildSceneTimingPlan(scenes),
    });
    const base = await loadRenderedPromptAsset('narration_generation/instructions.md', templateData);
    const ttsDelivery = String(payload.director_tts_delivery || '').trim();
    if (ttsDelivery) {
      return `${base}\n\nDirector's voice performance contract for this Reel:\n${ttsDelivery}`;
    }
    return base;
  };
  let cachedGlobalInstructions = null;

  const sceneResults = [];

  for (const scene of scenes) {
    const sceneNumber = Number(scene.scene_number ?? 0);
    const dialogueLines = Array.isArray(scene.dialogue_lines) ? scene.dialogue_lines : [];
    const sceneScript = dialogueLines.filter(Boolean).join(' ').trim()
      || String(scene.narration_text || '').trim();

    if (!sceneScript) {
      if (scene.is_face_image === true) {
        continue;
      }
      fail(`Scene ${sceneNumber} has no dialogue_lines or narration_text to narrate.`);
    }

    const directorScene = directorByScene[sceneNumber] ?? null;
    const sceneTtsInstructions = String(directorScene?.tts_instructions || scene.tts_instructions || '').trim();
    const sceneInstructionsLoader = async () => {
      if (!cachedGlobalInstructions) cachedGlobalInstructions = await buildGlobalInstructions();
      if (sceneTtsInstructions) {
        return `${cachedGlobalInstructions}\n\nDirector's instruction for this scene: ${sceneTtsInstructions}`;
      }
      return cachedGlobalInstructions;
    };

    const ttsProvider = String(payload.tts_provider || process.env.TTS_PROVIDER || process.env.NARRATION_PROVIDER || '').toLowerCase();
    const FISH_AUDIO_TAG_RE = /\((happy|sad|angry|excited|calm|nervous|confident|surprised|scared|worried|empathetic|curious|sarcastic|anxious|uncertain|confused|disappointed|nostalgic|hopeful|determined|compassionate|in a hurry tone|whispering|soft tone|long-break|sighing|gasping|laughing|crying loudly)\)/gi;
    const effectiveScript = (ttsProvider === 'fish_audio' && sceneTtsInstructions)
      ? (() => {
          const tags = [...sceneTtsInstructions.matchAll(FISH_AUDIO_TAG_RE)].map((m) => m[0]);
          return tags.length > 0 ? `${tags.join(' ')} ${sceneScript}` : sceneScript;
        })()
      : sceneScript;

    const scenePayload = { ...payload, narration_script: effectiveScript };
    const generation = await generateNarrationAudio(scenePayload, sceneInstructionsLoader);
    const request = generation.request ?? ttsRequest;

    const objectKey = objectKeyForSceneNarration(contentId, title, sceneNumber, audioExt);
    const storage = await uploadBinaryAsset('scene_narration', generation.binary, {
      objectKey,
      contentType,
      fileName: fileNameFromObjectKey(objectKey),
    });

    const provider = buildProviderId(generation.provider, request.model || audioExt, storage.mode);
    const metadata = {
      scene_number: sceneNumber,
      provider: generation.provider,
      generation_provider: generation.provider,
      asset_host_provider: storage.mode,
      workflow_name: workflowName,
      generation_model: String(request.model || ''),
      voice: String(request.voice || ''),
      speed: Number.isFinite(Number(request.speed)) ? Number(request.speed) : 1,
      narration_script: sceneScript,
      output_format: audioExt,
      rehost_provider: storage.mode,
      generated_at: new Date().toISOString(),
      audio_sha256: sha256Hex(generation.binary),
      estimated_duration_seconds: generation.estimatedDurationSeconds,
      asset_validation_note: `Generated scene ${sceneNumber} narration audio with ${generation.provider}, uploaded to ${describeHostProvider(storage.mode)}.`,
    };

    if (storage.mode === 'google_cloud_storage') {
      metadata.google_cloud_storage = {
        bucket: storage.bucket,
        endpoint: storage.endpoint,
        public_base_url: storage.publicBaseUrl,
        region: storage.region,
        object_key: storage.objectKey || objectKey,
        size: storage.size,
      };
    } else {
      metadata.storage_bucket = storage.bucket;
      metadata.storage_endpoint = storage.endpoint;
      metadata.storage_public_base_url = storage.publicBaseUrl;
      metadata.storage_region = storage.region;
      metadata.storage_object_key = storage.objectKey || objectKey;
    }

    sceneResults.push({
      scene_number: sceneNumber,
      provider,
      source_url: storage.url,
      storage_url: storage.url,
      mime_type: mimeType,
      duration_seconds: generation.estimatedDurationSeconds,
      metadata_json: metadata,
    });
  }

  const totalDuration = sceneResults.reduce((sum, s) => sum + (Number(s.duration_seconds) || 0), 0);
  const totalChars = sceneResults.reduce((sum, s) => sum + String(s.metadata_json?.narration_script ?? '').length, 0);
  const totalUtf8Bytes = sceneResults.reduce((sum, s) => sum + Buffer.byteLength(String(s.metadata_json?.narration_script ?? ''), 'utf8'), 0);
  const ttsCost = computeTtsCost(
    sceneResults[0]?.metadata_json?.generation_provider ?? ttsRequest.provider ?? 'fish_audio',
    {
      char_count: totalChars,
      utf8_bytes: totalUtf8Bytes,
    },
    String(sceneResults[0]?.metadata_json?.generation_model ?? ttsRequest.model ?? ''),
  );

  process.stdout.write(JSON.stringify({
    content_id: contentId,
    title,
    asset_role: 'scene_narration',
    scenes: sceneResults,
    scene_count: sceneResults.length,
    total_duration_seconds: totalDuration,
    status_after_success: 'narration_ready',
    workflow_name: workflowName,
    run_started_at: String(payload.run_started_at || new Date().toISOString()).trim() || new Date().toISOString(),
    cost: ttsCost,
  }));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
