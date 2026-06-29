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

const repaired = hooks.mergeStoryboardAndShotPlan({
  title: 'Storyboard Split Empty Scene Repair',
  reelType: 'avatar',
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
  shotPlan: {
    ...shotPlan,
    asset_plan: { ...shotPlan.asset_plan, asset_sequence: [] },
    voice_line_map: [],
    scenes: [],
  },
});

assert.equal(repaired.storyboardJson.length, storyboardJson.length);
assert.equal(repaired.sceneGuidanceJson.length, storyboardJson.length);
assert.equal(repaired.renderManifestSeedJson.timeline.length, storyboardJson.length);
assert.equal(repaired.shotPlan.scenes.length, storyboardJson.length);
assert.equal(repaired.shotPlan.voice_line_map.length, storyboardJson.length);
assert.equal(repaired.repairEvents[0].repair_reason, 'model_returned_empty_scene_array');
assert.equal(repaired.repairEvents[0].repaired_count, storyboardJson.length);
assert.match(repaired.repairs.join('\n'), /rebuilt 4 scene shot plan/);
assert.equal(repaired.storyboardJson[0].narration_text, storyboardJson[0].narration_text);
assert.equal(repaired.storyboardJson[0].asset_type, 'video');
assert.equal(repaired.rawResponseJson.storyboard_and_shot_plan_json.scenes.length, storyboardJson.length);
assert.equal(repaired.rawResponseJson.parsed_response.storyboard_and_shot_plan_repair_json[0].repair_source, 'storyboard_json');

assert.throws(() => hooks.mergeStoryboardAndShotPlan({
  title: 'Broken structure',
  reelType: 'image',
  targetDurationSeconds: 40,
  storyboardJson,
  shotPlan: { ...shotPlan, scenes: shotPlan.scenes.slice(0, 3) },
}), /preserve scene count/);

const crisisStoryboard = storyboardJson.map((scene, index) => ({
  ...scene,
  narration_text: index === 0
    ? 'Officials tell residents near the plant to leave quickly as the emergency zone expands.'
    : (index === 1
      ? 'The next step is coordinated action between responders, buses, checkpoints, and shelter staff.'
      : scene.narration_text),
  dialogue_lines: [index === 0
    ? 'Officials tell residents near the plant to leave quickly as the emergency zone expands.'
    : (index === 1
      ? 'The next step is coordinated action between responders, buses, checkpoints, and shelter staff.'
      : scene.narration_text)],
  storyboard_shot_intent: {
    subject: index === 0 ? 'Residents moving away from a controlled emergency perimeter.' : 'Responders coordinating evacuation logistics.',
    action: index === 0 ? 'People leave with small bags while responders direct the route.' : 'Buses, responders, and shelter volunteers coordinate movement.',
    environment: 'A realistic disaster-response setting with blank unmarked barriers and no readable signs.',
    visual_evidence: 'Protective equipment, controlled streets, vehicles, and orderly evacuation movement.',
  },
}));

const visualPlan = {
  global_continuity: {
    style_summary: 'Restrained documentary crisis coverage.',
    continuity_requirements: ['Keep emergency infrastructure and responder context consistent.'],
    character_continuity: 'No romantic couple or unrelated recurring character.',
    environment_continuity: 'Controlled evacuation areas, vehicles, shelters, and infrastructure.',
  },
  text_policy: {
    generated_asset_policy: 'No readable text, labels, logos, captions, signage, or UI in generated assets.',
  },
  prompts: crisisStoryboard.map((scene, index) => ({
    scene_number: scene.scene_number,
    subject: index === 0 ? 'A couple holding hands during a crisis.' : (index === 1 ? 'Military cadets in formation.' : `Scene ${scene.scene_number} grounded subject.`),
    environment: 'Realistic emergency environment.',
    composition: 'Vertical 9:16 documentary frame with concrete foreground action.',
    camera: 'Handheld documentary camera feel.',
    motion: 'Slow controlled movement.',
    lighting: 'Natural overcast daylight.',
    style: 'Restrained factual documentary style.',
    continuity_requirements: ['Keep evacuation context consistent.'],
    text_policy: 'No readable text.',
    visual_prompt: index === 0
      ? 'A romantic couple holding hands in a cinematic evacuation scene.'
      : (index === 1
        ? 'Military cadets holding guns while coordinating action in formation.'
        : `Cinematic vertical 9:16 factual emergency scene ${scene.scene_number} with concrete responders, vehicles, and controlled spaces.`),
    negative_prompt: 'readable text, labels, logos, captions, signage, UI, watermarks',
    fallback_prompt: `Cinematic vertical 9:16 factual emergency scene ${scene.scene_number} with concrete evacuation evidence and no readable text.`,
  })),
};

const visualMerged = hooks.mergeVisualPromptPlan(crisisStoryboard, visualPlan, {
  title: 'Fukushima Evacuation Timing',
});

assert.match(visualMerged[0].visual_prompt, /Residents moving away|leave quickly|emergency zone/i);
assert.doesNotMatch(visualMerged[0].visual_prompt, /holding hands/i);
assert.match(visualMerged[0].visual_prompt_builder.repaired_unrelated_visual_metaphor, /romance/i);
assert.match(visualMerged[1].visual_prompt, /Responders coordinating|buses|shelter staff/i);
assert.doesNotMatch(visualMerged[1].visual_prompt, /holding guns/i);
assert.match(visualMerged[1].visual_prompt_builder.repaired_unrelated_visual_metaphor, /military/i);
assert.match(visualMerged[1].visual_prompt, /Continuity/i);

process.stdout.write('PASS storyboard split merge\n');
