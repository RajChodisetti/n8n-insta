#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/director_contract.schema.json');
const registryPath = path.join(repoRoot, 'prompts/style_packs/style_pack_registry.json');
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

  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      errors.push(`${jsonPath} must be at least ${schema.minLength} characters`);
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${jsonPath} must be >= ${schema.minimum}`);
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${jsonPath} must contain at least ${schema.minItems} items`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(`${jsonPath} must contain no more than ${schema.maxItems} items`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          errors.push(`${jsonPath} must not contain duplicate items`);
          break;
        }
        seen.add(key);
      }
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

function loadStyleIds(registry) {
  const ids = new Set((registry.style_packs ?? []).map((stylePack) => String(stylePack.id || '').trim()).filter(Boolean));
  if (ids.size === 0) {
    fail('Style pack registry did not contain any style_pack IDs.');
  }
  return ids;
}

function validateDirectorContract(contract, styleIds) {
  const errors = [];
  const selected = String(contract.selected_style_pack || '').trim();
  const secondary = String(contract.secondary_influence?.style_pack_id || '').trim();
  const rejectedStyles = Array.isArray(contract.rejected_styles) ? contract.rejected_styles : [];

  if (!styleIds.has(selected)) {
    errors.push(`selected_style_pack '${selected}' is not in style_pack_registry.json`);
  }
  for (const rejected of rejectedStyles) {
    if (!styleIds.has(rejected)) {
      errors.push(`rejected_styles contains unknown style pack '${rejected}'`);
    }
  }
  if (rejectedStyles.includes(selected)) {
    errors.push('rejected_styles must not include selected_style_pack');
  }
  if (secondary !== 'none') {
    if (!styleIds.has(secondary)) {
      errors.push(`secondary_influence.style_pack_id '${secondary}' is not in style_pack_registry.json`);
    }
    if (secondary === selected) {
      errors.push('secondary_influence must not duplicate selected_style_pack');
    }
    if (rejectedStyles.includes(secondary)) {
      errors.push('secondary_influence must not appear in rejected_styles');
    }
  }

  const scenes = Array.isArray(contract.scenes) ? contract.scenes : [];
  if (contract.edit_contract?.scene_count !== scenes.length) {
    errors.push('edit_contract.scene_count must match scenes.length');
  }
  scenes.forEach((scene, index) => {
    if (scene.scene_number !== index + 1) {
      errors.push(`scenes[${index}].scene_number must be ${index + 1}`);
    }
  });
  if (contract.voice_contract?.voice_role !== contract.voice_role) {
    errors.push('voice_contract.voice_role must match top-level voice_role');
  }

  const routingText = [
    contract.routing_hints?.provider_selection_policy,
    ...(Array.isArray(contract.routing_hints?.handoff_notes) ? contract.routing_hints.handoff_notes : []),
  ].map((value) => String(value || '').trim()).join(' ');
  if (providerNamePattern.test(routingText)) {
    errors.push('routing_hints must not choose or name final providers/models/hosts');
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectFail = args[0] === '--expect-fail';
  const fixtureArg = expectFail ? args[1] : args[0];
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_director_contract_fixture.mjs [--expect-fail] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, registry, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(registryPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateDirectorContract(fixture, loadStyleIds(registry)),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail director contract validation, but it passed.`);
    }
    process.stdout.write(`Expected validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Director contract validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Director contract fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
