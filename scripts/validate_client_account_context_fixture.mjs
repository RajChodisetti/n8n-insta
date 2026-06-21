#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/client_account_context.schema.json');

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

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${jsonPath} must contain at least ${schema.minItems} items`);
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

function compactSet(values = []) {
  return new Set(values.map((value) => String(value || '').trim()).filter(Boolean));
}

function validateClientAccountContext(context) {
  const errors = [];
  if (context.safety_policy?.global_rules_override_allowed !== false) {
    errors.push('safety_policy.global_rules_override_allowed must be false');
  }

  const allowedStylePackIds = compactSet(context.style_policy?.allowed_style_pack_ids);
  const disallowedStylePackIds = compactSet(context.style_policy?.disallowed_style_pack_ids);
  const preferredStylePackId = String(context.style_policy?.preferred_style_pack_id || '').trim();
  if (preferredStylePackId && !allowedStylePackIds.has(preferredStylePackId)) {
    errors.push('style_policy.preferred_style_pack_id must be listed in allowed_style_pack_ids');
  }
  for (const stylePackId of allowedStylePackIds) {
    if (disallowedStylePackIds.has(stylePackId)) {
      errors.push(`style pack '${stylePackId}' cannot be both allowed and disallowed`);
    }
  }

  if (context.avatar_policy?.default_avatar_mode === 'real_person_with_consent') {
    if (context.avatar_policy.requires_consent !== true) {
      errors.push('real_person_with_consent avatar mode requires avatar_policy.requires_consent true');
    }
    if (!String(context.avatar_policy.consent_record_uri || '').trim()) {
      errors.push('real_person_with_consent avatar mode requires consent_record_uri');
    }
  }

  if (context.publishing_policy?.approval_required !== true) {
    errors.push('publishing_policy.approval_required must remain true for this workflow');
  }
  if (context.music_policy?.publish_allowed_required !== true) {
    errors.push('music_policy.publish_allowed_required must remain true');
  }

  const platformAccountId = String(context.platform_account?.platform_account_id || '').trim();
  const publishAccountId = String(context.publishing_policy?.platform_account_id || '').trim();
  if (platformAccountId && publishAccountId && platformAccountId !== publishAccountId) {
    errors.push('platform_account.platform_account_id must match publishing_policy.platform_account_id when both are set');
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectFail = args.includes('--expect-fail');
  const fixtureArg = args.find((arg) => arg !== '--expect-fail');
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_client_account_context_fixture.mjs [--expect-fail] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateClientAccountContext(fixture),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail client/account context validation, but it passed.`);
    }
    process.stdout.write(`Expected client/account context validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Client/account context fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Client/account context fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
