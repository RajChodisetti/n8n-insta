#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const decisionSchemaPath = path.join(repoRoot, 'prompts/schemas/avatar_decision.schema.json');
const presenterProfileSchemaPath = path.join(repoRoot, 'prompts/schemas/presenter_profile.schema.json');

const secretPattern = /(sk-[A-Za-z0-9]|ghp_|AIz[a-zA-Z0-9_-]|BEGIN .*PRIVATE KEY|xox[baprs]-|[A-Z0-9_]*(TOKEN|SECRET|API[_]?KEY)=[^\s]+)/;
const avatarRouteTypes = new Set(['synthetic_avatar_asset', 'real_person_avatar_asset']);
const enabledDecisionStatuses = new Set(['use_synthetic_avatar', 'use_consent_approved_avatar']);
const blockingConsentStatuses = new Set(['missing', 'unclear', 'expired', 'revoked']);

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

function compactList(values = []) {
  return Array.isArray(values)
    ? values.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function validateAvatarDecision(decision) {
  const errors = [];
  const serialized = JSON.stringify(decision);
  if (secretPattern.test(serialized)) {
    errors.push('avatar decision fixture appears to contain a secret value or env assignment');
  }

  const summary = decision.decision_summary ?? {};
  const profile = decision.presenter_profile ?? {};
  const consent = profile.consent ?? {};
  const providerIdentity = profile.provider_identity ?? {};
  const likenessPolicy = profile.likeness_policy ?? {};
  const disclosurePolicy = profile.disclosure_policy ?? {};
  const assetRoutePolicy = profile.asset_route_policy ?? {};
  const selectedRoute = decision.selected_route ?? {};
  const consentEvaluation = decision.consent_evaluation ?? {};
  const avatarPolicy = decision.inputs?.avatar_policy_snapshot ?? {};

  const selectedRouteIsAvatar = avatarRouteTypes.has(selectedRoute.route_type);
  const summaryEnablesAvatar = summary.avatar_route_enabled === true || enabledDecisionStatuses.has(summary.decision_status);
  const routeEnabled = selectedRouteIsAvatar || summaryEnablesAvatar;

  if (summary.provider_calls_allowed !== false) {
    errors.push('decision_summary.provider_calls_allowed must be false');
  }
  if (summary.publish_route_allowed !== false) {
    errors.push('decision_summary.publish_route_allowed must be false');
  }
  if (summary.requires_final_qa !== true) {
    errors.push('decision_summary.requires_final_qa must be true');
  }
  if (decision.implementation_notes?.provider_calls_added !== false) {
    errors.push('implementation_notes.provider_calls_added must be false');
  }
  if (decision.implementation_notes?.dependencies_added !== false) {
    errors.push('implementation_notes.dependencies_added must be false');
  }
  if (decision.implementation_notes?.runtime_behavior_changed !== false) {
    errors.push('implementation_notes.runtime_behavior_changed must be false');
  }
  if (decision.implementation_notes?.publish_behavior_changed !== false) {
    errors.push('implementation_notes.publish_behavior_changed must be false');
  }

  if (selectedRoute.output_route !== 'asset_generation') {
    errors.push('selected_route.output_route must remain asset_generation');
  }
  if (selectedRoute.publish_route !== false) {
    errors.push('selected_route.publish_route must be false');
  }
  if (assetRoutePolicy.output_route !== 'asset_generation') {
    errors.push('presenter_profile.asset_route_policy.output_route must remain asset_generation');
  }
  if (assetRoutePolicy.publish_route !== false) {
    errors.push('presenter_profile.asset_route_policy.publish_route must be false');
  }
  if (assetRoutePolicy.final_qa_required !== true) {
    errors.push('presenter_profile.asset_route_policy.final_qa_required must be true');
  }
  if (providerIdentity.provider_account_required_now !== false) {
    errors.push('presenter_profile.provider_identity.provider_account_required_now must be false for Session 18');
  }

  if (routeEnabled && summary.avatar_route_enabled !== true) {
    errors.push('decision_summary.avatar_route_enabled must be true when selected_route is an avatar route');
  }
  if (!routeEnabled && selectedRoute.asset_role !== 'none') {
    errors.push('selected_route.asset_role must be none when avatar route is disabled');
  }
  if (routeEnabled && selectedRoute.asset_role !== 'avatar_video_asset') {
    errors.push('selected_route.asset_role must be avatar_video_asset when avatar route is enabled');
  }
  if (routeEnabled && !['synthetic_persona', 'real_person_with_consent'].includes(profile.profile_type)) {
    errors.push('presenter_profile.profile_type must be synthetic_persona or real_person_with_consent when avatar route is enabled');
  }

  const consentRecordUri = String(consent.consent_record_uri ?? '').trim();
  const evaluationRecordUri = String(consentEvaluation.consent_record_uri ?? '').trim();
  const avatarPolicyRecordUri = String(avatarPolicy.consent_record_uri ?? '').trim();
  const providerAvatarId = String(providerIdentity.provider_avatar_id ?? '').trim();
  const providerVoiceId = String(providerIdentity.provider_voice_id ?? '').trim();
  const selectedProviderAvatarId = String(selectedRoute.provider_avatar_id ?? '').trim();
  const selectedProviderVoiceId = String(selectedRoute.provider_voice_id ?? '').trim();
  const allowedUseCases = compactList(consent.allowed_use_cases);
  const disallowedUseCases = compactList(consent.disallowed_use_cases);
  const usageRestrictions = compactList(consent.usage_restrictions);
  const requestedPackageType = String(decision.package_type || '').trim();

  if (routeEnabled) {
    if (blockingConsentStatuses.has(consent.consent_status)) {
      errors.push(`enabled avatar route cannot use consent_status '${consent.consent_status}'`);
    }
    if (!hasText(consentRecordUri)) {
      errors.push('enabled avatar route requires presenter_profile.consent.consent_record_uri');
    }
    if (!hasText(evaluationRecordUri)) {
      errors.push('enabled avatar route requires consent_evaluation.consent_record_uri');
    }
    if (avatarPolicy.requires_consent !== false && !hasText(avatarPolicyRecordUri)) {
      errors.push('enabled avatar route requires inputs.avatar_policy_snapshot.consent_record_uri when consent is required');
    }
    if (allowedUseCases.length === 0) {
      errors.push('enabled avatar route requires at least one allowed use case');
    }
    if (requestedPackageType !== 'unknown' && !allowedUseCases.includes(requestedPackageType)) {
      errors.push(`allowed_use_cases must include package_type '${requestedPackageType}' for enabled avatar route`);
    }
    if (disallowedUseCases.length === 0) {
      errors.push('enabled avatar route requires disallowed use cases');
    }
    if (usageRestrictions.length === 0) {
      errors.push('enabled avatar route requires usage restrictions');
    }
    if (!providerAvatarId || !providerVoiceId) {
      errors.push('enabled avatar route requires provider avatar and voice IDs in presenter_profile.provider_identity');
    }
    if (!selectedProviderAvatarId || !selectedProviderVoiceId) {
      errors.push('enabled avatar route requires provider avatar and voice IDs in selected_route');
    }
    if (providerAvatarId && selectedProviderAvatarId && providerAvatarId !== selectedProviderAvatarId) {
      errors.push('selected_route.provider_avatar_id must match presenter_profile provider_avatar_id');
    }
    if (providerVoiceId && selectedProviderVoiceId && providerVoiceId !== selectedProviderVoiceId) {
      errors.push('selected_route.provider_voice_id must match presenter_profile provider_voice_id');
    }
    if (providerIdentity.provider_config_status === 'missing' || providerIdentity.provider_config_status === 'blocked') {
      errors.push('enabled avatar route cannot use missing or blocked provider config status');
    }
    if (consentEvaluation.consent_gate !== 'pass' && consentEvaluation.consent_gate !== 'not_required_synthetic') {
      errors.push('enabled avatar route requires consent_evaluation.consent_gate pass or not_required_synthetic');
    }
    if (consentEvaluation.blocks_avatar_route !== false) {
      errors.push('enabled avatar route requires consent_evaluation.blocks_avatar_route false');
    }
    if (consentEvaluation.provider_identity_checked !== true) {
      errors.push('enabled avatar route requires consent_evaluation.provider_identity_checked true');
    }
    if (disclosurePolicy.disclosure_required !== true || selectedRoute.disclosure_required !== true) {
      errors.push('enabled avatar route requires disclosure');
    }
    if (!hasText(disclosurePolicy.disclosure_text) || !hasText(selectedRoute.disclosure_text)) {
      errors.push('enabled avatar route requires disclosure text');
    }
  }

  if (profile.profile_type === 'real_person_with_consent' || selectedRoute.route_type === 'real_person_avatar_asset') {
    if (consent.consent_status !== 'granted') {
      errors.push('real-person avatar route requires consent_status granted');
    }
    if (!hasText(consentRecordUri)) {
      errors.push('real-person avatar route requires a consent_record_uri');
    }
    if (likenessPolicy.uses_real_person_likeness !== true) {
      errors.push('real-person avatar route requires likeness_policy.uses_real_person_likeness true');
    }
  }

  const hasConsentFailure = blockingConsentStatuses.has(consent.consent_status)
    || consentEvaluation.blocks_avatar_route === true
    || consentEvaluation.consent_gate === 'fail';
  if (hasConsentFailure && routeEnabled) {
    errors.push('avatar route must not be enabled when consent evaluation blocks avatar route');
  }
  if (hasConsentFailure && !['blocked', 'use_non_avatar_visuals', 'needs_human_review'].includes(summary.decision_status)) {
    errors.push('consent failure must set decision_status to blocked, use_non_avatar_visuals, or needs_human_review');
  }

  if (decision.fallback_plan?.active !== true) {
    errors.push('fallback_plan.active must be true so non-avatar visuals remain available');
  }
  if (decision.fallback_plan?.fallback_route_type !== 'non_avatar_visuals') {
    errors.push('fallback_plan.fallback_route_type must be non_avatar_visuals');
  }

  for (const [index, gate] of (decision.quality_gates ?? []).entries()) {
    if (gate.status === 'fail' && gate.blocks_avatar_route === true && routeEnabled) {
      errors.push(`quality_gates[${index}] fails an avatar route while avatar route is enabled`);
    }
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectFail = args.includes('--expect-fail');
  const fixtureArg = args.find((arg) => arg !== '--expect-fail');
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_avatar_decision_fixture.mjs [--expect-fail] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [decisionSchema, presenterProfileSchema, fixture] = await Promise.all([
    readJson(decisionSchemaPath),
    readJson(presenterProfileSchemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, decisionSchema),
    ...validateSchema(fixture.presenter_profile, presenterProfileSchema, '$.presenter_profile'),
    ...validateAvatarDecision(fixture),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail avatar decision validation, but it passed.`);
    }
    process.stdout.write(`Expected avatar decision validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Avatar decision fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Avatar decision fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
