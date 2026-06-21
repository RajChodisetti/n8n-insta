#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/model_route.schema.json');

const supportedProvidersByBoundary = new Map([
  ['text_generation', new Set(['openai'])],
  ['image_generation', new Set(['openai', 'fal_ai'])],
  ['video_generation', new Set(['fal_ai_wan', 'fal_ai_wan_reference'])],
  ['narration_tts', new Set(['openai', 'fish_audio', 'smallest_ai'])],
  ['asset_hosting', new Set(['object_storage', 'google_cloud_storage'])],
  ['rendering', new Set(['local_ffmpeg'])],
]);

const secretPattern = /(sk-[A-Za-z0-9]|ghp_|AIz[a-zA-Z0-9_-]|BEGIN .*PRIVATE KEY|xox[baprs]-|[A-Z0-9_]*(TOKEN|SECRET|API[_]?KEY)=[^\s]+)/;
const envNamePattern = /^[A-Z][A-Z0-9_]*$/;

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
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${jsonPath} must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${jsonPath} must be <= ${schema.maximum}`);
    }
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

function validateEnvNames(values = [], label, errors) {
  for (const value of values) {
    if (!envNamePattern.test(String(value || ''))) {
      errors.push(`${label} contains invalid env var name '${value}'`);
    }
  }
}

function validateModelRoute(route) {
  const errors = [];
  const serialized = JSON.stringify(route);
  if (secretPattern.test(serialized)) {
    errors.push('model route fixture appears to contain a secret value or env assignment');
  }
  if (route.creative_direction_policy !== 'preserve_upstream_contracts') {
    errors.push('creative_direction_policy must preserve upstream contracts');
  }
  if (route.selected_route_summary?.planning_only !== true) {
    errors.push('selected_route_summary.planning_only must be true');
  }
  if (route.selected_route_summary?.changes_runtime_behavior !== false) {
    errors.push('selected_route_summary.changes_runtime_behavior must be false');
  }
  if (route.implementation_notes?.adapter_changes_required !== false) {
    errors.push('implementation_notes.adapter_changes_required must be false for Session 15 planning fixtures');
  }

  for (const [index, setting] of (route.selected_route_summary?.recommended_env_settings ?? []).entries()) {
    validateEnvNames([setting.env_key], `recommended_env_settings[${index}].env_key`, errors);
    if (setting.apply_now !== false) {
      errors.push(`recommended_env_settings[${index}].apply_now must be false`);
    }
    if (String(setting.recommended_value || '').includes('=')) {
      errors.push(`recommended_env_settings[${index}].recommended_value must not contain env assignments`);
    }
  }

  const boundaryIds = new Set();
  const candidatesByBoundary = new Map();
  for (const [boundaryIndex, boundary] of (route.provider_boundaries ?? []).entries()) {
    const boundaryPath = `provider_boundaries[${boundaryIndex}]`;
    if (boundaryIds.has(boundary.boundary_id)) {
      errors.push(`${boundaryPath}.boundary_id duplicates ${boundary.boundary_id}`);
    }
    boundaryIds.add(boundary.boundary_id);
    const supportedProviders = supportedProvidersByBoundary.get(boundary.boundary_id);
    if (!supportedProviders) {
      errors.push(`${boundaryPath}.boundary_id is not a known provider boundary`);
      continue;
    }

    validateEnvNames(boundary.current_selector?.env_keys ?? [], `${boundaryPath}.current_selector.env_keys`, errors);
    const candidateIds = new Set();
    const candidateMap = new Map();
    let implementedCandidateCount = 0;
    for (const [candidateIndex, candidate] of (boundary.candidates ?? []).entries()) {
      const candidatePath = `${boundaryPath}.candidates[${candidateIndex}]`;
      if (candidateIds.has(candidate.candidate_id)) {
        errors.push(`${candidatePath}.candidate_id duplicates ${candidate.candidate_id}`);
      }
      candidateIds.add(candidate.candidate_id);
      candidateMap.set(candidate.candidate_id, candidate);
      if (!supportedProviders.has(candidate.provider)) {
        errors.push(`${candidatePath}.provider '${candidate.provider}' is not supported for ${boundary.boundary_id}`);
      }
      if (candidate.changes_runtime_behavior !== false) {
        errors.push(`${candidatePath}.changes_runtime_behavior must be false`);
      }
      validateEnvNames(candidate.required_env_vars ?? [], `${candidatePath}.required_env_vars`, errors);
      if (candidate.adapter_status === 'implemented' || candidate.adapter_status === 'partially_implemented') {
        implementedCandidateCount += 1;
      }
    }
    if (implementedCandidateCount === 0) {
      errors.push(`${boundaryPath} must include at least one implemented or partially implemented candidate`);
    }
    if (!candidateMap.has(boundary.selected_candidate_id)) {
      errors.push(`${boundaryPath}.selected_candidate_id must reference a candidate in the same boundary`);
    }
    if (boundary.fallback_candidate_id && !candidateMap.has(boundary.fallback_candidate_id)) {
      errors.push(`${boundaryPath}.fallback_candidate_id must reference a candidate in the same boundary`);
    }
    if (boundary.fallback_candidate_id && boundary.fallback_candidate_id === boundary.selected_candidate_id) {
      errors.push(`${boundaryPath}.fallback_candidate_id must differ from selected_candidate_id`);
    }
    candidatesByBoundary.set(boundary.boundary_id, candidateMap);
  }

  for (const [index, fallback] of (route.fallback_plan ?? []).entries()) {
    const boundaryCandidates = candidatesByBoundary.get(fallback.boundary_id);
    if (!boundaryCandidates) {
      errors.push(`fallback_plan[${index}].boundary_id must match a provider boundary`);
      continue;
    }
    for (const candidateId of fallback.fallback_order ?? []) {
      if (!boundaryCandidates.has(candidateId)) {
        errors.push(`fallback_plan[${index}].fallback_order references unknown candidate '${candidateId}'`);
      }
    }
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectFail = args.includes('--expect-fail');
  const fixtureArg = args.find((arg) => arg !== '--expect-fail');
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_model_route_fixture.mjs [--expect-fail] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateModelRoute(fixture),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail model route validation, but it passed.`);
    }
    process.stdout.write(`Expected model route validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Model route fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Model route fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
