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
