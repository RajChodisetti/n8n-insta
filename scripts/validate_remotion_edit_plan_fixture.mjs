#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/remotion_edit_plan.schema.json');

const secretPattern = /(sk-[A-Za-z0-9]|ghp_|AIz[a-zA-Z0-9_-]|BEGIN .*PRIVATE KEY|xox[baprs]-|[A-Z0-9_]*(TOKEN|SECRET|API[_]?KEY)=[^\s]+)/;
const tolerance = 0.03;

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

function isPublicHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:'
      && host !== 'localhost'
      && host !== '127.0.0.1'
      && host !== '0.0.0.0'
      && !host.endsWith('.local');
  } catch {
    return false;
  }
}

function uniqueBy(items, key, label, errors) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const value = item?.[key];
    if (seen.has(value)) {
      errors.push(`${label}[${index}].${key} duplicates '${value}'`);
    }
    seen.add(value);
  }
}

function approxEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function expectedFrames(seconds, fps) {
  return Math.round(Number(seconds) * Number(fps));
}

function validateRemotionEditPlan(plan) {
  const errors = [];
  const serialized = JSON.stringify(plan);
  if (secretPattern.test(serialized)) {
    errors.push('remotion_edit_plan fixture appears to contain a secret value or env assignment');
  }

  if (plan.runtime_policy?.plan_only !== true) {
    errors.push('runtime_policy.plan_only must be true');
  }
  if (plan.runtime_policy?.install_remotion_now !== false) {
    errors.push('runtime_policy.install_remotion_now must be false');
  }
  if (plan.runtime_policy?.replaces_ffmpeg !== false) {
    errors.push('runtime_policy.replaces_ffmpeg must be false');
  }
  if (plan.runtime_policy?.requires_package_install !== false) {
    errors.push('runtime_policy.requires_package_install must be false');
  }
  if (plan.runtime_policy?.active_runtime_renderer !== 'local_ffmpeg') {
    errors.push('runtime_policy.active_runtime_renderer must remain local_ffmpeg');
  }
  if (plan.implementation_notes?.runtime_behavior_changed !== false) {
    errors.push('implementation_notes.runtime_behavior_changed must be false');
  }
  if (plan.implementation_notes?.dependencies_added !== false) {
    errors.push('implementation_notes.dependencies_added must be false');
  }
  if (plan.implementation_notes?.active_workflow_consumes_this !== false) {
    errors.push('implementation_notes.active_workflow_consumes_this must be false until a wiring session');
  }

  const composition = plan.composition ?? {};
  const fps = Number(composition.fps);
  const expectedCompositionFrames = expectedFrames(composition.duration_seconds, fps);
  if (composition.duration_in_frames !== expectedCompositionFrames) {
    errors.push(`composition.duration_in_frames must equal duration_seconds * fps (${expectedCompositionFrames})`);
  }
  const exportSettings = plan.export_settings ?? {};
  for (const key of ['width', 'height', 'fps', 'duration_in_frames', 'duration_seconds']) {
    if (!approxEqual(composition[key], exportSettings[key])) {
      errors.push(`export_settings.${key} must match composition.${key}`);
    }
  }
  if (exportSettings.still_frame_check?.enabled && exportSettings.still_frame_check.frame >= composition.duration_in_frames) {
    errors.push('export_settings.still_frame_check.frame must be inside the composition duration');
  }

  const sequences = [...(Array.isArray(plan.sequences) ? plan.sequences : [])]
    .sort((a, b) => Number(a.from_frame) - Number(b.from_frame));
  uniqueBy(sequences, 'sequence_id', 'sequences', errors);
  uniqueBy(sequences, 'scene_number', 'sequences', errors);
  let expectedFromFrame = 0;
  for (const [index, sequence] of sequences.entries()) {
    const sequencePath = `sequences[${index}]`;
    if (sequence.scene_number !== index + 1) {
      errors.push(`${sequencePath}.scene_number must be contiguous starting at 1`);
    }
    if (sequence.from_frame !== expectedFromFrame) {
      errors.push(`${sequencePath}.from_frame must equal previous sequence end frame (${expectedFromFrame})`);
    }
    const framesFromSeconds = expectedFrames(sequence.duration_seconds, fps);
    if (sequence.duration_in_frames !== framesFromSeconds) {
      errors.push(`${sequencePath}.duration_in_frames must equal duration_seconds * fps (${framesFromSeconds})`);
    }
    if (!approxEqual(sequence.start_time_seconds, sequence.from_frame / fps)) {
      errors.push(`${sequencePath}.start_time_seconds must equal from_frame / fps`);
    }
    if (!isPublicHttpsUrl(sequence.visual_asset_url)) {
      errors.push(`${sequencePath}.visual_asset_url must be a public https URL`);
    }
    if (sequence.asset_type === 'image' && sequence.component_hint !== 'SceneImage') {
      errors.push(`${sequencePath}.component_hint must be SceneImage for image assets`);
    }
    if (sequence.asset_type === 'video' && sequence.component_hint !== 'SceneVideo') {
      errors.push(`${sequencePath}.component_hint must be SceneVideo for video assets`);
    }
    expectedFromFrame += sequence.duration_in_frames;
  }
  if (expectedFromFrame !== composition.duration_in_frames) {
    errors.push(`sequences must cover the full composition duration (${composition.duration_in_frames} frames), got ${expectedFromFrame}`);
  }

  const sequenceByScene = new Map(sequences.map((sequence) => [sequence.scene_number, sequence]));
  for (const [index, line] of (plan.captions?.lines ?? []).entries()) {
    const linePath = `captions.lines[${index}]`;
    const sequence = sequenceByScene.get(line.scene_number);
    if (!sequence) {
      errors.push(`${linePath}.scene_number references unknown sequence`);
      continue;
    }
    const framesFromSeconds = expectedFrames(Number(line.end_time_seconds) - Number(line.start_time_seconds), fps);
    if (line.duration_in_frames !== framesFromSeconds) {
      errors.push(`${linePath}.duration_in_frames must match caption timing in seconds`);
    }
    if (line.from_frame < sequence.from_frame || line.from_frame + line.duration_in_frames > sequence.from_frame + sequence.duration_in_frames) {
      errors.push(`${linePath} must stay within its scene sequence frame range`);
    }
  }

  uniqueBy(plan.overlays ?? [], 'overlay_id', 'overlays', errors);
  for (const [index, overlay] of (plan.overlays ?? []).entries()) {
    if (overlay.text && overlay.renderer_owns_text !== true) {
      errors.push(`overlays[${index}] with text must set renderer_owns_text true`);
    }
    if (overlay.generated_asset_text_allowed !== false) {
      errors.push(`overlays[${index}].generated_asset_text_allowed must be false`);
    }
    if (overlay.from_frame + overlay.duration_in_frames > composition.duration_in_frames) {
      errors.push(`overlays[${index}] must stay within composition duration`);
    }
  }
  for (const [index, lowerThird] of (plan.lower_thirds ?? []).entries()) {
    if (lowerThird.enabled && lowerThird.from_frame + lowerThird.duration_in_frames > composition.duration_in_frames) {
      errors.push(`lower_thirds[${index}] must stay within composition duration`);
    }
  }

  uniqueBy(plan.audio_tracks ?? [], 'track_id', 'audio_tracks', errors);
  for (const [index, track] of (plan.audio_tracks ?? []).entries()) {
    for (const [urlIndex, url] of (track.asset_urls ?? []).entries()) {
      if (!isPublicHttpsUrl(url)) {
        errors.push(`audio_tracks[${index}].asset_urls[${urlIndex}] must be a public https URL`);
      }
    }
    if (track.from_frame + track.duration_in_frames > composition.duration_in_frames) {
      errors.push(`audio_tracks[${index}] must stay within composition duration`);
    }
    if (track.publish_allowed !== true) {
      errors.push(`audio_tracks[${index}].publish_allowed must be true`);
    }
    if ((track.track_type === 'music' || track.track_type === 'sfx') && track.license_status === 'not_applicable') {
      errors.push(`audio_tracks[${index}].license_status must be explicit for music/SFX`);
    }
    if (track.track_type === 'music' && !String(track.ducking_strategy || '').toLowerCase().includes('narration')) {
      errors.push(`audio_tracks[${index}].ducking_strategy must mention narration`);
    }
  }

  for (const [index, transition] of (plan.transitions ?? []).entries()) {
    if (!sequenceByScene.has(transition.from_scene_number)) {
      errors.push(`transitions[${index}].from_scene_number references unknown scene`);
    }
    if (!sequenceByScene.has(transition.to_scene_number)) {
      errors.push(`transitions[${index}].to_scene_number references unknown scene`);
    }
    if (transition.to_scene_number !== transition.from_scene_number + 1) {
      errors.push(`transitions[${index}] must connect adjacent scenes`);
    }
  }
  for (const [index, brand] of (plan.brand_elements ?? []).entries()) {
    if (brand.enabled && brand.asset_url && !isPublicHttpsUrl(brand.asset_url)) {
      errors.push(`brand_elements[${index}].asset_url must be public https when enabled`);
    }
  }

  if (plan.fallback_plan?.active_fallback !== true) {
    errors.push('fallback_plan.active_fallback must remain true while Remotion runtime is not wired');
  }
  if (plan.fallback_plan?.fallback_renderer !== 'local_ffmpeg') {
    errors.push('fallback_plan.fallback_renderer must be local_ffmpeg');
  }
  if (!String(plan.fallback_plan?.ffmpeg_contract_path || '').includes('expected_render_manifest_v2.json')) {
    errors.push('fallback_plan.ffmpeg_contract_path should point to the render_manifest_v2 bridge fixture');
  }

  for (const [index, gate] of (plan.quality_gates ?? []).entries()) {
    if (gate.severity === 'blocking' && gate.status === 'blocked') {
      errors.push(`quality_gates[${index}] is blocking and blocked`);
    }
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const expectFail = args.includes('--expect-fail');
  const fixtureArg = args.find((arg) => arg !== '--expect-fail');
  if (!fixtureArg) {
    fail('Usage: node scripts/validate_remotion_edit_plan_fixture.mjs [--expect-fail] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateRemotionEditPlan(fixture),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail Remotion edit-plan validation, but it passed.`);
    }
    process.stdout.write(`Expected Remotion edit-plan validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Remotion edit-plan fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Remotion edit-plan fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
