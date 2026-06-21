#!/usr/bin/env node

import { buildStageRequest } from './build_prompt_request.mjs';
import { decodeBase64JsonArg } from './prompt_utils.mjs';
import { providerNotImplemented } from './adapter_config.mjs';
import { computeLlmCost } from './cost_calculator.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(message);
}

const RESPONSE_KEYS = {
  director_contract: {
    requestKey: 'openai_request_director_contract',
    responseKey: 'director_contract_response',
    modelKey: 'generation_model',
    providerKey: 'generation_provider',
    metadataKey: 'provider_metadata',
    passthroughKeys: ['content_id', 'title', 'target_duration_seconds', 'status_after_success'],
  },
  director: {
    requestKey: 'openai_request_director',
    responseKey: 'director_response',
    modelKey: 'generation_model',
    providerKey: 'generation_provider',
    metadataKey: 'provider_metadata',
    passthroughKeys: ['content_id', 'title', 'target_duration_seconds', 'status_after_success'],
  },
  research_and_script: {
    requestKey: 'openai_request',
    responseKey: 'llm_response',
    modelKey: 'generation_model',
    providerKey: 'generation_provider',
    metadataKey: 'provider_metadata',
    passthroughKeys: ['content_id', 'title', 'status_after_success', 'target_duration_seconds'],
  },
  idea_ingest: {
    requestKey: 'openai_request_idea_ingest',
    responseKey: 'idea_ingest_response',
    modelKey: 'generation_model',
    providerKey: 'generation_provider',
    metadataKey: 'provider_metadata',
    passthroughKeys: ['abstract_idea'],
  },
  idea_prompt_profile: {
    requestKey: 'openai_request_idea_prompt_profile',
    responseKey: 'idea_prompt_profile_response',
    modelKey: 'generation_model',
    providerKey: 'generation_provider',
    metadataKey: 'provider_metadata',
    passthroughKeys: ['abstract_idea'],
  },
  story_package_generation: {
    requestKey: 'openai_request_story_package_generation',
    responseKey: 'story_package_response',
    modelKey: 'generation_model',
    providerKey: 'generation_provider',
    metadataKey: 'provider_metadata',
    passthroughKeys: ['content_id', 'title', 'status_after_success', 'target_duration_seconds'],
  },
  story_package_generation_v2: {
    requestKey: 'openai_request_story_package_generation_v2',
    responseKey: 'story_package_v2_response',
    modelKey: 'generation_model',
    providerKey: 'generation_provider',
    metadataKey: 'provider_metadata',
    passthroughKeys: ['content_id', 'title', 'status_after_success', 'target_duration_seconds'],
  },
  storyboard_and_prompts: {
    requestKey: 'openai_request',
    responseKey: 'storyboard_response',
    modelKey: 'generation_model',
    providerKey: 'generation_provider',
    metadataKey: 'provider_metadata',
    passthroughKeys: ['content_id', 'status_after_success', 'target_duration_seconds', 'script_scene_guidance_json'],
  },
  caption_and_hashtags: {
    requestKey: 'openai_request_caption_and_hashtags',
    responseKey: 'caption_and_hashtags_response',
    modelKey: 'caption_model',
    providerKey: 'caption_provider',
    metadataKey: 'caption_provider_metadata',
    passthroughKeys: ['content_id', 'title', 'category', 'content_status', 'selected_hook', 'narration_script', 'caption_draft', 'cta_line', 'cover_prompt', 'existing_publish_status', 'brand_tone', 'publish_status_after_success', 'workflow_name', 'run_started_at', 'prompt_template_data', 'caption_and_hashtags_payload_base64'],
  },
  prompt_builder: {
    requestKey: 'openai_request_prompt_builder',
    responseKey: 'prompt_builder_response',
    modelKey: 'generation_model',
    providerKey: 'generation_provider',
    metadataKey: 'provider_metadata',
    passthroughKeys: ['prompt_path'],
  },
};

async function invokeOpenAi(request) {
  const apiKey = String(process.env.OPENAI_API_KEY || process.env.LLL_API_KEY || '').trim();
  if (!apiKey) {
    fail('Set OPENAI_API_KEY in the repo-root .env before running the text generation workflows. For backward compatibility, LLL_API_KEY is also accepted.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_generation',
          schema: request.response_schema,
          strict: true,
        },
      },
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    fail(`OpenAI structured generation failed (${response.status || 'no status'}): ${body?.error?.message ?? 'unknown error'}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    fail('OpenAI structured generation returned no message content.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    fail(`OpenAI structured generation returned invalid JSON: ${error.message}`);
  }

  return {
    model: String(body.model ?? request.model),
    parsed,
    providerMetadata: {
      response_id: body.id ?? null,
      usage: body.usage ?? null,
      finish_reason: body?.choices?.[0]?.finish_reason ?? null,
    },
  };
}

export async function invokeStructuredTextStage(stageKey, payload) {
  const responseConfig = RESPONSE_KEYS[stageKey];
  if (!responseConfig) {
    fail(`Unsupported text adapter stage '${stageKey}'.`);
  }

  const built = await buildStageRequest(stageKey, payload);
  const request = built[responseConfig.requestKey];
  if (!request) {
    fail(`buildStageRequest did not produce ${responseConfig.requestKey} for stage '${stageKey}'.`);
  }

  const provider = String(request.provider || built.llm_provider || 'openai').trim().toLowerCase();
  let result;
  if (provider === 'openai') {
    result = await invokeOpenAi(request);
  } else {
    providerNotImplemented('text generation', provider, stageKey);
  }

  const output = {};
  for (const key of responseConfig.passthroughKeys) {
    if (key in built) {
      output[key] = built[key];
    }
  }
  output.llm_provider = provider;
  output[responseConfig.providerKey] = provider;
  output[responseConfig.modelKey] = result.model;
  output[responseConfig.responseKey] = result.parsed;
  output[responseConfig.metadataKey] = result.providerMetadata;
  output.cost = computeLlmCost(result.model, result.providerMetadata?.usage ?? {}, undefined, provider);
  return output;
}

async function main() {
  const stageKey = String(process.argv[2] || '').trim();
  if (!stageKey) {
    fail(`Missing prompt stage key. Supported values: ${Object.keys(RESPONSE_KEYS).sort().join(', ')}`);
  }

  const payload = decodeBase64JsonArg(3);
  process.stdout.write(JSON.stringify(await invokeStructuredTextStage(stageKey, payload)));
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
