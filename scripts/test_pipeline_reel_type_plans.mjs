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
    'image_asset_generation',
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
    'asset_generation_v3',
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
    'avatar_consent_gate',
    'heygen_avatar_generation',
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

assert.equal(normalizeReelType('', { fallback: 'video' }), 'video');
assert.throws(() => normalizeReelType('carousel'), /Unsupported reel_type/);

process.stdout.write('pipeline reel type plans ok\n');
