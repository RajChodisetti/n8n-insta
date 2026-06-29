#!/usr/bin/env node

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadRenderedPromptAsset } from './prompt_utils.mjs';
import { generateImageAsset } from './image_generation_adapters.mjs';
import { uploadBinaryAsset } from './asset_host_adapters.mjs';
import { getSceneImageRelevanceGuard, getSceneImageTextGuard } from './prompt_hard_rules.mjs';
import { resolveStagePromptTemplateData } from './prompt_stage_defaults.mjs';
import { computeImageCost } from './cost_calculator.mjs';

function fail(message) {
  throw new Error(message);
}

function decodePayload() {
  const payloadFileIndex = process.argv.indexOf('--payload-file');
  if (payloadFileIndex >= 0) {
    const payloadFile = String(process.argv[payloadFileIndex + 1] || '').trim();
    if (!payloadFile) {
      fail('Missing value for --payload-file.');
    }
    try {
      return JSON.parse(readFileSync(payloadFile, 'utf8'));
    } catch (error) {
      fail(`Could not read workflow payload file: ${error.message}`);
    }
  }

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

function parseDimensions(size) {
  const match = String(size || '').trim().match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!match) {
    return { width: 1024, height: 1536 };
  }

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
  if (provider === 'google_cloud_storage') {
    return 'Google Cloud Storage';
  }
  if (provider === 'object_storage') {
    return 'object storage';
  }
  return provider;
}

function buildSceneMetadata(storage, scene, generation, title, workflowName) {
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

function isMetaNarrationInstruction(value) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return META_NARRATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function ensureScenePromptSpecificity(scene) {
  const sceneNumber = Number(scene?.scene_number ?? 0);
  const visualPrompt = String(scene?.visual_prompt ?? '').trim();
  const narrationText = String(scene?.narration_text ?? '').trim();
  const visualWordCount = visualPrompt.split(/\s+/).filter(Boolean).length;

  if (!narrationText) {
    fail(`Scene ${sceneNumber || '<unknown>'} is missing narration_text, so the image prompt cannot be verified against the narrated beat.`);
  }
  if (isMetaNarrationInstruction(narrationText) || isMetaNarrationInstruction(visualPrompt)) {
    fail(`Scene ${sceneNumber || '<unknown>'} contains pipeline-meta narration instructions instead of a concrete scene beat.`);
  }

  if (visualWordCount < 12) {
    fail(`Scene ${sceneNumber || '<unknown>'} visual_prompt is too vague. It must be specific enough to name the subject, action, and setting.`);
  }

  if (GENERIC_SCENE_PROMPT_PATTERNS.some((pattern) => pattern.test(visualPrompt))) {
    fail(`Scene ${sceneNumber || '<unknown>'} visual_prompt is too generic for production. Replace mood-board wording with a concrete subject, action, and setting.`);
  }
}

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
  const workflowName = String(payload.workflow_name || 'wf_asset_generation').trim() || 'wf_asset_generation';
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  const imageRequest = payload.image_request ?? payload.openai_image_request ?? {};
  if (scenes.length === 0) {
    fail('No scenes were provided for scene asset generation.');
  }

  const dimensions = parseDimensions(imageRequest.size);
  const generatedScenes = [];

  for (const scene of scenes) {
    const sceneNumber = Number(scene.scene_number);
    if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
      fail(`Invalid scene_number: ${scene.scene_number}`);
    }
    ensureScenePromptSpecificity(scene);

    const basePrompt = String(scene.image_prompt || '').trim() || await loadRenderedPromptAsset(
      'scene_asset_generation/prompt.md',
      resolveStagePromptTemplateData('scene_asset_generation', {
        prompt_profile: payload.prompt_profile ?? {},
        title,
        category,
        scene_number: String(sceneNumber),
        selected_hook: selectedHook,
        narration_text: String(scene.narration_text || '').trim(),
        visual_prompt: String(scene.visual_prompt || '').trim(),
        mood: String(scene.mood || '').trim(),
        transition: String(scene.transition || '').trim(),
        narration_script_excerpt: narrationScriptExcerpt,
        style_notes: styleNotes,
        director_global_visual_style: directorGlobalVisualStyle,
        director_avoid_rules: directorAvoidRules,
        scene_duration_seconds: String(scene.duration_seconds ?? ''),
      }),
    );
    const prompt = [
      ensureString(`scene ${sceneNumber} base prompt`, basePrompt),
      getSceneImageRelevanceGuard(scene),
      getSceneImageTextGuard(sceneNumber),
    ].join('\n').trim();

    const generation = await generateImageAsset('scene_image', prompt, imageRequest, workflowName);
    const objectKey = objectKeyForScene(contentId, title, sceneNumber);
    const storage = await uploadBinaryAsset('scene_image', generation.binary, {
      objectKey,
      contentType: 'image/jpeg',
      fileName: fileNameFromObjectKey(objectKey),
    });
    const metadata = buildSceneMetadata(storage, scene, generation, title, workflowName);
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
  }

  const imageCost = computeImageCost(
    String(generatedScenes[0]?.metadata_json?.generation_provider || ''),
    String(generatedScenes[0]?.metadata_json?.generation_model || imageRequest.model || ''),
    generatedScenes.length,
  );

  process.stdout.write(JSON.stringify({
    content_id: contentId,
    title,
    workflow_name: workflowName,
    run_started_at: String(payload.run_started_at || new Date().toISOString()).trim() || new Date().toISOString(),
    status_after_success: 'assets_ready',
    scene_assets: generatedScenes,
    scene_count: generatedScenes.length,
    generation_provider: String(generatedScenes[0]?.metadata_json?.generation_provider || ''),
    generation_model: String(imageRequest.model || ''),
    rehost_provider: String(generatedScenes[0]?.metadata_json?.rehost_provider || ''),
    cost: imageCost,
  }));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
