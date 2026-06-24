#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  selectImageApiKey,
  selectNarrationApiKey,
  selectTextApiKey,
  selectVideoApiKey,
} from '../workflows/scripts/adapter_config.mjs';

const KEYS = [
  'OPENAI_API_KEY',
  'LLL_API_KEY',
  'TEXT_OPENAI_API_KEY',
  'IDEA_INGEST_OPENAI_API_KEY',
  'PROMPT_BUILDER_OPENAI_API_KEY',
  'STORY_PACKAGE_OPENAI_API_KEY',
  'STORY_PACKAGE_V2_OPENAI_API_KEY',
  'DIRECTOR_OPENAI_API_KEY',
  'RESEARCH_OPENAI_API_KEY',
  'STORYBOARD_OPENAI_API_KEY',
  'CAPTION_OPENAI_API_KEY',
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

function resetEnv(values = {}) {
  for (const key of KEYS) {
    delete process.env[key];
  }
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
  assert.equal(selectTextApiKey('story_package_generation', 'openai'), 'story-package-openai');
  assert.equal(selectTextApiKey('research_and_script', 'openai'), 'text-openai');

  resetEnv({ OPENAI_API_KEY: 'global-openai' });
  assert.equal(selectTextApiKey('caption_and_hashtags', 'openai'), 'global-openai');

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

  process.stdout.write('provider key resolution ok\n');
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
