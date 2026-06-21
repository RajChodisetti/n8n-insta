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
    system: 'director/system.md',
    user: 'director/user.md',
    schema: 'director/response-schema.json',
    outputKey: 'openai_request_director_contract',
    modelEnvKeys: ['DIRECTOR_CONTRACT_MODEL', 'DIRECTOR_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
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
    modelEnvKeys: ['TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4o-mini',
  },
  idea_prompt_profile: {
    system: 'idea_prompt_profile/system.md',
    user: 'idea_prompt_profile/user.md',
    schema: 'idea_prompt_profile/response-schema.json',
    outputKey: 'openai_request_idea_prompt_profile',
    modelEnvKeys: ['PROMPT_BUILDER_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
    fallbackModel: 'gpt-4o-mini',
  },
  story_package_generation: {
    system: 'story_package_generation/system.md',
    user: 'story_package_generation/user.md',
    schema: 'story_package_generation/response-schema.json',
    outputKey: 'openai_request_story_package_generation',
    modelEnvKeys: ['STORY_PACKAGE_MODEL', 'PREMIUM_TEXT_MODEL', 'OPENAI_STORY_PACKAGE_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'],
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
};

export async function buildStageRequest(stageKey, payload) {
  const stage = STAGES[stageKey];
  if (!stage) {
    throw new Error(`Unsupported prompt stage '${stageKey}'. Supported values: ${Object.keys(STAGES).sort().join(', ')}`);
  }

  const templateData = resolveStagePromptTemplateData(stageKey, payload.prompt_template_data ?? payload);
  const systemPrompt = await loadRenderedPromptAsset(stage.system, templateData);
  const userPrompt = await loadRenderedPromptAsset(stage.user, templateData);
  const responseSchema = await loadRenderedJsonAsset(stage.schema, templateData);
  const model = selectModel(stage.modelEnvKeys, stage.fallbackModel);
  if (!model) {
    throw new Error(`No model was configured for prompt stage '${stageKey}'.`);
  }
  const provider = selectTextProvider(stageKey);

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
