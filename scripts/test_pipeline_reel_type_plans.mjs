#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  getPipelineStagesForAction,
  normalizeReelType,
} from '../pipeline/runs.mjs';

assert.deepEqual(
  getPipelineStagesForAction('generate_reel', { reelType: 'image' }),
  [
    'story_package_generation',
    'story_package_quality_gate',
    'director_contract',
    'visual_prompt_builder',
    'image_asset_generation',
    'voice_performance_script',
    'narration_generation',
    'remotion_manifest',
    'remotion_render',
    'caption_and_hashtags',
    'final_qa_approval_gate',
  ],
);

assert.deepEqual(
  getPipelineStagesForAction('generate_reel', { reelType: 'video' }),
  [
    'story_package_generation',
    'story_package_quality_gate',
    'director_contract',
    'visual_prompt_builder',
    'asset_generation_v3',
    'voice_performance_script',
    'narration_generation',
    'remotion_manifest',
    'remotion_render',
    'caption_and_hashtags',
    'final_qa_approval_gate',
  ],
);

assert.deepEqual(
  getPipelineStagesForAction('generate_reel', { reelType: 'avatar' }),
  [
    'story_package_generation',
    'story_package_quality_gate',
    'director_contract',
    'visual_prompt_builder',
    'avatar_presenter_selector',
    'avatar_media_generation',
    'remotion_manifest',
    'remotion_render',
    'caption_and_hashtags',
    'final_qa_approval_gate',
  ],
);

assert.deepEqual(
  getPipelineStagesForAction('publish_approved_reel'),
  ['instagram_reel_publish'],
);

assert.deepEqual(
  getPipelineStagesForAction('analyze_performance'),
  ['performance_feedback_analysis'],
);

assert.equal(normalizeReelType('', { fallback: 'video' }), 'video');
assert.throws(() => normalizeReelType('carousel'), /Unsupported reel_type/);

process.stdout.write('pipeline reel type plans ok\n');
