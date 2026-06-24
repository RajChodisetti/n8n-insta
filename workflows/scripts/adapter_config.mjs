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

function providerEnvPrefix(provider) {
  const normalized = normalize(provider).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized === 'fal' || normalized === 'fal_ai' || normalized === 'falai') return 'FAL_AI';
  if (normalized === 'fish' || normalized === 'fish_audio' || normalized === 'fishaudio') return 'FISH_AUDIO';
  if (normalized === 'smallest' || normalized === 'smallest_ai' || normalized === 'smallestai') return 'SMALLEST_AI';
  return normalized.toUpperCase();
}

function stageEnvPrefix(stageKey) {
  const normalized = normalize(stageKey).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized === 'storyboard_and_prompts') return 'STORYBOARD';
  if (normalized === 'caption_and_hashtags') return 'CAPTION';
  if (normalized === 'research_and_script') return 'RESEARCH';
  if (normalized === 'director_contract' || normalized === 'director') return 'DIRECTOR';
  if (normalized === 'idea_prompt_profile') return 'PROMPT_BUILDER';
  return normalized.toUpperCase();
}

export function selectTextProvider(stageKey) {
  const mapping = {
    idea_ingest: ['IDEA_INGEST_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    research_and_script: ['RESEARCH_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    story_package_generation: ['STORY_PACKAGE_LLM_PROVIDER', 'PREMIUM_TEXT_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    story_package_generation_v2: ['STORY_PACKAGE_V2_LLM_PROVIDER', 'STORY_PACKAGE_LLM_PROVIDER', 'PREMIUM_TEXT_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    director_contract: ['DIRECTOR_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    director: ['DIRECTOR_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    idea_prompt_profile: ['IDEA_PROMPT_PROFILE_LLM_PROVIDER', 'PROMPT_BUILDER_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    storyboard_and_prompts: ['STORYBOARD_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    caption_and_hashtags: ['CAPTION_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
    prompt_builder: ['PROMPT_BUILDER_LLM_PROVIDER', 'TEXT_LLM_PROVIDER'],
  };
  return normalize(firstEnv(mapping[stageKey] || ['TEXT_LLM_PROVIDER']), 'openai');
}

export function selectTextApiKey(stageKey, provider) {
  const providerPrefix = providerEnvPrefix(provider);
  const stagePrefix = stageEnvPrefix(stageKey);
  const mapping = {
    idea_ingest: [`IDEA_INGEST_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
    idea_prompt_profile: [`IDEA_PROMPT_PROFILE_${providerPrefix}_API_KEY`, `PROMPT_BUILDER_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
    prompt_builder: [`PROMPT_BUILDER_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
    story_package_generation: [`STORY_PACKAGE_${providerPrefix}_API_KEY`, `PREMIUM_TEXT_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
    story_package_generation_v2: [`STORY_PACKAGE_V2_${providerPrefix}_API_KEY`, `STORY_PACKAGE_${providerPrefix}_API_KEY`, `PREMIUM_TEXT_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
    director_contract: [`DIRECTOR_CONTRACT_${providerPrefix}_API_KEY`, `DIRECTOR_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
    director: [`DIRECTOR_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
    research_and_script: [`RESEARCH_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
    storyboard_and_prompts: [`STORYBOARD_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
    caption_and_hashtags: [`CAPTION_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`],
  };
  const providerFallbacks = providerPrefix === 'OPENAI'
    ? ['OPENAI_API_KEY', 'LLL_API_KEY']
    : [`${providerPrefix}_API_KEY`];
  return firstEnv([
    ...(mapping[stageKey] || [`${stagePrefix}_${providerPrefix}_API_KEY`, `TEXT_${providerPrefix}_API_KEY`]),
    ...providerFallbacks,
  ]);
}

export function selectImageProvider(component) {
  const mapping = {
    scene_image: ['SCENE_IMAGE_PROVIDER', 'IMAGE_GENERATION_PROVIDER'],
    post_image: ['POST_IMAGE_PROVIDER', 'IMAGE_GENERATION_PROVIDER'],
  };
  return normalize(firstEnv(mapping[component] || ['IMAGE_GENERATION_PROVIDER']), 'openai');
}

export function selectImageApiKey(component, provider) {
  const providerPrefix = providerEnvPrefix(provider);
  const componentPrefix = stageEnvPrefix(component || 'image');
  const mapping = {
    scene_image: [`SCENE_IMAGE_${providerPrefix}_API_KEY`, `IMAGE_${providerPrefix}_API_KEY`],
    post_image: [`POST_IMAGE_${providerPrefix}_API_KEY`, `IMAGE_${providerPrefix}_API_KEY`],
  };
  const providerFallbacks = providerPrefix === 'OPENAI'
    ? ['OPENAI_IMAGE_API_KEY', 'OPENAI_API_KEY', 'LLL_API_KEY']
    : [`${providerPrefix}_API_KEY`, providerPrefix === 'FAL_AI' ? 'FAL_API_KEY' : ''];
  return firstEnv([
    ...(mapping[component] || [`${componentPrefix}_${providerPrefix}_API_KEY`, `IMAGE_${providerPrefix}_API_KEY`]),
    ...providerFallbacks,
  ]);
}

export function selectNarrationProvider() {
  return normalize(firstEnv(['NARRATION_PROVIDER', 'TTS_PROVIDER']), 'fish_audio');
}

export function selectNarrationApiKey(provider) {
  const providerPrefix = providerEnvPrefix(provider);
  const providerFallbacks = {
    OPENAI: ['OPENAI_TTS_API_KEY', 'OPENAI_API_KEY', 'LLL_API_KEY'],
    FISH_AUDIO: ['FISH_AUDIO_API_KEY', 'FISH_API_KEY'],
    SMALLEST_AI: ['SMALLEST_AI_API_KEY', 'SMALLEST_API_KEY'],
  }[providerPrefix] || [`${providerPrefix}_API_KEY`];
  return firstEnv([
    `NARRATION_${providerPrefix}_API_KEY`,
    `TTS_${providerPrefix}_API_KEY`,
    ...providerFallbacks,
  ]);
}

export function selectVideoApiKey(component = 'scene_video', provider = 'fal_ai') {
  const providerPrefix = providerEnvPrefix(provider);
  return firstEnv([
    `${stageEnvPrefix(component)}_${providerPrefix}_API_KEY`,
    `SCENE_VIDEO_${providerPrefix}_API_KEY`,
    `WAN_VIDEO_${providerPrefix}_API_KEY`,
    `VIDEO_${providerPrefix}_API_KEY`,
    `${providerPrefix}_API_KEY`,
    providerPrefix === 'FAL_AI' ? 'FAL_API_KEY' : '',
  ]);
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
