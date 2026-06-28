#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mapStoryPackageV2ToLegacyResponse } from '../workflows/scripts/story_package_v2_compat.mjs';

const sceneLines = Array.from({ length: 4 }, (_, index) => ({
  scene_number: index + 1,
  beat_label: `beat_${index + 1}`,
  start_time_seconds: index * 10,
  end_time_seconds: (index + 1) * 10,
  duration_seconds: 10,
  narration_text: `Scene ${index + 1} narration.`,
  dialogue_lines: [`Scene ${index + 1} narration.`],
}));

const mapped = mapStoryPackageV2ToLegacyResponse({
  clean_script: {
    hook_options: ['Hook one.', 'Hook two.', 'Hook three.'],
    selected_hook: 'Hook one.',
    narration_script: sceneLines.map((scene) => scene.narration_text).join(' '),
    short_script: 'Short summary.',
    scene_dialogue_lines: sceneLines,
  },
  caption_seed: {
    caption_draft: 'Caption draft.',
    cta_line: 'Save this.',
  },
  research_brief: {
    confidence_label: 'unverified',
    target_duration_seconds: 40,
  },
  narrative_strategy: {
    core_angle: 'A useful concrete angle.',
    point_of_view: 'Clear point of view.',
    emotional_arc: 'Question to payoff.',
    voice_strategy: 'Natural voice.',
    visual_strategy: 'Text-free documentary visuals.',
    music_strategy: 'Subtle music.',
  },
  downstream_constraints: {
    visual_constraints: {
      text_policy: 'No readable text.',
    },
  },
}, {
  title: 'Compatibility Test',
  reelType: 'image',
  targetDurationSeconds: 40,
  confidenceLabel: 'unverified',
});

assert.equal(mapped.scene_contract_json.expected_scene_count, 4);
assert.equal(mapped.scene_contract_json.expected_total_duration_seconds, 40);
assert.equal(mapped.scene_guidance_json.length, 4);
assert.equal(mapped.storyboard_json.length, 4);
assert.equal(mapped.scene_contract_json.expected_scene_count, mapped.scene_guidance_json.length);
assert.equal(mapped.scene_contract_json.expected_scene_count, mapped.storyboard_json.length);

process.stdout.write('PASS story package v2 compatibility contract\n');
