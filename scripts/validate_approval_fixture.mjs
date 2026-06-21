#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/approval.schema.json');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function validateApprovalRecord(approval, expectedPlatformAccountId = '', options = {}) {
  const errors = [];
  if (!uuidPattern.test(String(approval.content_id || ''))) {
    errors.push('content_id must be a valid UUID');
  }

  const isApproved = approval.approval_status === 'approved';
  const isReel = approval.package_type === 'instagram_reel';
  const isImagePost = approval.package_type === 'instagram_image_post';

  if (isApproved) {
    if (approval.qa_status !== 'passed') {
      errors.push('approved records require qa_status passed');
    }
    if (approval.qa_result_reference?.publish_decision !== 'approved') {
      errors.push('approved records require qa_result_reference.publish_decision approved');
    }
    if (approval.qa_result_reference?.blocks_publish !== false) {
      errors.push('approved records require qa_result_reference.blocks_publish false');
    }
    if (!String(approval.approved_by || '').trim()) {
      errors.push('approved records require approved_by');
    }
    if (!String(approval.approved_at || '').trim()) {
      errors.push('approved records require approved_at');
    }
  }

  if (isReel) {
    if (!uuidPattern.test(String(approval.selected_video_id || ''))) {
      errors.push('instagram_reel approvals require selected_video_id');
    }
  }
  if (isImagePost) {
    if (!uuidPattern.test(String(approval.selected_asset_id || ''))) {
      errors.push('instagram_image_post approvals require selected_asset_id');
    }
  }

  if (expectedPlatformAccountId && approval.platform_account_id !== expectedPlatformAccountId) {
    errors.push(`platform_account_id must match expected publish account ${expectedPlatformAccountId}`);
  }

  if (options.expectPublishReady) {
    if (approval.approval_status !== 'approved') {
      errors.push('publish-ready approval fixtures require approval_status approved');
    }
    if (approval.qa_status !== 'passed') {
      errors.push('publish-ready approval fixtures require qa_status passed');
    }
    if (approval.qa_result_reference?.publish_decision !== 'approved') {
      errors.push('publish-ready approval fixtures require qa_result_reference.publish_decision approved');
    }
    if (approval.qa_result_reference?.blocks_publish !== false) {
      errors.push('publish-ready approval fixtures require qa_result_reference.blocks_publish false');
    }
    if (!String(approval.approved_by || '').trim()) {
      errors.push('publish-ready approval fixtures require approved_by');
    }
    if (!String(approval.approved_at || '').trim()) {
      errors.push('publish-ready approval fixtures require approved_at');
    }
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectFail = args.includes('--expect-fail');
  const expectPublishReady = args.includes('--expect-publish-ready');
  const accountIndex = args.indexOf('--expected-platform-account-id');
  const expectedPlatformAccountId = accountIndex >= 0 ? String(args[accountIndex + 1] || '').trim() : '';
  const fixtureArg = args.find((arg, index) => {
    if (arg === '--expect-fail' || arg === '--expect-publish-ready' || arg === '--expected-platform-account-id') return false;
    if (index > 0 && args[index - 1] === '--expected-platform-account-id') return false;
    return true;
  });
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_approval_fixture.mjs [--expect-fail] [--expect-publish-ready] [--expected-platform-account-id <id>] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateApprovalRecord(fixture, expectedPlatformAccountId, { expectPublishReady }),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail approval validation, but it passed.`);
    }
    process.stdout.write(`Expected approval validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Approval fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Approval fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
