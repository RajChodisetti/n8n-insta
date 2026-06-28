#!/usr/bin/env node

import {
  decodeBase64JsonArg,
  loadRenderedJsonAsset,
  loadRenderedPromptAsset,
  selectModel,
} from './prompt_utils.mjs';
import { selectTextProvider } from './adapter_config.mjs';
import { resolveStagePromptTemplateData } from './prompt_stage_defaults.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAGES = {
  director_contract: {
    system: 'workflow/director_contract.md',
    user: 'workflow/director_contract_user.md',
    schema: 'schemas/director_contract.schema.json',
    outputKey: 'openai_request_director_contract',
    modelEnvKeys: ['DIRECTOR_CONTRACT_MODEL', 'DIRECTOR_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    anthropicModelEnvKeys: ['DIRECTOR_CONTRACT_ANTHROPIC_MODEL', 'DIRECTOR_ANTHROPIC_MODEL', 'PREMIUM_TEXT_ANTHROPIC_MODEL', 'TEXT_ANTHROPIC_MODEL', 'ANTHROPIC_TEXT_MODEL', 'ANTHROPIC_MODEL'],
    fallbackModel: 'gpt-4.1-mini',
  },
  director: {
    system: 'director/system.md',
    user: 'director/user.md',
    schema: 'director/response-schema.json',
    outputKey: 'openai_request_director',
    modelEnvKeys: ['DIRECTOR_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4.1-mini',
  },
  research_and_script: {
    system: 'research_and_script/system.md',
    user: 'research_and_script/user.md',
    schema: 'research_and_script/response-schema.json',
    outputKey: 'openai_request',
    modelEnvKeys: ['RESEARCH_MODEL', 'OPENAI_RESEARCH_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4o-mini',
  },
  idea_ingest: {
    system: 'idea_ingest/system.md',
    user: 'idea_ingest/user.md',
    schema: 'idea_ingest/response-schema.json',
    outputKey: 'openai_request_idea_ingest',
    modelEnvKeys: ['IDEA_INGEST_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4o-mini',
  },
  idea_prompt_profile: {
    system: 'idea_prompt_profile/system.md',
    user: 'idea_prompt_profile/user.md',
    schema: 'idea_prompt_profile/response-schema.json',
    outputKey: 'openai_request_idea_prompt_profile',
    modelEnvKeys: ['IDEA_PROMPT_PROFILE_MODEL', 'PROMPT_BUILDER_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    anthropicModelEnvKeys: ['IDEA_PROMPT_PROFILE_ANTHROPIC_MODEL', 'PROMPT_BUILDER_ANTHROPIC_MODEL', 'TEXT_ANTHROPIC_MODEL', 'ANTHROPIC_TEXT_MODEL', 'ANTHROPIC_MODEL'],
    fallbackModel: 'gpt-4o-mini',
  },
  story_package_generation: {
    system: 'story_package_generation/system.md',
    user: 'story_package_generation/user.md',
    schema: 'story_package_generation/response-schema.json',
    outputKey: 'openai_request_story_package_generation',
    modelEnvKeys: ['STORY_PACKAGE_MODEL', 'PREMIUM_TEXT_MODEL', 'OPENAI_STORY_PACKAGE_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    anthropicModelEnvKeys: ['STORY_PACKAGE_ANTHROPIC_MODEL', 'PREMIUM_TEXT_ANTHROPIC_MODEL', 'TEXT_ANTHROPIC_MODEL', 'ANTHROPIC_TEXT_MODEL', 'ANTHROPIC_MODEL'],
    fallbackModel: 'gpt-4.1',
  },
  story_package_generation_v2: {
    system: 'workflow/story_package_generation_v2.md',
    user: 'workflow/story_package_generation_v2_user.md',
    schema: 'schemas/story_package.schema.json',
    outputKey: 'openai_request_story_package_generation_v2',
    modelEnvKeys: ['STORY_PACKAGE_V2_MODEL', 'STORY_PACKAGE_MODEL', 'PREMIUM_TEXT_MODEL', 'OPENAI_STORY_PACKAGE_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    anthropicModelEnvKeys: ['STORY_PACKAGE_V2_ANTHROPIC_MODEL', 'STORY_PACKAGE_ANTHROPIC_MODEL', 'PREMIUM_TEXT_ANTHROPIC_MODEL', 'TEXT_ANTHROPIC_MODEL', 'ANTHROPIC_TEXT_MODEL', 'ANTHROPIC_MODEL'],
    fallbackModel: 'gpt-4.1',
  },
  storyboard_and_prompts: {
    system: 'storyboard_and_prompts/system.md',
    user: 'storyboard_and_prompts/user.md',
    schema: 'storyboard_and_prompts/response-schema.json',
    outputKey: 'openai_request',
    modelEnvKeys: ['STORYBOARD_MODEL', 'OPENAI_STORYBOARD_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4o-mini',
  },
  caption_and_hashtags: {
    system: 'caption_and_hashtags/system.md',
    user: 'caption_and_hashtags/user.md',
    schema: 'caption_and_hashtags/response-schema.json',
    outputKey: 'openai_request_caption_and_hashtags',
    modelEnvKeys: ['CAPTION_MODEL', 'OPENAI_CAPTION_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4o-mini',
  },
  prompt_builder: {
    system: 'prompt_builder/system.md',
    user: 'prompt_builder/user.md',
    schema: 'prompt_builder/response-schema.json',
    outputKey: 'openai_request_prompt_builder',
    modelEnvKeys: ['PROMPT_BUILDER_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4o-mini',
  },
  visual_prompt_builder: {
    system: 'workflow/visual_prompt_builder.md',
    userText: 'Return the final provider-neutral visual prompt plan as JSON only.',
    schema: 'schemas/visual_prompt.schema.json',
    outputKey: 'openai_request_visual_prompt_builder',
    modelEnvKeys: ['VISUAL_PROMPT_MODEL', 'PROMPT_BUILDER_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4.1-mini',
    anthropicFallbackModel: 'claude-sonnet-4-6',
  },
  voice_performance_script: {
    system: 'workflow/voice_performance_script.md',
    userText: 'Return the voice performance metadata as JSON only.',
    schema: 'schemas/voice_performance.schema.json',
    outputKey: 'openai_request_voice_performance_script',
    modelEnvKeys: ['VOICE_PERFORMANCE_MODEL', 'PREMIUM_TEXT_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4.1-mini',
    anthropicFallbackModel: 'claude-sonnet-4-6',
  },
  avatar_presenter_selector: {
    system: 'workflow/avatar_video_selector.md',
    userText: 'Return the avatar route decision as JSON only.',
    schema: 'schemas/avatar_decision.schema.json',
    outputKey: 'openai_request_avatar_presenter_selector',
    modelEnvKeys: ['AVATAR_MODEL', 'PREMIUM_TEXT_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4.1-mini',
    anthropicFallbackModel: 'claude-sonnet-4-6',
  },
  final_qa_validator: {
    system: 'workflow/final_qa_validator.md',
    userText: 'Return the final QA verdict as JSON only.',
    schema: 'schemas/qa_result.schema.json',
    outputKey: 'openai_request_final_qa_validator',
    modelEnvKeys: ['FINAL_QA_MODEL', 'PREMIUM_TEXT_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4.1',
    anthropicFallbackModel: 'claude-sonnet-4-6',
  },
  performance_feedback_analysis: {
    system: 'workflow/performance_feedback_analysis.md',
    userText: 'Return the reusable performance guidance as JSON only.',
    schema: 'schemas/performance_guidance.schema.json',
    outputKey: 'openai_request_performance_feedback_analysis',
    modelEnvKeys: ['PERFORMANCE_FEEDBACK_MODEL', 'PREMIUM_TEXT_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4.1-mini',
    anthropicFallbackModel: 'claude-sonnet-4-6',
  },
};

function stageEnvPrefix(stageKey) {
  const normalized = String(stageKey || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const mapping = {
    storyboard_and_prompts: 'STORYBOARD',
    caption_and_hashtags: 'CAPTION',
    research_and_script: 'RESEARCH',
    director_contract: 'DIRECTOR',
    director: 'DIRECTOR',
    idea_prompt_profile: 'PROMPT_BUILDER',
    story_package_generation: 'STORY_PACKAGE',
    story_package_generation_v2: 'STORY_PACKAGE_V2',
    visual_prompt_builder: 'VISUAL_PROMPT',
    voice_performance_script: 'VOICE_PERFORMANCE',
    avatar_presenter_selector: 'AVATAR',
    final_qa_validator: 'FINAL_QA',
    performance_feedback_analysis: 'PERFORMANCE_FEEDBACK',
  };
  return mapping[normalized] || normalized.toUpperCase();
}

function selectStageModel(stageKey, stage, provider) {
  const normalizedProvider = String(provider || 'openai').trim().toLowerCase();
  if (normalizedProvider === 'anthropic' || normalizedProvider === 'claude') {
    const prefix = stageEnvPrefix(stageKey);
    const model = selectModel(
      stage.anthropicModelEnvKeys || [
        `${prefix}_ANTHROPIC_MODEL`,
        'PREMIUM_TEXT_ANTHROPIC_MODEL',
        'TEXT_ANTHROPIC_MODEL',
        'ANTHROPIC_TEXT_MODEL',
        'ANTHROPIC_MODEL',
      ],
      stage.anthropicFallbackModel || 'claude-sonnet-4-6',
    );
    return model;
  }
  return selectModel(stage.modelEnvKeys, stage.fallbackModel);
}

export async function buildStageRequest(stageKey, payload) {
  const stage = STAGES[stageKey];
  if (!stage) {
    throw new Error(`Unsupported prompt stage '${stageKey}'. Supported values: ${Object.keys(STAGES).sort().join(', ')}`);
  }

  const templateData = resolveStagePromptTemplateData(stageKey, payload.prompt_template_data ?? payload);
  const systemPrompt = await loadRenderedPromptAsset(stage.system, templateData);
  const userPrompt = stage.user
    ? await loadRenderedPromptAsset(stage.user, templateData)
    : String(stage.userText || 'Return JSON only.').trim();
  const responseSchema = await loadRenderedJsonAsset(stage.schema, templateData);
  const provider = selectTextProvider(stageKey);
  const model = selectStageModel(stageKey, stage, provider);
  if (!model) {
    throw new Error(`No model was configured for prompt stage '${stageKey}'.`);
  }

  return {
    ...payload,
    llm_provider: provider,
    [stage.outputKey]: {
      provider,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_schema: responseSchema,
    },
  };
}

async function main() {
  const stageKey = String(process.argv[2] || '').trim();
  if (!stageKey) {
    throw new Error(`Missing prompt stage key. Supported values: ${Object.keys(STAGES).sort().join(', ')}`);
  }

  const payload = decodeBase64JsonArg(3);
  process.stdout.write(JSON.stringify(await buildStageRequest(stageKey, payload)));
}

function isDirectExecution() {
  const argvPath = String(process.argv[1] || '').trim();
  if (!argvPath) {
    return false;
  }
  return path.resolve(argvPath) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
