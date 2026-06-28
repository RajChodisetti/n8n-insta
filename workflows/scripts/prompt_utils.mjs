#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstEnv, providerNotImplemented, selectTextApiKey, selectTextProvider } from './adapter_config.mjs';
import { getPromptBuilderHardRules, getRuntimePromptSafetyAppendix } from './prompt_hard_rules.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNTIME_PROMPT_BUILDER_FILE_NAME = '.runtime-prompt-builder.json';
const PROMPT_STEP_METADATA = Object.freeze({
  'idea_ingest/system.md': {
    stepKey: 'idea_ingest',
    stepTitle: 'Idea Ingest',
    label: 'System Prompt',
  },
  'idea_ingest/user.md': {
    stepKey: 'idea_ingest',
    stepTitle: 'Idea Ingest',
    label: 'User Prompt',
  },
  'idea_prompt_profile/system.md': {
    stepKey: 'idea_prompt_profile',
    stepTitle: 'Idea Prompt Profile',
    label: 'System Prompt',
  },
  'idea_prompt_profile/user.md': {
    stepKey: 'idea_prompt_profile',
    stepTitle: 'Idea Prompt Profile',
    label: 'User Prompt',
  },
  'story_package_generation/system.md': {
    stepKey: 'story_package_generation',
    stepTitle: 'Story Package V2',
    label: 'System Prompt',
  },
  'story_package_generation/user.md': {
    stepKey: 'story_package_generation',
    stepTitle: 'Story Package V2',
    label: 'User Prompt',
  },
  'research_and_script/system.md': {
    stepKey: 'research_and_script',
    stepTitle: 'Research & Script',
    label: 'System Prompt',
  },
  'research_and_script/user.md': {
    stepKey: 'research_and_script',
    stepTitle: 'Research & Script',
    label: 'User Prompt',
  },
  'director/system.md': {
    stepKey: 'director_contract',
    stepTitle: 'Director Contract',
    label: 'System Prompt',
  },
  'director/user.md': {
    stepKey: 'director_contract',
    stepTitle: 'Director Contract',
    label: 'User Prompt',
  },
  'workflow/director_contract.md': {
    stepKey: 'director_contract',
    stepTitle: 'Director Contract',
    label: 'System Prompt',
  },
  'workflow/director_contract_user.md': {
    stepKey: 'director_contract',
    stepTitle: 'Director Contract',
    label: 'User Prompt',
  },
  'storyboard_and_prompts/system.md': {
    stepKey: 'storyboard_and_prompts',
    stepTitle: 'Storyboard & Prompts',
    label: 'System Prompt',
  },
  'storyboard_and_prompts/user.md': {
    stepKey: 'storyboard_and_prompts',
    stepTitle: 'Storyboard & Prompts',
    label: 'User Prompt',
  },
  'caption_and_hashtags/system.md': {
    stepKey: 'caption_and_hashtags',
    stepTitle: 'Caption & Hashtags',
    label: 'System Prompt',
  },
  'caption_and_hashtags/user.md': {
    stepKey: 'caption_and_hashtags',
    stepTitle: 'Caption & Hashtags',
    label: 'User Prompt',
  },
  'scene_asset_generation/prompt.md': {
    stepKey: 'scene_asset_generation',
    stepTitle: 'Scene Image Generation',
    label: 'Image Prompt',
  },
  'narration_generation/instructions.md': {
    stepKey: 'narration_generation',
    stepTitle: 'Narration Generation',
    label: 'Voice Instructions',
  },
  'workflow/visual_prompt_builder.md': {
    stepKey: 'visual_prompt_builder',
    stepTitle: 'Visual Prompt Builder',
    label: 'Visual Prompt Contract',
  },
  'workflow/voice_performance_script.md': {
    stepKey: 'voice_performance_script',
    stepTitle: 'Voice Performance Script',
    label: 'Voice Performance Contract',
  },
  'workflow/avatar_video_selector.md': {
    stepKey: 'avatar_presenter_selector',
    stepTitle: 'Avatar Presenter Selector',
    label: 'Avatar Route Contract',
  },
  'workflow/final_qa_validator.md': {
    stepKey: 'final_qa_validator',
    stepTitle: 'Final QA Validator',
    label: 'QA Prompt',
  },
  'workflow/performance_feedback_analysis.md': {
    stepKey: 'performance_feedback_analysis',
    stepTitle: 'Performance Feedback Analysis',
    label: 'Feedback Prompt',
  },
  'post_image_generation/prompt.md': {
    stepKey: 'post_image_generation',
    stepTitle: 'Post Image Generation',
    label: 'Image Prompt',
  },
});
const DEFAULT_RUNTIME_PROMPT_BUILDER_TARGETS = Object.freeze([
  'story_package_generation',
  'research_and_script',
  'director_contract',
  'storyboard_and_prompts',
  'visual_prompt_builder',
  'voice_performance_script',
  'avatar_presenter_selector',
  'caption_and_hashtags',
  'final_qa_validator',
]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePromptPath(relativePath = '') {
  return String(relativePath || '').trim().replace(/^\/+/, '');
}

function normalizeStringArray(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function normalizeBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function sameStringSet(left = [], right = []) {
  const leftNormalized = normalizeStringArray(left).sort();
  const rightNormalized = normalizeStringArray(right).sort();
  if (leftNormalized.length !== rightNormalized.length) {
    return false;
  }
  return leftNormalized.every((value, index) => value === rightNormalized[index]);
}

function extractPlaceholders(content) {
  return normalizeStringArray(
    String(content || '')
      .match(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)
      ?.map((match) => match.replace(/[{}]/g, '').trim()) || [],
  );
}

function describePromptAsset(relativePath) {
  const clean = normalizePromptPath(relativePath);
  const metadata = PROMPT_STEP_METADATA[clean];
  if (metadata) {
    return {
      path: clean,
      ...metadata,
    };
  }

  const segments = clean.split('/');
  const stepKey = String(segments[0] || 'unknown').trim() || 'unknown';
  return {
    path: clean,
    stepKey,
    stepTitle: stepKey.replaceAll('_', ' '),
    label: path.basename(clean) || 'Prompt',
  };
}

function normalizeRuntimePromptBuilderConfig(config = {}) {
  const normalizedTargets = normalizeStringArray(config.targets);
  return {
    enabled: normalizeBoolean(config.enabled),
    idea: String(config.idea || '').trim(),
    instructions: String(config.instructions || '').trim(),
    targets: normalizedTargets.length ? normalizedTargets : [...DEFAULT_RUNTIME_PROMPT_BUILDER_TARGETS],
    updated_at: String(config.updated_at || '').trim() || null,
  };
}

function shouldApplyRuntimePromptBuilder(config, relativePath) {
  const promptMeta = describePromptAsset(relativePath);
  if (!config.enabled || !config.idea) {
    return false;
  }
  if (['prompt_builder', 'idea_ingest', 'idea_prompt_profile'].includes(promptMeta.stepKey)) {
    return false;
  }
  return config.targets.includes(promptMeta.stepKey) || config.targets.includes(promptMeta.path);
}

function appendRuntimePromptSafetyAppendix(relativePath, prompt) {
  const appendix = getRuntimePromptSafetyAppendix(relativePath);
  const normalizedPrompt = String(prompt || '').trim();
  if (!appendix) {
    return normalizedPrompt;
  }
  if (normalizedPrompt.includes('Runtime locked visual rules:')) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt}\n\n${appendix}`;
}

export function decodeBase64JsonArg(index = 2) {
  const encoded = String(process.argv[index] || '').trim();
  if (!encoded) {
    throw new Error('Missing base64 payload argument.');
  }

  try {
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Could not decode workflow payload: ${error.message}`);
  }
}

