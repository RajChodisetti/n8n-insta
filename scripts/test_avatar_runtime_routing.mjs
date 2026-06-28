#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __avatarRuntimeTestHooks as avatarHooks } from '../pipeline/stages.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const ENV_KEYS = [
  'PIPELINE_DISABLE_RUNTIME_ENV_FILE',
  'HEYGEN_API_KEY',
  'HEYGEN_AVATAR_ID',
  'HEYGEN_VOICE_ID',
  'HEYGEN_CALLBACK_URL',
  'HEYGEN_MOCK_COMPLETED_URL',
  'ALLOW_VIDEO_TO_IMAGE_FALLBACK',
];
const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), 'utf8'));
}

function resetEnv(values = {}) {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.PIPELINE_DISABLE_RUNTIME_ENV_FILE = '1';
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

try {
  const activeDecision = await readJson('fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision_active_heygen.json');
  const fallbackDecision = await readJson('fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision_fallback_video.json');

  assert.equal(avatarHooks.avatarDecisionWantsProviderCall(activeDecision), true);
  assert.equal(avatarHooks.avatarDecisionWantsProviderCall(fallbackDecision), false);

  resetEnv({});
  const missingConfig = avatarHooks.getHeygenConfig({ failOnMissing: false });
  assert.deepEqual(missingConfig.missing, ['HEYGEN_API_KEY', 'HEYGEN_AVATAR_ID', 'HEYGEN_VOICE_ID']);
  const missingConfigReason = avatarHooks.avatarFallbackReason({
    decision: activeDecision,
    config: missingConfig,
    consentEvaluation: { allowed: true, errors: [] },
  });
  assert.match(missingConfigReason, /missing HeyGen configuration/);

  resetEnv({
    HEYGEN_API_KEY: 'dummy-key',
    HEYGEN_AVATAR_ID: 'heygen-avatar-sales-presenter-v1',
    HEYGEN_VOICE_ID: 'heygen-voice-sales-presenter-v1',
    HEYGEN_MOCK_COMPLETED_URL: 'https://cdn.example.test/avatar.mp4',
  });
  const configured = avatarHooks.getHeygenConfig({ failOnMissing: false });
  assert.equal(configured.configured, true);
  const missingConsentReason = avatarHooks.avatarFallbackReason({
    decision: activeDecision,
    config: configured,
    consentEvaluation: { allowed: false, errors: ['avatar consent_record_uri is required.'] },
  });
  assert.match(missingConsentReason, /consent_record_uri/);

  const safeOptions = avatarHooks.sanitizeHeygenRequestOptions({
    ...activeDecision,
    provider_request_options: {
      ...activeDecision.provider_request_options,
      captions: false,
      api_key: 'must-not-survive',
      voice_settings: {
        speed: 1,
        secret_token: 'must-not-survive',
      },
    },
  });
  assert.equal(safeOptions.aspect_ratio, '9:16');
  assert.equal('caption' in safeOptions, false);
  assert.equal('captions' in safeOptions, false);
  assert.equal('api_key' in safeOptions, false);
  assert.equal('secret_token' in safeOptions.voice_settings, false);

  const envAuthoritativeDecision = structuredClone(activeDecision);
  delete envAuthoritativeDecision.selected_route.provider_avatar_id;
  delete envAuthoritativeDecision.selected_route.provider_voice_id;
  delete envAuthoritativeDecision.presenter_profile.provider_identity.provider_avatar_id;
  delete envAuthoritativeDecision.presenter_profile.provider_identity.provider_voice_id;
  const envAuthoritativeReason = avatarHooks.avatarFallbackReason({
    decision: envAuthoritativeDecision,
    config: configured,
    consentEvaluation: { allowed: true, errors: [] },
  });
  assert.equal(envAuthoritativeReason, '');

  const requestBody = avatarHooks.buildHeygenRequestBody(
    {
      title: 'Runtime routing smoke',
      narration_script: 'This is the clean spoken narration.',
    },
    configured,
    activeDecision,
  );
  assert.equal(requestBody.avatar_id, 'heygen-avatar-sales-presenter-v1');
  assert.equal(requestBody.voice_id, 'heygen-voice-sales-presenter-v1');
  assert.equal(requestBody.script, 'This is the clean spoken narration.');
  assert.equal(requestBody.aspect_ratio, '9:16');
  assert.equal('caption' in requestBody, false);
  assert.equal('api_key' in requestBody, false);

  const sanitizedPrompt = avatarHooks.sanitizeGeneratedAssetPrompt(
    'Your Brain vs. an LLM — How AI Actually "Thinks" shown as a cinematic, text-free visual metaphor for: glowing neural threads and blank tablets, no readable labels or UI.',
    {
      title: 'Your Brain vs. an LLM — How AI Actually "Thinks"',
      narrationText: 'A human studies a machine-learning system without any labels in the room.',
      sceneNumber: 1,
    },
  );
  assert.doesNotMatch(sanitizedPrompt, /Your Brain|LLM|How AI Actually|text-free|readable labels/i);
  assert.match(sanitizedPrompt, /blank|machine|room|neural|tablets/i);

  resetEnv({});
  const strictVideoPayload = avatarHooks.buildAssetGenerationPayload({
    reel_type: 'video',
    storyboard_json: [],
    director_json: {},
    source_payload_json: {},
  }, 'wf_asset_generation_v3');
  assert.equal(strictVideoPayload.strict_video_assets, true);

  resetEnv({ ALLOW_VIDEO_TO_IMAGE_FALLBACK: 'true' });
  const permissiveVideoPayload = avatarHooks.buildAssetGenerationPayload({
    reel_type: 'video',
    storyboard_json: [],
    director_json: {},
    source_payload_json: {},
  }, 'wf_asset_generation_v3');
  assert.equal(permissiveVideoPayload.strict_video_assets, false);

  const metaPrompt = avatarHooks.sanitizeGeneratedAssetPrompt('No spoken narration. This Reel is driven entirely by visual scenarios and on-screen text overlays.', {
    title: 'Broken meta reel',
    narrationText: 'No spoken narration. The story speaks for itself.',
    sceneNumber: 1,
  });
  assert.equal(metaPrompt, '');
  assert.equal(avatarHooks.isMetaNarrationInstruction('No spoken narration. This Reel is driven entirely by visual scenarios.'), true);
  assert.equal(avatarHooks.isMetaNarrationInstruction('A receptionist watches three calls stack up while a customer waits.'), false);

  const preservedPlan = avatarHooks.fallbackPreservedAssetPlan({
    asset_type: 'image',
    asset_plan: {
      mode: 'image_with_motion',
      motion_requirement: 'medium',
      video_generation_required: false,
    },
    narration_text: 'The owner watches missed calls stack up during the lunch rush.',
  }, 1, []);
  assert.equal(preservedPlan.mode, 'image_with_motion');
  assert.equal(preservedPlan.video_generation_required, false);
  assert.equal(preservedPlan.avatar_fallback_preserved, true);

  resetEnv({});
  const avatarFallbackAssetPayload = avatarHooks.buildAssetGenerationPayload({
    reel_type: 'video',
    storyboard_json: [],
    director_json: {},
    source_payload_json: {
      requested_reel_type: 'avatar',
      effective_reel_type: 'video',
      avatar_fallback_preserve_asset_plan: true,
    },
  }, 'wf_asset_generation_v3');
  assert.equal(avatarFallbackAssetPayload.strict_video_assets, false);
  assert.equal(avatarFallbackAssetPayload.avatar_fallback_preserve_asset_plan, true);

  const storyboardScenes = Array.from({ length: 4 }, (_, index) => ({
    scene_number: index + 1,
    duration_seconds: 10,
    narration_text: `Scene ${index + 1} concrete spoken beat about missed calls and the Tuvi receptionist solution.`,
    dialogue_lines: [`Scene ${index + 1} concrete spoken beat about missed calls and the Tuvi receptionist solution.`],
    visual_prompt: `Realistic office service scene ${index + 1} with a business owner, phones, customers, and calm problem-solution action.`,
    transition: index === 0 ? 'cut' : 'soft_cut',
    mood: 'realistic',
    music_cue: 'quiet tension',
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
      motion_layers: ['parallax-style pan/zoom from the still image'],
      instructions: 'Use steady motion through the full scene slot.',
    },
  }));
  const manifest = avatarHooks.buildRenderManifest({
    content_id: '00000000-0000-4000-8000-000000000001',
    title: 'Storyboard timing regression',
    reel_type: 'video',
    storyboard_json: storyboardScenes,
    subtitle_lines_json: [],
    scene_assets_json: storyboardScenes.map((scene) => ({
      scene_number: scene.scene_number,
      asset_role: 'scene_image',
      provider: 'fixture',
      storage_url: `https://cdn.example.test/scene-${scene.scene_number}.jpg`,
      mime_type: 'image/jpeg',
      duration_seconds: scene.duration_seconds,
      width: 1080,
      height: 1920,
      metadata_json: {},
    })),
    scene_narration_assets_json: storyboardScenes.map((scene) => ({
      scene_number: scene.scene_number,
      provider: 'fixture_tts',
      storage_url: `https://cdn.example.test/scene-${scene.scene_number}.mp3`,
      mime_type: 'audio/mpeg',
      duration_seconds: 1.25,
      metadata_json: { speed: 1, voice: 'fixture' },
    })),
    render_manifest_seed_json: {
      output: { width: 1080, height: 1920, fps: 30, format: 'mp4' },
      timeline: storyboardScenes.map((scene) => ({
        scene_number: scene.scene_number,
        duration_seconds: scene.duration_seconds,
      })),
      subtitles: { enabled: false },
    },
  });
  assert.equal(manifest.duration_seconds, 40);
  assert.equal(manifest.render_manifest_json.timeline[0].duration_seconds, 10);
  assert.equal(manifest.render_manifest_json.timeline[0].planned_duration_seconds, 10);

  process.stdout.write('avatar runtime routing ok\n');
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
