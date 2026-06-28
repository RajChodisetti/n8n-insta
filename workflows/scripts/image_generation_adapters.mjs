#!/usr/bin/env node

import { providerNotImplemented, selectImageApiKey, selectImageProvider } from './adapter_config.mjs';
import { getNoVisibleTextGenerationDirective, getNoVisibleTextNegativePrompt } from './prompt_hard_rules.mjs';

function fail(message) {
  throw new Error(message);
}

function ensureString(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    fail(`${name} is required.`);
  }
  return normalized;
}

function isGptImageModel(model) {
  return /^(gpt-image-|chatgpt-image-)/i.test(model);
}

function firstGptImageModel(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (isGptImageModel(normalized)) {
      return normalized;
    }
  }
  return 'gpt-image-1-mini';
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

function normalizeOpenAiFallbackRequest(request = {}) {
  return {
    ...request,
    provider: 'openai',
    model: firstGptImageModel(
      request.openai_model,
      request.model,
      process.env.OPENAI_SCENE_IMAGE_MODEL,
      process.env.OPENAI_IMAGE_MODEL,
      process.env.SCENE_IMAGE_MODEL,
      process.env.IMAGE_MODEL,
    ),
    size: firstNonEmpty(
      request.openai_size,
      request.size,
      process.env.OPENAI_SCENE_IMAGE_SIZE,
      process.env.OPENAI_IMAGE_SIZE,
      process.env.SCENE_IMAGE_SIZE,
      process.env.IMAGE_SIZE,
      '1024x1536',
    ),
    quality: firstNonEmpty(
      request.openai_quality,
      request.quality,
      process.env.OPENAI_SCENE_IMAGE_QUALITY,
      process.env.OPENAI_IMAGE_QUALITY,
      process.env.SCENE_IMAGE_QUALITY,
      process.env.IMAGE_QUALITY,
      'medium',
    ),
    output_compression: firstNonEmpty(
      request.openai_output_compression,
      request.output_compression,
      process.env.OPENAI_SCENE_IMAGE_COMPRESSION,
      process.env.OPENAI_IMAGE_COMPRESSION,
      process.env.SCENE_IMAGE_COMPRESSION,
      process.env.IMAGE_COMPRESSION,
      '92',
    ),
  };
}

function isProviderBillingOrQuotaError(error) {
  return /\b(exhausted|balance|top up|billing|quota|credit|payment|locked|403)\b/i.test(String(error?.message || error || ''));
}

function shouldFallbackFalImageToOpenAi(component, error) {
  if (String(process.env.DISABLE_FAL_IMAGE_OPENAI_FALLBACK || '').trim().toLowerCase() === 'true') {
    return false;
  }
  return isProviderBillingOrQuotaError(error) && Boolean(String(selectImageApiKey(component, 'openai')).trim());
}

function normalizeReferenceImages(value) {
  const rawEntries = Array.isArray(value) ? value : [];
  const references = [];
  for (const entry of rawEntries) {
    const imageUrl = typeof entry === 'string'
      ? entry
      : (entry?.image_url || entry?.storage_url || entry?.source_url || entry?.url || '');
    const normalizedUrl = String(imageUrl || '').trim();
    if (normalizedUrl) {
      references.push({ image_url: normalizedUrl });
    }
  }
  return references.slice(0, 16);
}

async function fetchWithContext(url, options, failureContext) {
  try {
    return await fetch(url, options);
  } catch (error) {
    fail(`${failureContext}: ${error.message}`);
  }
}

async function generateWithOpenAi(prompt, request, contextLabel) {
  const component = String(request?.component || request?.asset_component || request?.asset_role || '').trim() || 'scene_image';
  const apiKey = String(selectImageApiKey(component, 'openai')).trim();
  if (!apiKey) {
    fail(`Set ${component.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_OPENAI_API_KEY, IMAGE_OPENAI_API_KEY, or OPENAI_API_KEY before running ${contextLabel}. For backward compatibility, LLL_API_KEY is also accepted.`);
  }

  const model = ensureString('image_request.model', request.model);
  if (!isGptImageModel(model)) {
    fail(`${contextLabel} requires a GPT image model that can return JPEG output. Received: ${model}`);
  }

  const referenceImages = normalizeReferenceImages(request.reference_images);
  const rawPrompt = [
    getNoVisibleTextGenerationDirective(),
    ensureString('image prompt', prompt),
    referenceImages.length
      ? String(request.reference_prompt || 'Use the input reference image(s) to preserve the same character, subject, visual identity, composition cues, and overall style while creating the requested new scene.').trim()
      : '',
  ].filter(Boolean).join('\n\n');
  const body = {
    model,
    prompt: rawPrompt.length > 32000 ? rawPrompt.slice(0, 32000) : rawPrompt,
    size: ensureString('image_request.size', request.size),
    quality: ensureString('image_request.quality', request.quality),
    output_format: 'jpeg',
    output_compression: Number.isFinite(Number(request.output_compression))
      ? Math.max(0, Math.min(100, Math.round(Number(request.output_compression))))
      : 92,
    n: 1,
  };
  if (referenceImages.length) {
    body.images = referenceImages;
    body.input_fidelity = String(request.input_fidelity || 'high').trim().toLowerCase() || 'high';
  }

  const endpoint = referenceImages.length
    ? 'https://api.openai.com/v1/images/edits'
    : 'https://api.openai.com/v1/images/generations';
  const response = await fetchWithContext(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    `OpenAI image generation request failed for ${contextLabel} (${model} -> ${endpoint})`,
  );

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok || responseBody.error) {
    fail(`OpenAI image generation failed (${response.status || 'no status'}): ${responseBody?.error?.message ?? 'unknown error'}`);
  }

  const imageData = Array.isArray(responseBody?.data) ? responseBody.data[0] ?? {} : {};
  const b64Json = String(imageData?.b64_json || '').trim();
  if (!b64Json) {
    fail('OpenAI image generation returned no b64_json payload.');
  }

  return {
    provider: 'openai',
    request: body,
    revisedPrompt: String(imageData?.revised_prompt || '').trim() || null,
    binary: Buffer.from(b64Json, 'base64'),
  };
}