export async function resolvePromptsRoot() {
  const candidates = unique([
    String(process.env.PROMPTS_ROOT || '').trim(),
    '/prompts',
    path.resolve(__dirname, '../../prompts'),
  ]);

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) {
        return candidate;
      }
    } catch {}
  }

  throw new Error(
    `Could not locate prompts root. Checked: ${candidates.map((value) => `'${value}'`).join(', ')}`,
  );
}

export async function resolveRuntimePromptBuilderConfigPath() {
  return path.join(await resolvePromptsRoot(), RUNTIME_PROMPT_BUILDER_FILE_NAME);
}

export async function readPromptAsset(relativePath) {
  const promptsRoot = await resolvePromptsRoot();
  const filePath = path.join(promptsRoot, relativePath);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Could not read prompt asset '${relativePath}': ${error.message}`);
  }
}

export function renderTemplate(template, templateData = {}) {
  const missingKeys = new Set();
  const rendered = String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    if (!(key in templateData)) {
      missingKeys.add(key);
      return '';
    }
    const value = templateData[key];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  });

  if (missingKeys.size > 0) {
    throw new Error(`Missing prompt template data for: ${Array.from(missingKeys).sort().join(', ')}`);
  }

  return rendered.replace(/\r\n/g, '\n').trim();
}

export async function readRuntimePromptBuilderConfig() {
  try {
    const configPath = await resolveRuntimePromptBuilderConfigPath();
    const raw = await fs.readFile(configPath, 'utf8');
    return normalizeRuntimePromptBuilderConfig(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return normalizeRuntimePromptBuilderConfig();
    }
    throw new Error(`Could not read runtime prompt builder config: ${error.message}`);
  }
}

async function loadRenderedPromptAssetInternal(relativePath, templateData = {}, { applyRuntimeBuilder = true } = {}) {
  const template = await readPromptAsset(relativePath);
  const rendered = renderTemplate(template, templateData);
  if (!applyRuntimeBuilder) {
    return rendered;
  }
  const runtimeDraft = await buildRuntimePromptDraft(relativePath, rendered);
  return runtimeDraft.draft;
}

async function invokeOpenAiStructuredRequest(request) {
  const apiKey = String(selectTextApiKey('prompt_builder', 'openai')).trim();
  if (!apiKey) {
    throw new Error('Set PROMPT_BUILDER_OPENAI_API_KEY, TEXT_OPENAI_API_KEY, or OPENAI_API_KEY before using the runtime prompt builder. For backward compatibility, LLL_API_KEY is also accepted.');
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
          name: 'runtime_prompt_builder',
          schema: request.response_schema,
          strict: true,
        },
      },
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(`OpenAI runtime prompt builder failed (${response.status || 'no status'}): ${body?.error?.message ?? 'unknown error'}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI runtime prompt builder returned no message content.');
  }

  try {
    return {
      parsed: JSON.parse(content),
      model: String(body.model ?? request.model),
      provider: 'openai',
    };
  } catch (error) {
    throw new Error(`OpenAI runtime prompt builder returned invalid JSON: ${error.message}`);
  }
}

