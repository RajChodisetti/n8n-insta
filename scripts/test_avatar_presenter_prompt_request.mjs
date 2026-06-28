#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildStageRequest } from '../workflows/scripts/build_prompt_request.mjs';

const KEYS = [
  'PIPELINE_DISABLE_RUNTIME_ENV_FILE',
  'AVATAR_LLM_PROVIDER',
  'PREMIUM_TEXT_LLM_PROVIDER',
  'TEXT_LLM_PROVIDER',
  'AVATAR_MODEL',
  'AVATAR_ANTHROPIC_MODEL',
  'PREMIUM_TEXT_MODEL',
  'TEXT_MODEL',
  'OPENAI_TEXT_MODEL',
];
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function resetEnv(values = {}) {
  for (const key of KEYS) {
    delete process.env[key];
  }
  process.env.PIPELINE_DISABLE_RUNTIME_ENV_FILE = '1';
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

function avatarPayload() {
  return {
    content_id: '00000000-0000-4000-8000-000000000001',
    title: 'Avatar selector smoke',
    target_duration_seconds: 45,
    package_type: 'instagram_reel',
    prompt_template_data: {
      title: 'Avatar selector smoke',
      category: 'sales',
      package_type: 'instagram_reel',
      selected_style_pack: 'avatar_sales_outreach',
      client_account_context_json: '{"avatar_policy":{"avatar_allowed":true}}',
      story_package_context_json: '{"selected_hook":"A practical follow-up reminder."}',
      director_avatar_contract_json: '{"avatar_requested":true,"request_type":"synthetic_presenter"}',
      storyboard_plan_json: '[]',
      character_reference_context_json: '{}',
      presenter_profile_inventory_json: '[]',
      avatar_provider_inventory_json: '{"provider_name":"heygen","configured":false}',
      avatar_rules_summary: 'Use avatar only when consent, disclosure, provider identity, and safety pass; otherwise auto-downgrade to video.',
      heygen_capability_summary: 'Safe options include aspect_ratio, resolution, fit, background, caption, voice_settings, motion_prompt, expressiveness, and engine.',
    },
  };
}

try {
  resetEnv({ AVATAR_LLM_PROVIDER: 'openai', AVATAR_MODEL: 'gpt-avatar-test' });
  const openai = await buildStageRequest('avatar_presenter_selector', avatarPayload());
  assert.equal(openai.llm_provider, 'openai');
  assert.equal(openai.openai_request_avatar_presenter_selector.provider, 'openai');
  assert.equal(openai.openai_request_avatar_presenter_selector.model, 'gpt-avatar-test');
  assert.match(openai.openai_request_avatar_presenter_selector.messages[0].content, /active avatar presenter selector/i);
  assert.match(openai.openai_request_avatar_presenter_selector.messages[0].content, /HeyGen capability summary/i);
  assert.equal(openai.openai_request_avatar_presenter_selector.response_schema.properties.effective_reel_type.type, 'string');

  resetEnv({ AVATAR_LLM_PROVIDER: 'anthropic', AVATAR_ANTHROPIC_MODEL: 'claude-avatar-test' });
  const anthropic = await buildStageRequest('avatar_presenter_selector', avatarPayload());
  assert.equal(anthropic.llm_provider, 'anthropic');
  assert.equal(anthropic.openai_request_avatar_presenter_selector.provider, 'anthropic');
  assert.equal(anthropic.openai_request_avatar_presenter_selector.model, 'claude-avatar-test');

  process.stdout.write('avatar presenter prompt request ok\n');
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