function falAppIdFromModel(model) {
  const m = String(model || '').trim().toLowerCase();
  if (!m || m === 'flux-schnell' || m === 'flux/schnell') return 'fal-ai/flux/schnell';
  if (m === 'flux-dev' || m === 'flux/dev') return 'fal-ai/flux/dev';
  if (m.startsWith('fal-ai/') || m.startsWith('fal/')) return m;
  return 'fal-ai/flux/schnell';
}

async function generateWithFalAi(prompt, request, contextLabel) {
  const component = String(request?.component || request?.asset_component || request?.asset_role || '').trim() || 'scene_image';
  const apiKey = String(selectImageApiKey(component, 'fal_ai')).trim();
  if (!apiKey) {
    fail(`Set ${component.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_FAL_AI_API_KEY, IMAGE_FAL_AI_API_KEY, or FAL_AI_API_KEY before running ${contextLabel}.`);
  }

  const rawPrompt = [
    getNoVisibleTextGenerationDirective(),
    ensureString('image prompt', prompt),
    getNoVisibleTextGenerationDirective(),
  ].join('\n\n');
  const appId = falAppIdFromModel(request.model || process.env.SCENE_IMAGE_MODEL || process.env.IMAGE_MODEL);

  const sizeMatch = String(request.size || '').trim().match(/^(\d+)x(\d+)$/i);
  const imageSize = sizeMatch
    ? { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) }
    : { width: 1024, height: 1536 };

  const body = {
    prompt: rawPrompt.length > 4000 ? rawPrompt.slice(0, 4000) : rawPrompt,
    negative_prompt: getNoVisibleTextNegativePrompt(),
    image_size: imageSize,
    num_inference_steps: 4,
    num_images: 1,
    enable_safety_checker: false,
    sync_mode: true,
  };

  const endpoint = `https://fal.run/${appId}`;
  const response = await fetchWithContext(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    `Fal AI image generation request failed for ${contextLabel} (${appId})`,
  );

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok || responseBody.detail) {
    const errMsg = Array.isArray(responseBody.detail)
      ? responseBody.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
      : (responseBody.detail || responseBody.message || 'unknown error');
    fail(`Fal AI image generation failed (${response.status || 'no status'}): ${errMsg}`);
  }

  const images = Array.isArray(responseBody.images) ? responseBody.images : [];
  const firstImage = images[0];
  if (!firstImage?.url) {
    fail('Fal AI image generation returned no image URL.');
  }

  const imgResponse = await fetchWithContext(
    firstImage.url,
    {},
    `Fal AI image download failed for ${contextLabel}`,
  );
  if (!imgResponse.ok) {
    fail(`Fal AI image download failed (${imgResponse.status}): ${firstImage.url}`);
  }
  const binary = Buffer.from(await imgResponse.arrayBuffer());
  if (!binary.length) {
    fail('Fal AI image download returned an empty payload.');
  }

  return {
    provider: 'fal_ai',
    request: { ...body, model: appId },
    revisedPrompt: null,
    binary,
  };
}

export async function generateImageAsset(component, prompt, request, contextLabel) {
  const provider = String(request?.provider || selectImageProvider(component)).trim().toLowerCase();
  const requestWithComponent = { ...(request || {}), component };
  if (provider === 'openai') {
    return generateWithOpenAi(prompt, requestWithComponent, contextLabel);
  }
  if (provider === 'fal_ai' || provider === 'fal-ai' || provider === 'fal') {
    try {
      return await generateWithFalAi(prompt, requestWithComponent, contextLabel);
    } catch (error) {
      if (!shouldFallbackFalImageToOpenAi(component, error)) {
        throw error;
      }
      return generateWithOpenAi(
        prompt,
        normalizeOpenAiFallbackRequest(requestWithComponent),
        `${contextLabel} (Fal image billing/quota fallback to OpenAI)`,
      );
    }
  }

  providerNotImplemented('image generation', provider, component);
}
