#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/voice_performance.schema.json');

const bannedKeys = new Set([
  'provider',
  'model',
  'voice_id',
  'reference_id',
  'api_parameters',
  'host',
  'bucket',
  'storage',
  'render',
  'publish',
]);
const providerNamePattern = /\b(openai|fish audio|fish_audio|smallest ai|smallest_ai|gcs|google_cloud_storage|minio|s3|ffmpeg|remotion|fal|wan|meta graph)\b/i;
const providerTagPattern = /\((happy|sad|angry|excited|calm|nervous|confident|surprised|scared|worried|empathetic|curious|sarcastic|anxious|uncertain|confused|disappointed|nostalgic|hopeful|determined|compassionate|in a hurry tone|whispering|soft tone|long-break|sighing|gasping|laughing|crying loudly)\)/i;

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
      errors.push(`${nextPath} is not allowed in voice_performance_script fixtures`);
    }
    collectBannedKeys(entry, nextPath, errors);
  }
  return errors;
}

function normalizeScript(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function includesPhrase(lineText, phrase) {
  return normalizeScript(lineText).toLowerCase().includes(normalizeScript(phrase).toLowerCase());
}

function validateVoicePerformanceContract(fixture) {
  const errors = collectBannedKeys(fixture);
  const lines = Array.isArray(fixture.lines) ? fixture.lines : [];
  const serialized = JSON.stringify(fixture);

  if (providerNamePattern.test(serialized)) {
    errors.push('voice performance fixture must not name provider/model/render/storage implementations');
  }
  if (providerTagPattern.test(String(fixture.clean_spoken_script || ''))) {
    errors.push('clean_spoken_script must not contain provider-specific performance tags');
  }

  const cleanScript = normalizeScript(fixture.clean_spoken_script);
  const joinedLineText = normalizeScript(lines.map((line) => line.line_text).join(' '));
  if (cleanScript !== joinedLineText) {
    errors.push('clean_spoken_script must exactly match joined lines[].line_text after whitespace normalization');
  }

  const totalEstimated = lines.reduce((sum, line) => sum + (Number(line.estimated_duration_seconds) || 0), 0);
  if (Math.abs(totalEstimated - Number(fixture.total_estimated_spoken_duration_seconds)) > 0.25) {
    errors.push(`total_estimated_spoken_duration_seconds must match line estimate sum (${Number(totalEstimated.toFixed(2))})`);
  }
  if (Number(fixture.total_estimated_spoken_duration_seconds) > Number(fixture.target_duration_seconds) + 0.5) {
    errors.push('total_estimated_spoken_duration_seconds must fit within target_duration_seconds');
  }

  const seenIds = new Set();
  lines.forEach((line, index) => {
    const linePath = `lines[${index}]`;
    if (line.line_index !== index + 1) {
      errors.push(`${linePath}.line_index must be ${index + 1}`);
    }
    if (seenIds.has(line.voice_line_id)) {
      errors.push(`${linePath}.voice_line_id duplicates a previous line`);
    }
    seenIds.add(line.voice_line_id);
    if (providerTagPattern.test(String(line.line_text || ''))) {
      errors.push(`${linePath}.line_text must not contain provider-specific performance tags`);
    }
    if (providerTagPattern.test(JSON.stringify(line))) {
      errors.push(`${linePath} must not contain provider-specific performance tags`);
    }
    if (Number(line.pauses?.before_seconds) > 3 || Number(line.pauses?.after_seconds) > 3) {
      errors.push(`${linePath}.pauses should stay under 3 seconds per boundary`);
    }
    if (!String(line.provider_tag_policy || '').toLowerCase().includes('no provider-specific')) {
      errors.push(`${linePath}.provider_tag_policy must explicitly ban provider-specific tags`);
    }
    for (const emphasis of Array.isArray(line.emphasis) ? line.emphasis : []) {
      if (!includesPhrase(line.line_text, emphasis.phrase)) {
        errors.push(`${linePath}.emphasis phrase '${emphasis.phrase}' must appear in line_text`);
      }
    }
    for (const item of Array.isArray(line.pronunciation) ? line.pronunciation : []) {
      if (!includesPhrase(line.line_text, item.term)) {
        errors.push(`${linePath}.pronunciation term '${item.term}' must appear in line_text`);
      }
    }
  });

  const mappingPolicy = [
    fixture.adapter_mapping_policy?.generic_contract_policy,
    fixture.adapter_mapping_policy?.provider_mapping_notes,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  if (!mappingPolicy.includes('provider-neutral') || !mappingPolicy.includes('adapter')) {
    errors.push('adapter_mapping_policy must describe a provider-neutral contract and later adapter mapping');
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectFail = args[0] === '--expect-fail';
  const fixtureArg = expectFail ? args[1] : args[0];
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_voice_performance_fixture.mjs [--expect-fail] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateVoicePerformanceContract(fixture),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail voice performance validation, but it passed.`);
    }
    process.stdout.write(`Expected validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Voice performance fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Voice performance fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
