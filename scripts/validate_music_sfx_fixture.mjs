#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/music_sfx_plan.schema.json');

const bannedKeys = new Set([
  'provider',
  'model',
  'host',
  'bucket',
  'storage',
  'render_engine',
  'api_parameters',
  'selected_asset_id',
  'final_track_id',
]);
const providerNamePattern = /\b(openai|fish_audio|smallest_ai|fal|wan|gcs|google_cloud_storage|minio|s3|ffmpeg|remotion|meta graph)\b/i;

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
  if (expectedType === 'boolean') return typeof value === 'boolean';
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
      errors.push(`${nextPath} is not allowed in music_sfx_plan fixtures`);
    }
    collectBannedKeys(entry, nextPath, errors);
  }
  return errors;
}

function validateMusicSfxPlan(plan) {
  const errors = collectBannedKeys(plan);
  if (providerNamePattern.test(JSON.stringify(plan))) {
    errors.push('music/SFX plan must not name generation, render, storage, or publish providers');
  }
  if (plan.license_policy?.unknown_license_blocks_publish !== true) {
    errors.push('license_policy.unknown_license_blocks_publish must be true');
  }
  if (plan.license_policy?.publish_allowed_required !== true) {
    errors.push('license_policy.publish_allowed_required must be true');
  }

  const vocalsPolicy = String(plan.music_plan?.vocals_policy || '').toLowerCase();
  if (!vocalsPolicy.includes('instrumental') && !vocalsPolicy.includes('no vocals')) {
    errors.push('music_plan.vocals_policy must default to instrumental/no vocals');
  }
  if (String(plan.music_plan?.brief || '').trim().length < 20) {
    errors.push('music_plan.brief must be specific enough to guide selection');
  }

  const sceneNumbers = new Set();
  for (const [index, scene] of (Array.isArray(plan.scene_audio_plan) ? plan.scene_audio_plan : []).entries()) {
    if (sceneNumbers.has(scene.scene_number)) {
      errors.push(`scene_audio_plan[${index}].scene_number duplicates a previous scene`);
    }
    sceneNumbers.add(scene.scene_number);
    if (!String(scene.ducking_notes || '').toLowerCase().includes('narration') && !String(scene.ducking_notes || '').toLowerCase().includes('voice')) {
      errors.push(`scene_audio_plan[${index}].ducking_notes must explain narration/voice clearance`);
    }
  }

  for (const [index, asset] of (Array.isArray(plan.asset_license_review) ? plan.asset_license_review : []).entries()) {
    const assetPath = `asset_license_review[${index}]`;
    if (asset.license_status === 'unknown') {
      errors.push(`${assetPath}.license_status is unknown and blocks publish`);
    }
    if (asset.publish_allowed !== true) {
      errors.push(`${assetPath}.publish_allowed must be true for usable assets`);
    }
    if (asset.blocks_publish === true) {
      errors.push(`${assetPath}.blocks_publish must be resolved before this fixture can pass`);
    }
  }

  if (plan.publish_safety?.blocks_publish === true) {
    errors.push('publish_safety.blocks_publish must be false for a passing fixture');
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectFail = args[0] === '--expect-fail';
  const fixtureArg = expectFail ? args[1] : args[0];
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_music_sfx_fixture.mjs [--expect-fail] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateMusicSfxPlan(fixture),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail music/SFX validation, but it passed.`);
    }
    process.stdout.write(`Expected validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Music/SFX fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Music/SFX fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
