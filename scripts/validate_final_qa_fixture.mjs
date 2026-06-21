#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/qa_result.schema.json');

const sensitiveKeys = new Set([
  'api_key',
  'access_token',
  'token',
  'secret',
  'password',
  'instagram_graph_api_token',
  'service_account',
]);

const allowedFixStagesByCategory = {
  package_integrity: new Set(['story_package_generation_v2', 'director_contract', 'storyboard_and_shot_plan', 'manual_review']),
  license: new Set(['music_sfx_plan']),
  avatar_consent: new Set(['director_contract', 'approval_queue', 'avatar_presenter_selector', 'manual_review']),
  caption: new Set(['caption_and_hashtags']),
  export: new Set(['render_manifest_construction', 'render_worker', 'asset_generation']),
  render: new Set(['render_manifest_construction', 'render_worker', 'asset_generation']),
  asset: new Set(['visual_prompt_builder', 'asset_generation', 'render_manifest_construction']),
  voice: new Set(['voice_performance_script', 'narration_generation']),
  brand_safety: new Set(['director_contract', 'story_package_generation_v2', 'manual_review']),
  platform_policy: new Set(['director_contract', 'caption_and_hashtags', 'publish_executor', 'manual_review']),
  approval: new Set(['approval_queue', 'manual_review']),
};

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

function collectSensitiveKeys(value, jsonPath = '$', errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSensitiveKeys(item, `${jsonPath}[${index}]`, errors));
    return errors;
  }
  if (!value || typeof value !== 'object') {
    return errors;
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const nextPath = `${jsonPath}.${key}`;
    if (sensitiveKeys.has(normalizedKey) || normalizedKey.endsWith('_api_key') || normalizedKey.endsWith('_token')) {
      errors.push(`${nextPath} must not be present in final QA fixtures`);
    }
    collectSensitiveKeys(entry, nextPath, errors);
  }
  return errors;
}

function issueSummary(qaResult) {
  return [
    ...(Array.isArray(qaResult.blocking_issues) ? qaResult.blocking_issues : []),
    ...(Array.isArray(qaResult.non_blocking_issues) ? qaResult.non_blocking_issues : []),
  ];
}

function validateFixStage(issue, jsonPath) {
  const allowedStages = allowedFixStagesByCategory[issue.category];
  if (!allowedStages) {
    return [`${jsonPath}.category is not recognized by the QA validator`];
  }
  if (issue.upstream_fix_stage === 'none') {
    return [`${jsonPath}.upstream_fix_stage must name a fix stage for issues`];
  }
  if (!allowedStages.has(issue.upstream_fix_stage)) {
    return [`${jsonPath}.upstream_fix_stage '${issue.upstream_fix_stage}' is not valid for category '${issue.category}'`];
  }
  return [];
}

