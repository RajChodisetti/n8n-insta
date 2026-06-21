#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/storyboard.schema.json');
const bannedKeys = new Set([
  'visual_prompt',
  'image_prompt',
  'video_prompt',
  'negative_prompt',
  'fallback_prompt',
  'cover_prompt',
  'render_manifest_seed_json',
  'provider',
  'model',
  'host',
  'bucket',
  'storage',
]);
const providerNamePattern = /\b(openai|fal|fish_audio|smallest_ai|gcs|google_cloud_storage|minio|s3|ffmpeg|remotion|wan|meta graph)\b/i;

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
      errors.push(`${nextPath} is banned from storyboard_and_shot_plan fixtures`);
    }
    collectBannedKeys(entry, nextPath, errors);
  }
  return errors;
}

function validateStoryboardContract(fixture) {
  const errors = collectBannedKeys(fixture);
  const scenes = Array.isArray(fixture.scenes) ? fixture.scenes : [];
  const targetDurationSeconds = Number(fixture.target_duration_seconds);
  let previousEnd = 0;
  let totalDuration = 0;

  scenes.forEach((scene, index) => {
    const expectedSceneNumber = index + 1;
    if (scene.scene_number !== expectedSceneNumber) {
      errors.push(`scenes[${index}].scene_number must be ${expectedSceneNumber}`);
    }
    if (Math.abs(Number(scene.start_time_seconds) - previousEnd) > 0.25) {
      errors.push(`scenes[${index}].start_time_seconds must be contiguous with the previous scene`);
    }
    if (Number(scene.end_time_seconds) <= Number(scene.start_time_seconds)) {
      errors.push(`scenes[${index}].end_time_seconds must be after start_time_seconds`);
    }
    if (Math.abs((Number(scene.end_time_seconds) - Number(scene.start_time_seconds)) - Number(scene.duration_seconds)) > 0.25) {
      errors.push(`scenes[${index}].duration_seconds must match start/end timing`);
    }
    previousEnd = Number(scene.end_time_seconds);
    totalDuration += Number(scene.duration_seconds);
  });

  if (Number.isFinite(targetDurationSeconds) && targetDurationSeconds > 0) {
    const tolerance = Math.max(1, targetDurationSeconds * 0.05);
    if (Math.abs(totalDuration - targetDurationSeconds) > tolerance) {
      errors.push(`scene durations sum to ${totalDuration}, outside target range for ${targetDurationSeconds}`);
    }
  }

  const voiceLineIds = new Set((Array.isArray(fixture.voice_line_map) ? fixture.voice_line_map : []).map((line) => String(line.voice_line_id || '').trim()).filter(Boolean));
  const validSceneNumbers = new Set(scenes.map((scene) => Number(scene.scene_number)));
  for (const line of Array.isArray(fixture.voice_line_map) ? fixture.voice_line_map : []) {
    if (!validSceneNumbers.has(Number(line.scene_number))) {
      errors.push(`voice_line_map line '${line.voice_line_id}' references missing scene ${line.scene_number}`);
    }
  }
  scenes.forEach((scene, index) => {
    for (const voiceLineId of Array.isArray(scene.voice_line_ids) ? scene.voice_line_ids : []) {
      if (!voiceLineIds.has(String(voiceLineId))) {
        errors.push(`scenes[${index}].voice_line_ids references missing voice line '${voiceLineId}'`);
      }
    }
  });

  const assetSequence = Array.isArray(fixture.asset_plan?.asset_sequence) ? fixture.asset_plan.asset_sequence : [];
  if (assetSequence.length !== scenes.length) {
    errors.push('asset_plan.asset_sequence must have one entry per scene');
  }
  assetSequence.forEach((entry, index) => {
    if (entry.scene_number !== scenes[index]?.scene_number) {
      errors.push(`asset_plan.asset_sequence[${index}] must align to scenes[${index}]`);
    }
    if (entry.asset_need !== scenes[index]?.asset_need) {
      errors.push(`asset_plan.asset_sequence[${index}].asset_need must match scenes[${index}].asset_need`);
    }
  });

  const boundary = String(fixture.visual_prompt_boundary || '').toLowerCase();
  if (!boundary.includes('visual prompt') || !boundary.includes('session 9')) {
    errors.push('visual_prompt_boundary must explicitly delegate final visual prompt generation to Session 9');
  }

  const serialized = JSON.stringify(fixture);
  if (providerNamePattern.test(serialized)) {
    errors.push('storyboard fixture must not name provider/model/render implementations');
  }

  return errors;
}

async function main() {
  const fixtureArg = process.argv[2];
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_storyboard_fixture.mjs <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateStoryboardContract(fixture),
  ];
  if (errors.length > 0) {
    fail(`Storyboard fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Storyboard fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
