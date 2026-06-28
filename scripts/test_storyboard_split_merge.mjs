#!/usr/bin/env node

import assert from 'node:assert/strict';
import { __storyboardSplitTestHooks as hooks } from '../pipeline/stages.mjs';

const storyboardJson = Array.from({ length: 4 }, (_, index) => ({
  scene_number: index + 1,
  duration_seconds: 10,
  narration_text: `Original scene ${index + 1} narration stays intact.`,
  dialogue_lines: [`Original scene ${index + 1} narration stays intact.`],
  visual_prompt: `Original concrete visual prompt ${index + 1} with subject action environment and no readable text.`,
  transition: index === 0 ? 'cut' : 'soft_cut',
  mood: 'focused',
  music_cue: 'quiet pulse',
  tts_instructions: 'Natural delivery.',
  asset_type: 'image',
  asset_plan: {
    mode: 'image_with_motion',
    provider_intent: 'remotion_motion',
    motion_requirement: 'medium',
    video_generation_required: false,
    fallback_mode: 'image_with_motion',
  },
  remotion: {
    camera_move: 'push_in',
    pan_zoom_direction: 'center_push',
    motion_intensity: 'medium',
    transition_type: index === 0 ? 'cut' : 'soft_cut',
    overlay_style: 'subtle_vignette',
    pacing: 'steady',
    motion_layers: ['parallax pan'],
    instructions: 'Steady motion.',
  },
}));

const shotPlan = {
  storyboard_version: '1.0',
  source_stage: 'storyboard_and_shot_plan',
  target_duration_seconds: 40,
  selected_style_pack: 'founder_explainer',
  plan_summary: 'Refined scene jobs without changing downstream structure.',
  visual_prompt_boundary: 'This contract defines shot intent only. Session 9 visual prompt builder creates final image/video prompts later.',
  continuity_plan: {
    visual_continuity_rules: ['Keep one workspace.'],
    character_continuity: 'Keep generic characters.',
    text_policy: 'No readable text.',
    factual_boundary: 'Use only supplied facts.',
  },
  caption_plan: {
    overall_caption_intent: 'Practical founder caption.',
    cta_intent: 'Save this.',
    hashtag_intent: 'Founder/product tags later.',
    do_not_include: ['Unsupported metrics'],
  },
  asset_plan: {
    asset_sequence: storyboardJson.map((scene) => ({ scene_number: scene.scene_number, asset_need: 'image' })),
    image_video_policy: 'Stills with motion.',
    provider_selection_policy: 'Downstream adapters decide.',
    handoff_notes: ['Keep visual prompts downstream.'],
  },
  voice_line_map: storyboardJson.map((scene) => ({
    voice_line_id: `v${String(scene.scene_number).padStart(2, '0')}`,
    scene_number: scene.scene_number,
    line_text: scene.narration_text,
    delivery_intent: 'Preserve the line.',
  })),
  scenes: storyboardJson.map((scene, index) => ({
    scene_number: scene.scene_number,
    beat_id: `beat_${scene.scene_number}`,
    beat_label: index === 0 ? 'hook' : `beat_${scene.scene_number}`,
    start_time_seconds: index * 10,
    end_time_seconds: (index + 1) * 10,
    duration_seconds: 10,
    narration_text: `Changed scene ${scene.scene_number} narration must not overwrite existing.`,
    dialogue_lines: [`Changed scene ${scene.scene_number} narration must not overwrite existing.`],
    voice_line_ids: [`v${String(scene.scene_number).padStart(2, '0')}`],
    asset_need: 'image',
    shot_intent: {
      framing: 'Medium-close vertical frame.',
      subject: `Founder workspace scene ${scene.scene_number}.`,
      action: 'Hands group anonymous cards into a clear pattern.',
      environment: 'Warm desk with blank cards and no readable UI.',
      camera_motion: 'Subtle push-in.',
      emotional_distance: 'Practical and grounded.',
      visual_evidence: 'Blank cards and grouped notes show the scene job.',
    },
    transition_intent: index === 0 ? 'cut' : 'soft cut',
    caption_intent: 'Support the scene beat.',
    music_sfx_intent: 'Soft pulse.',
    tts_delivery_intent: 'Clear and natural.',
    qa_focus: ['No readable text.'],
    constraints: {
      text_policy: 'No readable text.',
      factual_boundary: 'Use only supplied facts.',
      avoid: ['Fake UI'],
    },
  })),
  risk_flags: [{
    risk_id: 'text_risk',
    severity: 'watch',
    description: 'Avoid readable cards.',
    mitigation: 'Keep cards blank.',
    blocks_publish: false,
  }],
  qa_focus: ['Scene count stays stable.'],
};

const merged = hooks.mergeStoryboardAndShotPlan({
  title: 'Storyboard Split Regression',
  reelType: 'image',
  targetDurationSeconds: 40,
  rawResponseJson: { parsed_response: {} },
  storyboardJson,
  sceneGuidanceJson: storyboardJson.map((scene) => ({
    scene_number: scene.scene_number,
    beat_label: `beat_${scene.scene_number}`,
    image_prompt: scene.visual_prompt,
  })),
  renderManifestSeedJson: {
    output: { width: 1080, height: 1920, fps: 30, format: 'mp4' },
    subtitles: { enabled: false },
  },
  shotPlan,
});

assert.equal(merged.storyboardJson.length, storyboardJson.length);
assert.equal(merged.sceneGuidanceJson.length, storyboardJson.length);
assert.equal(merged.renderManifestSeedJson.timeline.length, storyboardJson.length);
assert.equal(merged.rawResponseJson.storyboard_and_shot_plan_json, shotPlan);
assert.equal(merged.storyboardJson[0].narration_text, storyboardJson[0].narration_text);
assert.match(merged.storyboardJson[0].visual_prompt, /Founder workspace scene 1|group anonymous cards/i);
assert.equal(merged.totalDurationSeconds, 40);

assert.throws(() => hooks.mergeStoryboardAndShotPlan({
  title: 'Broken structure',
  reelType: 'image',
  targetDurationSeconds: 40,
  storyboardJson,
  shotPlan: { ...shotPlan, scenes: shotPlan.scenes.slice(0, 3) },
}), /preserve scene count/);

process.stdout.write('PASS storyboard split merge\n');