function validateFinalQaResult(qaResult) {
  const errors = collectSensitiveKeys(qaResult);
  const blockingIssues = Array.isArray(qaResult.blocking_issues) ? qaResult.blocking_issues : [];
  const nonBlockingIssues = Array.isArray(qaResult.non_blocking_issues) ? qaResult.non_blocking_issues : [];
  const allIssues = issueSummary(qaResult);
  const stageFixReferences = Array.isArray(qaResult.stage_fix_references) ? qaResult.stage_fix_references : [];
  const stageFixByIssueId = new Map(stageFixReferences.map((entry) => [entry.issue_id, entry]));

  if (blockingIssues.length > 0) {
    if (qaResult.publish_decision !== 'blocked') {
      errors.push('publish_decision must be blocked when blocking_issues are present');
    }
    if (qaResult.summary?.blocks_publish !== true) {
      errors.push('summary.blocks_publish must be true when blocking_issues are present');
    }
    if (qaResult.summary?.approved_for_publish !== false) {
      errors.push('summary.approved_for_publish must be false when blocking_issues are present');
    }
    if (qaResult.publish_requirements?.blocks_publish !== true) {
      errors.push('publish_requirements.blocks_publish must be true when blocking_issues are present');
    }
  } else {
    if (qaResult.publish_decision === 'blocked') {
      errors.push('publish_decision must not be blocked when blocking_issues is empty');
    }
    if (qaResult.summary?.blocks_publish !== false) {
      errors.push('summary.blocks_publish must be false when blocking_issues is empty');
    }
    if (qaResult.publish_decision === 'approved' && qaResult.summary?.approved_for_publish !== true) {
      errors.push('summary.approved_for_publish must be true for approved QA results');
    }
    if (qaResult.publish_requirements?.blocks_publish !== false) {
      errors.push('publish_requirements.blocks_publish must be false when blocking_issues is empty');
    }
  }

  blockingIssues.forEach((issue, index) => {
    const jsonPath = `blocking_issues[${index}]`;
    if (issue.severity !== 'blocking') {
      errors.push(`${jsonPath}.severity must be blocking`);
    }
    if (issue.blocks_publish !== true) {
      errors.push(`${jsonPath}.blocks_publish must be true`);
    }
    errors.push(...validateFixStage(issue, jsonPath));
  });

  nonBlockingIssues.forEach((issue, index) => {
    const jsonPath = `non_blocking_issues[${index}]`;
    if (issue.severity === 'blocking') {
      errors.push(`${jsonPath}.severity must not be blocking`);
    }
    if (issue.blocks_publish !== false) {
      errors.push(`${jsonPath}.blocks_publish must be false`);
    }
    errors.push(...validateFixStage(issue, jsonPath));
  });

  for (const [index, issue] of allIssues.entries()) {
    const reference = stageFixByIssueId.get(issue.issue_id);
    if (!reference) {
      errors.push(`issue '${issue.issue_id}' must have a matching stage_fix_references entry`);
      continue;
    }
    if (reference.upstream_fix_stage !== issue.upstream_fix_stage) {
      errors.push(`stage_fix_references for issue '${issue.issue_id}' must use upstream_fix_stage '${issue.upstream_fix_stage}'`);
    }
    if (index !== allIssues.findIndex((entry) => entry.issue_id === issue.issue_id)) {
      errors.push(`issue_id '${issue.issue_id}' is duplicated`);
    }
  }

  for (const [index, reference] of stageFixReferences.entries()) {
    if (!allIssues.some((issue) => issue.issue_id === reference.issue_id)) {
      errors.push(`stage_fix_references[${index}].issue_id does not match any issue`);
    }
  }

  const requirements = qaResult.publish_requirements ?? {};
  const requirementKeys = [
    'selected_video_approved',
    'caption_ready',
    'export_public_url_ready',
    'license_clearance_ready',
    'avatar_consent_ready',
    'platform_context_ready',
  ];
  const unmetRequirements = requirementKeys.filter((key) => requirements[key] === false);
  if (unmetRequirements.length > 0 && blockingIssues.length === 0) {
    errors.push(`unmet publish requirements require blocking issues: ${unmetRequirements.join(', ')}`);
  }

  const blockingChecklist = Array.isArray(qaResult.checklist)
    ? qaResult.checklist.filter((check) => check.blocks_publish === true)
    : [];
  if (blockingChecklist.length > 0 && blockingIssues.length === 0) {
    errors.push('blocking checklist entries require at least one blocking issue');
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectBlocked = args[0] === '--expect-blocked';
  const expectApproved = args[0] === '--expect-approved';
  const fixtureArg = expectBlocked || expectApproved ? args[1] : args[0];
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_final_qa_fixture.mjs [--expect-blocked|--expect-approved] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateFinalQaResult(fixture),
  ];

  if (errors.length > 0) {
    fail(`Final QA fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }

  if (expectBlocked && fixture.publish_decision !== 'blocked') {
    fail(`Expected '${fixtureArg}' to be blocked, but publish_decision was '${fixture.publish_decision}'.`);
  }
  if (expectApproved && fixture.publish_decision !== 'approved') {
    fail(`Expected '${fixtureArg}' to be approved, but publish_decision was '${fixture.publish_decision}'.`);
  }

  process.stdout.write(`Final QA fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
