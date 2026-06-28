#!/usr/bin/env node

import assert from 'node:assert/strict';
import { __storyPackageGenerationTestHooks as hooks } from '../workflows/scripts/run_story_package_generation.mjs';

const response = {
  confidence_label: 'unverified',
  hook_option_1: 'Peak hour is where restaurant orders disappear.',
  hook_option_2: 'Your phone is not busy. It is leaking orders.',
  hook_option_3: 'The rush is not the problem. Missed calls are.',
  selected_hook: 'Peak hour is where restaurant orders disappear.',
  narration_script: [
    'Peak hour is where restaurant orders disappear.',
    'The phone rings while the counter is full.',
    'One missed call becomes one missed reservation.',
    'An AI receptionist answers instantly.',
    'It takes the booking, confirms the details, and never gets overwhelmed.',
    'If your team is busy, your phone still needs to sell.',
  ].join(' '),
  short_script: 'A restaurant loses peak-hour orders until an AI receptionist handles calls instantly.',
  caption_draft: 'Peak-hour missed calls are expensive. Fix the front desk bottleneck before the rush starts.',
  cta_line: 'DM AI to see the receptionist flow.',
  music_direction: 'Confident light tension with a practical payoff.',
  scene_contract_json: {
    expected_scene_count: 0,
    expected_total_duration_seconds: 0,
    scene_count_rationale: '',
  },
  scene_guidance_json: [],
  storyboard_json: [],
};

const result = hooks.repairStoryPackageSceneStructure(response, {
  targetDurationSeconds: 60,
  title: 'Your Restaurant Is Losing Orders Every Peak Hour',
  narrationScript: response.narration_script,
  reelType: 'avatar',
});

assert.equal(result.repairs.some((repair) => repair.field === 'scene_guidance_json'), true);
assert.equal(result.repairs.some((repair) => repair.field === 'storyboard_json'), true);
assert.equal(response.scene_guidance_json.length, 6);
assert.equal(response.storyboard_json.length, 6);
assert.equal(response.scene_contract_json.expected_scene_count, 6);
assert.equal(response.scene_contract_json.expected_total_duration_seconds, 60);

hooks.assertStoryPackageSceneArrays(response);
hooks.assertStoryPackageSceneContract(response, 60);

const sceneGuidance = hooks.normalizeTimedScenes(response.scene_guidance_json, 'scene_guidance_json', {
  title: 'Your Restaurant Is Losing Orders Every Peak Hour',
  reelType: 'avatar',
});
const storyboard = hooks.normalizeTimedScenes(response.storyboard_json, 'storyboard_json', {
  title: 'Your Restaurant Is Losing Orders Every Peak Hour',
  reelType: 'avatar',
});
hooks.validateScenes(sceneGuidance, storyboard, 60);

assert.equal(sceneGuidance[0].start_time_seconds, 0);
assert.equal(sceneGuidance.at(-1).end_time_seconds, 60);
assert.match(storyboard[0].visual_prompt, /Peak hour|Restaurant|orders/i);

process.stdout.write('PASS story package empty scene repair\n');
