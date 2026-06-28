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
  'DIRECTOR_CONTRACT_ANTHROPIC_MODEL',
  'DIRECTOR_ANTHROPIC_MODEL',
  'IDEA_PROMPT_PROFILE_ANTHROPIC_MODEL',
  'PROMPT_BUILDER_ANTHROPIC_MODEL',
  'RESEARCH_ANTHROPIC_MODEL',
  'STORY_PACKAGE_ANTHROPIC_MODEL',
  'STORY_PACKAGE_V2_ANTHROPIC_MODEL',
  'PREMIUM_TEXT_MODEL',
  'PREMIUM_TEXT_ANTHROPIC_MODEL',
  'TEXT_MODEL',
  'TEXT_ANTHROPIC_MODEL',
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

function sharedTemplateData() {
  return {
    abstract_idea: 'A quiet mystery about a forgotten town reappearing.',
    topic: 'A forgotten town reappears when a reservoir dries up.',
    title: 'The Town Under the Reservoir',
    category: 'history',
    content_language: 'English',
    target_duration_seconds: 60,
    brand_tone: 'cinematic, concise, credible',
    narrator_style: 'calm, human, emotionally grounded',
    ending_signature_family: 'thought-provoking close',
    language_guidance: '',
    timing_guidance: 'Keep the hook crisp and scene boundaries clear.',
    confidence_context: 'Use cautious language where details are uncertain.',
    source_notes: 'Use only supplied facts.',
    creative_defaults_json: '{}',
    generated_topic_payload_json: '{}',
    prompt_profile_contract_json: '{}',
    reel_type: 'video',
    asset_generation_mode: 'video',
    visual_style_rules: 'cinematic realism, no readable text',
    client_account_context_summary: 'No account-specific overrides.',
    client_account_context_json: '{}',
    character_reference_context: '{}',
    rule_registry_summary: 'brand safety and factuality remain higher priority than style.',
    style_pack_registry_summary: 'Use a single consistent style pack.',
    narration_script: 'A town disappeared under water. Then, years later, the water pulled back.',
    scene_count: 3,
    script_scene_guidance_json: '[]',
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

  resetEnv({ TEXT_LLM_PROVIDER: 'anthropic', RESEARCH_ANTHROPIC_MODEL: 'claude-research-test', TEXT_ANTHROPIC_MODEL: 'claude-text-test' });
  const research = await buildStageRequest('research_and_script', { prompt_template_data: sharedTemplateData() });
  assert.equal(research.openai_request.provider, 'anthropic');
  assert.equal(research.openai_request.model, 'claude-research-test');

  resetEnv({ TEXT_LLM_PROVIDER: 'anthropic', STORY_PACKAGE_ANTHROPIC_MODEL: 'claude-story-test', TEXT_ANTHROPIC_MODEL: 'claude-text-test' });
  const storyPackage = await buildStageRequest('story_package_generation', { prompt_template_data: sharedTemplateData() });
  assert.equal(storyPackage.openai_request_story_package_generation.provider, 'anthropic');
  assert.equal(storyPackage.openai_request_story_package_generation.model, 'claude-story-test');
  assert.match(storyPackage.openai_request_story_package_generation.messages[0].content, /4 to 8 scenes/);
  assert.match(storyPackage.openai_request_story_package_generation.messages[0].content, /same number of scenes/);

  resetEnv({ TEXT_LLM_PROVIDER: 'anthropic', STORY_PACKAGE_ANTHROPIC_MODEL: 'claude-story-test', TEXT_ANTHROPIC_MODEL: 'claude-text-test' });
  const storyPackageV2Fallback = await buildStageRequest('story_package_generation_v2', { prompt_template_data: sharedTemplateData() });
  assert.equal(storyPackageV2Fallback.openai_request_story_package_generation_v2.provider, 'anthropic');
  assert.equal(storyPackageV2Fallback.openai_request_story_package_generation_v2.model, 'claude-story-test');
  assert.match(storyPackageV2Fallback.openai_request_story_package_generation_v2.messages[0].content, /4 to 8 scenes/);

  resetEnv({ TEXT_LLM_PROVIDER: 'anthropic', DIRECTOR_CONTRACT_ANTHROPIC_MODEL: 'claude-director-contract-test', DIRECTOR_ANTHROPIC_MODEL: 'claude-director-test' });
  const directorContract = await buildStageRequest('director_contract', { prompt_template_data: sharedTemplateData() });
  assert.equal(directorContract.openai_request_director_contract.provider, 'anthropic');
  assert.equal(directorContract.openai_request_director_contract.model, 'claude-director-contract-test');

  resetEnv({ TEXT_LLM_PROVIDER: 'anthropic', IDEA_PROMPT_PROFILE_ANTHROPIC_MODEL: 'claude-idea-profile-test', PROMPT_BUILDER_ANTHROPIC_MODEL: 'claude-prompt-builder-test' });
  const ideaPromptProfile = await buildStageRequest('idea_prompt_profile', { prompt_template_data: sharedTemplateData() });
  assert.equal(ideaPromptProfile.openai_request_idea_prompt_profile.provider, 'anthropic');
  assert.equal(ideaPromptProfile.openai_request_idea_prompt_profile.model, 'claude-idea-profile-test');

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
