#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  selectImageApiKey,
  selectNarrationApiKey,
  selectTextProvider,
  selectTextApiKey,
  selectVideoApiKey,
} from '../workflows/scripts/adapter_config.mjs';

const KEYS = [
  'PIPELINE_DISABLE_RUNTIME_ENV_FILE',
  'PIPELINE_RUNTIME_ENV_FILE',
  'OPENAI_API_KEY',
  'LLL_API_KEY',
  'TEXT_OPENAI_API_KEY',
  'PREMIUM_TEXT_OPENAI_API_KEY',
  'IDEA_INGEST_OPENAI_API_KEY',
  'PROMPT_BUILDER_OPENAI_API_KEY',
  'STORY_PACKAGE_OPENAI_API_KEY',
  'STORY_PACKAGE_V2_OPENAI_API_KEY',
  'DIRECTOR_OPENAI_API_KEY',
  'VISUAL_PROMPT_OPENAI_API_KEY',
  'VOICE_PERFORMANCE_OPENAI_API_KEY',
  'AVATAR_OPENAI_API_KEY',
  'FINAL_QA_OPENAI_API_KEY',
  'PERFORMANCE_FEEDBACK_OPENAI_API_KEY',
  'RESEARCH_OPENAI_API_KEY',
  'STORYBOARD_OPENAI_API_KEY',
  'CAPTION_OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'TEXT_ANTHROPIC_API_KEY',
  'PREMIUM_TEXT_ANTHROPIC_API_KEY',
  'PROMPT_BUILDER_ANTHROPIC_API_KEY',
  'VISUAL_PROMPT_ANTHROPIC_API_KEY',
  'VOICE_PERFORMANCE_ANTHROPIC_API_KEY',
  'AVATAR_ANTHROPIC_API_KEY',
  'FINAL_QA_ANTHROPIC_API_KEY',
  'PERFORMANCE_FEEDBACK_ANTHROPIC_API_KEY',
  'AVATAR_LLM_PROVIDER',
  'CAPTION_LLM_PROVIDER',
  'FINAL_QA_LLM_PROVIDER',
  'PREMIUM_TEXT_LLM_PROVIDER',
  'TEXT_LLM_PROVIDER',
  'IMAGE_OPENAI_API_KEY',
  'SCENE_IMAGE_OPENAI_API_KEY',
  'POST_IMAGE_OPENAI_API_KEY',
  'FAL_AI_API_KEY',
  'FAL_API_KEY',
  'IMAGE_FAL_AI_API_KEY',
  'SCENE_IMAGE_FAL_AI_API_KEY',
  'SCENE_VIDEO_FAL_AI_API_KEY',
  'WAN_REFERENCE_VIDEO_FAL_AI_API_KEY',
  'FISH_AUDIO_API_KEY',
  'FISH_API_KEY',
  'TTS_FISH_AUDIO_API_KEY',
  'NARRATION_FISH_AUDIO_API_KEY',
  'SMALLEST_AI_API_KEY',
  'SMALLEST_API_KEY',
  'TTS_SMALLEST_AI_API_KEY',
  'NARRATION_SMALLEST_AI_API_KEY',
];

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
let tempDir = '';