function anthropicSystemAndMessages(messages = []) {
  const system = [];
  const conversation = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = String(message?.role || '').trim().toLowerCase();
    const content = String(message?.content || '').trim();
    if (!content) {
      continue;
    }
    if (role === 'system') {
      system.push(content);
    } else if (role === 'assistant') {
      conversation.push({ role: 'assistant', content });
    } else {
      conversation.push({ role: 'user', content });
    }
  }
  if (conversation.length === 0) {
    conversation.push({ role: 'user', content: 'Return the requested JSON object only.' });
  }
  return {
    system: system.join('\n\n'),
    messages: conversation,
  };
}

function parseStructuredJsonText(text, providerName) {
  const content = String(text || '').trim();
  if (!content) {
    throw new Error(`${providerName} runtime prompt builder returned empty text content.`);
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {}
    }
    throw new Error(`${providerName} runtime prompt builder returned invalid JSON: ${error.message}`);
  }
}

async function invokeAnthropicStructuredRequest(request) {
  const apiKey = String(selectTextApiKey('prompt_builder', 'anthropic')).trim();
  if (!apiKey) {
    throw new Error('Set PROMPT_BUILDER_ANTHROPIC_API_KEY, TEXT_ANTHROPIC_API_KEY, or ANTHROPIC_API_KEY before using the runtime prompt builder with Anthropic.');
  }

  const { system, messages } = anthropicSystemAndMessages(request.messages);
  const toolName = 'runtime_prompt_builder';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': firstEnv(['ANTHROPIC_VERSION']) || '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: Number.parseInt(firstEnv(['ANTHROPIC_MAX_TOKENS']) || '4096', 10) || 4096,
      ...(system ? { system } : {}),
      messages,
      tools: [
        {
          name: toolName,
          description: 'Return the revised prompt builder JSON response.',
          input_schema: request.response_schema,
        },
      ],
      tool_choice: {
        type: 'tool',
        name: toolName,
      },
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(`Anthropic runtime prompt builder failed (${response.status || 'no status'}): ${body?.error?.message ?? 'unknown error'}`);
  }
  const toolUse = Array.isArray(body.content)
    ? body.content.find((entry) => entry?.type === 'tool_use' && entry?.name === toolName)
    : null;
  const parsed = toolUse?.input && typeof toolUse.input === 'object'
    ? toolUse.input
    : parseStructuredJsonText(
        Array.isArray(body.content)
          ? body.content.map((entry) => entry?.text || '').filter(Boolean).join('\n')
          : '',
        'Anthropic',
      );
  return {
    parsed,
    model: String(body.model ?? request.model),
    provider: 'anthropic',
  };
}

async function invokeRuntimePromptBuilder(request) {
  const provider = String(request.provider || 'openai').trim().toLowerCase();
  if (provider === 'openai') {
    return invokeOpenAiStructuredRequest(request);
  }
  if (provider === 'anthropic' || provider === 'claude') {
    return invokeAnthropicStructuredRequest(request);
  }
  providerNotImplemented('text generation', provider, 'prompt_builder');
}

