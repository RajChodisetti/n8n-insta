#!/usr/bin/env node

import crypto from 'node:crypto';
import { loadRenderedPromptAsset } from './prompt_utils.mjs';
import { generateImageAsset } from './image_generation_adapters.mjs';
import { uploadBinaryAsset } from './asset_host_adapters.mjs';
import { getPostImageTextGuard } from './prompt_hard_rules.mjs';
import { resolveStagePromptTemplateData } from './prompt_stage_defaults.mjs';

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

function parseDimensions(size) {
  const match = String(size || '').trim().match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!match) {
    return { width: 1024, height: 1024 };
  }

  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
  };
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

function objectKeyFor(contentId, title) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const prefix = String(process.env.REELS_STORAGE_KEY_PREFIX || 'generated/instagram-posts')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const titleSlug = slugify(title, 'story');
  return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${contentId}-${titleSlug}.jpg`;
}

function fileNameFromObjectKey(objectKey) {
  const parts = String(objectKey || '').split('/');
  return parts[parts.length - 1] || 'post-image.jpg';
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
  return `${slugId(generationProvider, 'provider')}_${slugId(model, 'model')}_rehosted_jpeg_${slugId(hostProvider, 'host')}`;
}

async function main() {
  const payload = decodePayload();
  const contentId = ensureString('content_id', payload.content_id);
  const title = ensureString('title', payload.title);
  const category = String(payload.category || 'general').trim() || 'general';
  const selectedHook = String(payload.selected_hook || '').trim();
  const captionFinal = String(payload.caption_final || '').trim();
  const narrationScriptExcerpt = String(payload.narration_script || '').trim().slice(0, 700);
  const coverPromptDirection = String(payload.cover_prompt || '').trim() || 'Use a cinematic mystery-documentary composition.';
  const styleNotes = String(payload.style_notes || '').trim() || 'dark, atmospheric, realistic, cinematic lighting, deep blues, blacks, shadows, mystery and intrigue.';
  const baseImagePrompt = String(payload.image_prompt || '').trim() || await loadRenderedPromptAsset(
    'post_image_generation/prompt.md',
    resolveStagePromptTemplateData('post_image_generation', {
      prompt_profile: payload.prompt_profile ?? {},
      title,
      category,
      selected_hook: selectedHook,
      caption_final: captionFinal,
      narration_script_excerpt: narrationScriptExcerpt,
      cover_prompt_direction: coverPromptDirection,
      style_notes: styleNotes,
    }),
  );
  const imagePrompt = `${ensureString('post image base prompt', baseImagePrompt)}\n${getPostImageTextGuard()}`.trim();
  const imageRequest = payload.image_request ?? payload.openai_image_request ?? {};
  const generation = await generateImageAsset('post_image', imagePrompt, imageRequest, 'wf_simple_post_image_asset');
  const objectKey = objectKeyFor(contentId, title);
  const storage = await uploadBinaryAsset('post_image', generation.binary, {
    objectKey,
    contentType: 'image/jpeg',
    fileName: fileNameFromObjectKey(objectKey),
  });
  const request = generation.request ?? imageRequest;
  const dimensions = parseDimensions(request.size);
  const provider = buildProviderId(generation.provider, request.model, storage.mode);
  const assetValidationNote = `Generated the creative with ${generation.provider}, uploaded the JPEG to ${describeHostProvider(storage.mode)}, and persisted that delivery URL as the Instagram asset.`;
  const assetMetadataJson = {
    provider: generation.provider,
    generation_provider: generation.provider,
    asset_host_provider: storage.mode,
    generation_model: String(request.model || ''),
    quality: String(request.quality || ''),
    size: String(request.size || ''),
    style: String(request.style || ''),
    image_prompt: imagePrompt,
    revised_prompt: generation.revisedPrompt ?? null,
    generated_url: storage.url,
    delivery_url: storage.url,
    output_format: 'jpeg',
    output_compression: Number(request.output_compression ?? 92),
    asset_validation_note: assetValidationNote,
    override_used: false,
    source_type: `${generation.provider}_binary_rehosted`,
    generated_at: new Date().toISOString(),
    image_sha256: sha256Hex(generation.binary),
    rehost_provider: storage.mode,
  };

  if (storage.mode === 'google_cloud_storage') {
    assetMetadataJson.google_cloud_storage = {
      bucket: storage.bucket,
      endpoint: storage.endpoint,
      public_base_url: storage.publicBaseUrl,
      region: storage.region,
      object_key: storage.objectKey || objectKey,
      size: storage.size,
    };
  } else {
    assetMetadataJson.storage_bucket = storage.bucket;
    assetMetadataJson.storage_endpoint = storage.endpoint;
    assetMetadataJson.storage_public_base_url = storage.publicBaseUrl;
    assetMetadataJson.storage_region = storage.region;
    assetMetadataJson.storage_object_key = storage.objectKey || objectKey;
  }

  process.stdout.write(JSON.stringify({
    content_id: contentId,
    title,
    caption_final: captionFinal,
    hashtags_final: String(payload.hashtags_final ?? '').trim(),
    asset_role: String(payload.asset_role || 'post_image').trim() || 'post_image',
    provider,
    source_url: storage.url,
    storage_url: storage.url,
    mime_type: 'image/jpeg',
    width: dimensions.width,
    height: dimensions.height,
    status_after_asset: 'approval_pending',
    asset_validation_note: assetValidationNote,
    workflow_name: String(payload.workflow_name || 'wf_simple_post_image_asset').trim() || 'wf_simple_post_image_asset',
    run_started_at: String(payload.run_started_at || new Date().toISOString()).trim() || new Date().toISOString(),
    generation_provider: generation.provider,
    generation_model: String(request.model || ''),
    asset_metadata_json: assetMetadataJson,
  }));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
