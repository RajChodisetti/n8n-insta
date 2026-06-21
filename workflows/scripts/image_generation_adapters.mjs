#!/usr/bin/env node

import { providerNotImplemented, selectImageProvider } from './adapter_config.mjs';

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
  const apiKey = String(process.env.OPENAI_API_KEY || process.env.LLL_API_KEY || '').trim();
  if (!apiKey) {
    fail(`Set OPENAI_API_KEY in the repo-root .env before running ${contextLabel}. For backward compatibility, LLL_API_KEY is also accepted.`);
  }

  const model = ensureString('image_request.model', request.model);
  if (!isGptImageModel(model)) {
    fail(`${contextLabel} requires a GPT image model that can return JPEG output. Received: ${model}`);
  }

  const referenceImages = normalizeReferenceImages(request.reference_images);
  const rawPrompt = [
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
  const apiKey = String(process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY || '').trim();
  if (!apiKey) {
    fail(`Set FAL_AI_API_KEY in the repo-root .env before running ${contextLabel}.`);
  }

  const rawPrompt = ensureString('image prompt', prompt);
  const appId = falAppIdFromModel(request.model || process.env.SCENE_IMAGE_MODEL || process.env.IMAGE_MODEL);

  const sizeMatch = String(request.size || '').trim().match(/^(\d+)x(\d+)$/i);
  const imageSize = sizeMatch
    ? { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) }
    : { width: 1024, height: 1536 };

  const body = {
    prompt: rawPrompt.length > 4000 ? rawPrompt.slice(0, 4000) : rawPrompt,
    negative_prompt: 'text, words, letters, captions, subtitles, watermark, logo, speech bubble, speech bubbles, dialogue bubble, thought bubble, comic text, writing, typography, readable characters, Chinese characters, Japanese characters, Arabic script, Devanagari, Cyrillic, any script, signage, label, caption box, banner, title card, overlay text',
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
  if (provider === 'openai') {
    return generateWithOpenAi(prompt, request, contextLabel);
  }
  if (provider === 'fal_ai' || provider === 'fal-ai' || provider === 'fal') {
    return generateWithFalAi(prompt, request, contextLabel);
  }

  providerNotImplemented('image generation', provider, component);
}