function selectRuntimePromptBuilderModel(provider) {
  const normalizedProvider = String(provider || 'openai').trim().toLowerCase();
  if (normalizedProvider === 'anthropic' || normalizedProvider === 'claude') {
    return selectModel(
      ['PROMPT_BUILDER_ANTHROPIC_MODEL', 'TEXT_ANTHROPIC_MODEL', 'ANTHROPIC_TEXT_MODEL', 'ANTHROPIC_MODEL'],
      'claude-sonnet-4-6',
    );
  }
  return selectModel(['PROMPT_BUILDER_MODEL', 'TEXT_MODEL', 'OPENAI_TEXT_MODEL'], 'gpt-4o-mini');
}

export async function buildRuntimePromptDraft(relativePath, currentPrompt, runtimePromptBuilderConfig = null) {
  const promptMeta = describePromptAsset(relativePath);
  const normalizedPrompt = String(currentPrompt || '').replace(/\r\n/g, '\n').trim();
  const placeholders = extractPlaceholders(normalizedPrompt);
  const config = normalizeRuntimePromptBuilderConfig(runtimePromptBuilderConfig ?? await readRuntimePromptBuilderConfig());

  if (!normalizedPrompt || !shouldApplyRuntimePromptBuilder(config, relativePath)) {
    return {
      applied: false,
      draft: normalizedPrompt,
      summary: '',
      promptMeta,
      placeholders,
      hard_rules: getPromptBuilderHardRules(relativePath),
      generation_provider: null,
      generation_model: null,
    };
  }

  const systemPrompt = await loadRenderedPromptAssetInternal(
    'prompt_builder/system.md',
    { hard_rules_json: JSON.stringify(getPromptBuilderHardRules(relativePath), null, 2) },
    { applyRuntimeBuilder: false },
  );
  const userPrompt = await loadRenderedPromptAssetInternal(
    'prompt_builder/user.md',
    {
      prompt_path: promptMeta.path,
      prompt_label: promptMeta.label,
      prompt_step_title: promptMeta.stepTitle,
      current_prompt: normalizedPrompt,
      placeholders_json: JSON.stringify(placeholders, null, 2),
      placeholder_help_json: JSON.stringify([], null, 2),
      hard_rules_json: JSON.stringify(getPromptBuilderHardRules(relativePath), null, 2),
      idea: config.idea,
      additional_instructions: config.instructions || 'None provided.',
    },
    { applyRuntimeBuilder: false },
  );
  const responseSchema = await loadRenderedJsonAsset(
    'prompt_builder/response-schema.json',
    {},
    { applyRuntimeBuilder: false },
  );
  const provider = selectTextProvider('prompt_builder');
  const request = {
    provider,
    model: selectRuntimePromptBuilderModel(provider),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_schema: responseSchema,
  };
  const result = await invokeRuntimePromptBuilder(request);
  const draft = String(result?.parsed?.revised_prompt || '').replace(/\r\n/g, '\n').trim();
  const draftPlaceholders = extractPlaceholders(draft);
  if (!draft) {
    throw new Error(`Runtime prompt builder returned an empty prompt for '${promptMeta.path}'.`);
  }
  if (!sameStringSet(placeholders, draftPlaceholders)) {
    throw new Error(`Runtime prompt builder changed placeholders for '${promptMeta.path}'.`);
  }

  return {
    applied: true,
    draft: appendRuntimePromptSafetyAppendix(relativePath, draft),
    summary: String(result?.parsed?.change_summary || '').trim(),
    promptMeta,
    placeholders,
    hard_rules: getPromptBuilderHardRules(relativePath),
    generation_provider: String(result?.provider || request.provider || 'openai').trim() || 'openai',
    generation_model: String(result?.model || request.model || '').trim(),
  };
}

export async function loadRenderedPromptAsset(relativePath, templateData = {}, options = {}) {
  return loadRenderedPromptAssetInternal(relativePath, templateData, options);
}

export async function loadRenderedJsonAsset(relativePath, templateData = {}, { applyRuntimeBuilder = false } = {}) {
  const rendered = await loadRenderedPromptAssetInternal(relativePath, templateData, { applyRuntimeBuilder });
  try {
    return JSON.parse(rendered);
  } catch (error) {
    throw new Error(`Could not parse JSON prompt asset '${relativePath}': ${error.message}`);
  }
}

export function selectModel(envKeys = [], fallback) {
  return firstEnv(envKeys) || String(fallback || '').trim();
}

export function toBase64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}
