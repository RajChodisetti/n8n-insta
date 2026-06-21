#!/usr/bin/env node

function normalize(value, fallback = '') {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || String(fallback ?? '').trim().toLowerCase();
}

function firstEnv(keys = []) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) {
      return value;
    }
  }
  return '';
}

export function selectTextProvider(stageKey) {
  const mapping = {
    research_and_script: ['RESEARCH_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    story_package_generation: ['STORY_PACKAGE_LLM_PROVIDER', 'PREMIUM_TEXT_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    director_contract: ['DIRECTOR_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    director: ['DIRECTOR_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    idea_prompt_profile: ['PROMPT_BUILDER_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    storyboard_and_prompts: ['STORYBOARD_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    caption_and_hashtags: ['CAPTION_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    prompt_builder: ['PROMPT_BUILDER_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
  };
  return normalize(firstEnv(mapping[stageKey] || ['TEXT_LLM_PROVIDER']), 'openai');
}

export function selectImageProvider(component) {
  const mapping = {
    scene_image: ['SCENE_IMAGE_PROVIDER', 'IMAGE_GENERATION_PROVIDER'],
    post_image: ['POST_IMAGE_PROVIDER', 'IMAGE_GENERATION_PROVIDER'],
  };
  return normalize(firstEnv(mapping[component] || ['IMAGE_GENERATION_PROVIDER']), 'openai');
}

export function selectNarrationProvider() {
  return normalize(firstEnv(['NARRATION_PROVIDER', 'TTS_PROVIDER']), 'fish_audio');
}

export function selectAssetHostProvider(component) {
  const mapping = {
    scene_image: ['SCENE_IMAGE_HOST_PROVIDER', 'ASSET_HOST_PROVIDER', 'IMAGE_HOST_PROVIDER'],
    post_image: ['POST_IMAGE_HOST_PROVIDER', 'ASSET_HOST_PROVIDER', 'IMAGE_HOST_PROVIDER'],
    narration_audio: ['NARRATION_HOST_PROVIDER', 'ASSET_HOST_PROVIDER', 'IMAGE_HOST_PROVIDER'],
    render_output: ['RENDER_OUTPUT_HOST_PROVIDER', 'ASSET_HOST_PROVIDER', 'IMAGE_HOST_PROVIDER'],
  };
  return normalize(firstEnv(mapping[component] || ['ASSET_HOST_PROVIDER', 'IMAGE_HOST_PROVIDER']), 'object_storage');
}

export function selectRenderProvider() {
  return normalize(firstEnv(['RENDER_PROVIDER']), 'local_ffmpeg');
}

export function providerNotImplemented(kind, provider, component) {
  const normalizedKind = String(kind || 'adapter').trim();
  const normalizedProvider = String(provider || 'unknown').trim();
  const normalizedComponent = String(component || 'component').trim();
  throw new Error(
    `${normalizedKind} provider '${normalizedProvider}' is not implemented for ${normalizedComponent}. ` +
    `Add an adapter implementation before selecting it in .env.`,
  );
}

export function assetHostAliases(provider) {
  const normalized = normalize(provider, 'object_storage');
  if (normalized === 'gcs' || normalized === 'google-cloud-storage') {
    return 'google_cloud_storage';
  }
  if (normalized === 'minio' || normalized === 's3') {
    return 'object_storage';
  }
  return normalized;
}
