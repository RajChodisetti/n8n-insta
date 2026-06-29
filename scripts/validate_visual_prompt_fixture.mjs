#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/visual_prompt.schema.json');

const bannedKeys = new Set([
  'provider',
  'model',
  'host',
  'bucket',
  'storage',
  'render',
  'render_engine',
  'publish',
  'api_parameters',
]);
const providerNamePattern = /\b(openai|fal|fish_audio|smallest_ai|gcs|google_cloud_storage|minio|s3|ffmpeg|remotion|wan|meta graph)\b/i;
const genericPromptPattern = /\b(symbolic (?:image|scene|representation)|abstract (?:image|scene|visual|representation)|mysterious (?:figure|silhouette|person)|shadowy figure|cinematic atmosphere|dramatic (?:background|atmosphere)|dark moody (?:scene|background|atmosphere)|people in shadows|atmospheric background|ominous vibe|generic mood)\b/i;
const abstractStoryPattern = /\b(case moved|court ruling|justice delayed|lesser compensation|corporation walked free|no justice|lost hope|corporate escape)\b/i;
const textExclusionPattern = /\b(text|letters|numbers|subtitles|captions|logo|logos|watermark|labels?|signage|ui)\b/i;
const noReadableTextPattern = /\b(no|without|free|unreadable|blank|blurred|reserved)\b/i;

function fail(message) {
  throw new Error(message);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read JSON '${filePath}': ${error.message}`);
  }
}

function typeName(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, expectedType) {
  if (expectedType === 'array') return Array.isArray(value);
  if (expectedType === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expectedType === 'integer') return Number.isInteger(value);
  if (expectedType === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expectedType === 'null') return value === null;
  return typeof value === expectedType;
}

function validateSchema(value, schema, jsonPath = '$') {
  const errors = [];
  const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean);
  if (expectedTypes.length > 0 && !expectedTypes.some((expectedType) => matchesType(value, expectedType))) {
    return [`${jsonPath} expected ${expectedTypes.join(' or ')}, got ${typeName(value)}`];
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${jsonPath} must be one of: ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'string' && Number.isInteger(schema.minLength) && value.length < schema.minLength) {
    errors.push(`${jsonPath} must be at least ${schema.minLength} characters`);
  }
  if (typeof value === 'number' && Number.isFinite(value) && typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push(`${jsonPath} must be >= ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${jsonPath} must contain at least ${schema.minItems} items`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(`${jsonPath} must contain no more than ${schema.maxItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateSchema(item, schema.items, `${jsonPath}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        errors.push(`${jsonPath}.${key} is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push(`${jsonPath}.${key} is not allowed`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        errors.push(...validateSchema(value[key], propertySchema, `${jsonPath}.${key}`));
      }
    }
  }

  return errors;
}