function resetEnv(values = {}) {
  for (const key of KEYS) {
    delete process.env[key];
  }
  process.env.PIPELINE_DISABLE_RUNTIME_ENV_FILE = '1';
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

try {
  resetEnv({
    OPENAI_API_KEY: 'global-openai',
    TEXT_OPENAI_API_KEY: 'text-openai',
    STORY_PACKAGE_OPENAI_API_KEY: 'story-package-openai',
  });
  assert.equal(selectTextApiKey('story_package_generation', 'openai'), 'text-openai');
  assert.equal(selectTextApiKey('research_and_script', 'openai'), 'text-openai');

  resetEnv({ OPENAI_API_KEY: 'global-openai' });
  assert.equal(selectTextApiKey('caption_and_hashtags', 'openai'), 'global-openai');

  resetEnv({ FINAL_QA_OPENAI_API_KEY: 'final-qa-openai', TEXT_OPENAI_API_KEY: 'text-openai' });
  assert.equal(selectTextApiKey('final_qa_validator', 'openai'), 'text-openai');

  resetEnv({ FINAL_QA_ANTHROPIC_API_KEY: 'final-qa-anthropic', TEXT_ANTHROPIC_API_KEY: 'text-anthropic', ANTHROPIC_API_KEY: 'global-anthropic' });
  assert.equal(selectTextApiKey('final_qa_validator', 'anthropic'), 'text-anthropic');

  resetEnv({ PREMIUM_TEXT_ANTHROPIC_API_KEY: 'premium-anthropic', TEXT_ANTHROPIC_API_KEY: 'text-anthropic' });
  assert.equal(selectTextApiKey('visual_prompt_builder', 'anthropic'), 'text-anthropic');
  assert.equal(selectTextApiKey('voice_performance_script', 'anthropic'), 'text-anthropic');
  assert.equal(selectTextApiKey('performance_feedback_analysis', 'anthropic'), 'text-anthropic');

  resetEnv({ AVATAR_OPENAI_API_KEY: 'avatar-openai', PREMIUM_TEXT_OPENAI_API_KEY: 'premium-openai', TEXT_OPENAI_API_KEY: 'text-openai' });
  assert.equal(selectTextApiKey('avatar_presenter_selector', 'openai'), 'text-openai');

  resetEnv({ AVATAR_ANTHROPIC_API_KEY: 'avatar-anthropic', PREMIUM_TEXT_ANTHROPIC_API_KEY: 'premium-anthropic', TEXT_ANTHROPIC_API_KEY: 'text-anthropic' });
  assert.equal(selectTextApiKey('avatar_presenter_selector', 'anthropic'), 'text-anthropic');

  resetEnv({ AVATAR_LLM_PROVIDER: 'anthropic', PREMIUM_TEXT_LLM_PROVIDER: 'openai', TEXT_LLM_PROVIDER: 'openai' });
  assert.equal(selectTextProvider('avatar_presenter_selector'), 'anthropic');

  resetEnv({ CAPTION_LLM_PROVIDER: 'openai', FINAL_QA_LLM_PROVIDER: 'openai', TEXT_LLM_PROVIDER: 'anthropic' });
  assert.equal(selectTextProvider('caption_and_hashtags'), 'openai');
  assert.equal(selectTextProvider('final_qa_validator'), 'openai');
  assert.equal(selectTextProvider('visual_prompt_builder'), 'anthropic');

  resetEnv({ PROMPT_BUILDER_ANTHROPIC_API_KEY: 'prompt-builder-anthropic', TEXT_ANTHROPIC_API_KEY: 'text-anthropic' });
  assert.equal(selectTextApiKey('prompt_builder', 'anthropic'), 'text-anthropic');

  resetEnv({ SCENE_IMAGE_OPENAI_API_KEY: 'scene-image-openai', IMAGE_OPENAI_API_KEY: 'image-openai', OPENAI_API_KEY: 'global-openai' });
  assert.equal(selectImageApiKey('scene_image', 'openai'), 'scene-image-openai');
  assert.equal(selectImageApiKey('post_image', 'openai'), 'image-openai');

  resetEnv({ SCENE_IMAGE_FAL_AI_API_KEY: 'scene-image-fal', IMAGE_FAL_AI_API_KEY: 'image-fal', FAL_AI_API_KEY: 'global-fal' });
  assert.equal(selectImageApiKey('scene_image', 'fal_ai'), 'scene-image-fal');
  assert.equal(selectImageApiKey('post_image', 'fal_ai'), 'image-fal');

  resetEnv({ WAN_REFERENCE_VIDEO_FAL_AI_API_KEY: 'wan-ref-fal', SCENE_VIDEO_FAL_AI_API_KEY: 'scene-video-fal', FAL_AI_API_KEY: 'global-fal' });
  assert.equal(selectVideoApiKey('wan_reference_video', 'fal_ai'), 'wan-ref-fal');
  assert.equal(selectVideoApiKey('scene_video', 'fal_ai'), 'scene-video-fal');

  resetEnv({ NARRATION_FISH_AUDIO_API_KEY: 'narration-fish', TTS_FISH_AUDIO_API_KEY: 'tts-fish', FISH_AUDIO_API_KEY: 'global-fish' });
  assert.equal(selectNarrationApiKey('fish_audio'), 'narration-fish');

  resetEnv({ TTS_SMALLEST_AI_API_KEY: 'tts-smallest', SMALLEST_AI_API_KEY: 'global-smallest' });
  assert.equal(selectNarrationApiKey('smallest_ai'), 'tts-smallest');

  resetEnv({});
  assert.equal(selectTextApiKey('idea_ingest', 'openai'), '');

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-env-'));
  const envFile = path.join(tempDir, '.env');
  fs.writeFileSync(envFile, [
    'TEXT_LLM_PROVIDER=anthropic',
    'TEXT_ANTHROPIC_API_KEY=runtime-text-anthropic',
    '',
  ].join('\n'));
  resetEnv({
    PIPELINE_DISABLE_RUNTIME_ENV_FILE: '',
    PIPELINE_RUNTIME_ENV_FILE: envFile,
  });
  assert.equal(selectTextProvider('avatar_presenter_selector'), 'anthropic');
  assert.equal(selectTextApiKey('avatar_presenter_selector', 'anthropic'), 'runtime-text-anthropic');

  process.stdout.write('provider key resolution ok\n');
} finally {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
