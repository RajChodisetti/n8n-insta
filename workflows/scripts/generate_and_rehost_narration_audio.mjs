#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

async function probeAudioDurationSeconds(binary, extension = 'mp3') {
  if (!binary?.length) {
    return null;
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'n8n-insta-tts-duration-'));
  const audioPath = path.join(tempDir, `audio.${String(extension || 'mp3').replace(/[^a-z0-9]/gi, '') || 'mp3'}`);
  try {
    await fs.writeFile(audioPath, binary);
    const result = spawnSync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audioPath,
      ],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    if (result.status !== 0) {
      return null;
    }
    const parsed = Number.parseFloat(String(result.stdout || '').trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Number(parsed.toFixed(3));
  } catch {
    return null;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildProviderId(generationProvider, model, hostProvider) {
  return `${slugId(generationProvider, 'provider')}_${slugId(model, 'model')}_rehosted_mp3_${slugId(hostProvider, 'host')}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function trimString(value) {
  return String(value ?? '').trim();
}

function voicePerformanceLinesForScene(voicePerformanceJson, sceneNumber) {
  return asArray(voicePerformanceJson.lines)
    .filter((line) => Number(line?.scene_number) === Number(sceneNumber));
}

function buildVoicePerformanceSceneInstruction(voicePerformanceJson, sceneNumber) {
  const voicePerformance = plainObject(voicePerformanceJson);
  const lines = voicePerformanceLinesForScene(voicePerformance, sceneNumber);
  if (lines.length === 0) {
    return '';
  }
  const voiceProfile = plainObject(voicePerformance.voice_profile);
  const parts = [
    trimString(voiceProfile.delivery_summary),
  ].filter(Boolean);
  for (const line of lines) {
    const pauses = plainObject(line.pauses);
    const emphasis = asArray(line.emphasis)
      .map((entry) => `${trimString(entry.phrase)} => ${trimString(entry.intent)}`.trim())
      .filter((entry) => entry !== '=>')
      .join('; ');
    parts.push([
      `Line ${Number(line.line_index || 1)}`,
      trimString(line.tone) ? `tone: ${trimString(line.tone)}` : '',
      trimString(line.pace) ? `pace: ${trimString(line.pace)}` : '',
      `pause before ${Number(pauses.before_seconds || 0)}s and after ${Number(pauses.after_seconds || 0)}s`,
      trimString(pauses.internal_pause_notes) ? `internal pauses: ${trimString(pauses.internal_pause_notes)}` : '',
      emphasis ? `emphasis: ${emphasis}` : '',
    ].filter(Boolean).join('; '));
  }
  parts.push('Use these only as delivery guidance. Do not speak bracketed notes, emotion tags, SSML, or stage directions.');
  return parts.join(' ');
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
    const voicePerformanceInstruction = buildVoicePerformanceSceneInstruction(payload.voice_performance_json, sceneNumber);
    const sceneTtsInstructions = [
      String(directorScene?.tts_instructions || '').trim(),
      String(scene.tts_instructions || '').trim(),
      voicePerformanceInstruction,
    ].filter(Boolean).join(' ');
    const sceneInstructionsLoader = async () => {
      if (!cachedGlobalInstructions) cachedGlobalInstructions = await buildGlobalInstructions();
      if (sceneTtsInstructions) {
        return `${cachedGlobalInstructions}\n\nDirector's instruction for this scene: ${sceneTtsInstructions}`;
      }
      return cachedGlobalInstructions;
    };

    const scenePayload = { ...payload, narration_script: sceneScript };
    const generation = await generateNarrationAudio(scenePayload, sceneInstructionsLoader);
    const request = generation.request ?? ttsRequest;
    const actualDurationSeconds = await probeAudioDurationSeconds(generation.binary, audioExt);
    const durationSeconds = actualDurationSeconds ?? generation.estimatedDurationSeconds;

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
      tts_instructions: sceneTtsInstructions,
      voice_performance_lines: voicePerformanceLinesForScene(payload.voice_performance_json, sceneNumber),
      output_format: audioExt,
      rehost_provider: storage.mode,
      generated_at: new Date().toISOString(),
      audio_sha256: sha256Hex(generation.binary),
      estimated_duration_seconds: generation.estimatedDurationSeconds,
      actual_duration_seconds: actualDurationSeconds,
      duration_source: actualDurationSeconds ? 'ffprobe' : 'word_count_estimate',
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
      duration_seconds: durationSeconds,
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