function collectBannedKeys(value, jsonPath = '$', errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectBannedKeys(item, `${jsonPath}[${index}]`, errors));
    return errors;
  }
  if (!value || typeof value !== 'object') {
    return errors;
  }
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${jsonPath}.${key}`;
    if (bannedKeys.has(key)) {
      errors.push(`${nextPath} is not allowed in visual_prompt_builder fixtures`);
    }
    collectBannedKeys(entry, nextPath, errors);
  }
  return errors;
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function hasTextFreePolicy(value) {
  const text = String(value || '').toLowerCase();
  return textExclusionPattern.test(text) && noReadableTextPattern.test(text);
}

function validateVisualPromptContract(fixture) {
  const errors = collectBannedKeys(fixture);
  const prompts = Array.isArray(fixture.prompts) ? fixture.prompts : [];
  const seenSceneNumbers = new Set();

  if (!hasTextFreePolicy(fixture.text_policy?.generated_asset_policy)) {
    errors.push('text_policy.generated_asset_policy must explicitly keep generated assets text-free or unreadable');
  }
  if (!String(fixture.text_policy?.renderer_text_policy || '').toLowerCase().includes('renderer')) {
    errors.push('text_policy.renderer_text_policy must reserve readable text for renderer metadata/layers');
  }
  if (providerNamePattern.test(JSON.stringify(fixture))) {
    errors.push('visual prompt fixture must not name provider/model/render/storage implementations');
  }

  prompts.forEach((prompt, index) => {
    const scenePath = `prompts[${index}]`;
    const expectedSceneNumber = index + 1;
    const requiresV11 = fixture.visual_prompt_version === '1.1';
    if (prompt.scene_number !== expectedSceneNumber) {
      errors.push(`${scenePath}.scene_number must be ${expectedSceneNumber}`);
    }
    if (seenSceneNumbers.has(prompt.scene_number)) {
      errors.push(`${scenePath}.scene_number duplicates a previous scene`);
    }
    seenSceneNumbers.add(prompt.scene_number);
    if (prompt.aspect_ratio !== '9:16') {
      errors.push(`${scenePath}.aspect_ratio must be 9:16`);
    }
    if (Number(prompt.duration_seconds) <= 0) {
      errors.push(`${scenePath}.duration_seconds must be positive`);
    }

    for (const field of ['subject', 'environment', 'composition', 'camera', 'motion', 'lighting', 'style']) {
      if (wordCount(prompt[field]) < 2) {
        errors.push(`${scenePath}.${field} must be specific enough to guide generation`);
      }
    }
    if (wordCount(prompt.visual_prompt) < 24) {
      errors.push(`${scenePath}.visual_prompt must contain at least 24 words`);
    }
    if (requiresV11) {
      for (const field of ['image_prompt', 'video_prompt', 'continuity_anchor', 'text_risk_strategy']) {
        if (wordCount(prompt[field]) < 8) {
          errors.push(`${scenePath}.${field} must be concrete enough for v1.1 asset generation`);
        }
      }
      if (!Array.isArray(prompt.visual_evidence) || prompt.visual_evidence.length === 0) {
        errors.push(`${scenePath}.visual_evidence must list concrete visible evidence for v1.1 asset generation`);
      }
      if (!String(prompt.video_prompt || '').toLowerCase().includes('reference image')) {
        errors.push(`${scenePath}.video_prompt must instruct the video model to continue from the reference image`);
      }
      if (!String(prompt.image_prompt || '').toLowerCase().includes('9:16')) {
        errors.push(`${scenePath}.image_prompt must include the vertical 9:16 keyframe shape`);
      }
      if (abstractStoryPattern.test(String(prompt.image_prompt || '')) || abstractStoryPattern.test(String(prompt.video_prompt || ''))) {
        errors.push(`${scenePath}.image_prompt/video_prompt must translate abstract story claims into visible evidence`);
      }
    }
    if (wordCount(prompt.fallback_prompt) < 12) {
      errors.push(`${scenePath}.fallback_prompt must contain at least 12 words`);
    }
    if (genericPromptPattern.test(String(prompt.visual_prompt || ''))) {
      errors.push(`${scenePath}.visual_prompt uses generic mood-board language`);
    }
    if (genericPromptPattern.test(String(prompt.fallback_prompt || ''))) {
      errors.push(`${scenePath}.fallback_prompt uses generic mood-board language`);
    }
    if (!textExclusionPattern.test(String(prompt.negative_prompt || ''))) {
      errors.push(`${scenePath}.negative_prompt must exclude generated text or visible text artifacts`);
    }
    if (!hasTextFreePolicy(prompt.text_policy)) {
      errors.push(`${scenePath}.text_policy must explicitly prevent generated readable text`);
    }
    if (!String(prompt.visual_prompt || '').toLowerCase().includes('9:16')) {
      errors.push(`${scenePath}.visual_prompt must include the vertical 9:16 asset shape`);
    }
  });

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectFail = args[0] === '--expect-fail';
  const fixtureArg = expectFail ? args[1] : args[0];
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_visual_prompt_fixture.mjs [--expect-fail] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateVisualPromptContract(fixture),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail visual prompt validation, but it passed.`);
    }
    process.stdout.write(`Expected validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Visual prompt fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Visual prompt fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
