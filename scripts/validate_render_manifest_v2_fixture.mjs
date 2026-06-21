#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'prompts/schemas/render_manifest_v2.schema.json');

const secretPattern = /(sk-[A-Za-z0-9]|ghp_|AIz[a-zA-Z0-9_-]|BEGIN .*PRIVATE KEY|xox[baprs]-|[A-Z0-9_]*(TOKEN|SECRET|API[_]?KEY)=[^\s]+)/;
const forbiddenRuntimePattern = /\b(remotion[_ -]?only|requires[_ -]?remotion|renderer[_ -]?replacement)\b/i;
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

function approxEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
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

function validateRenderManifest(manifest) {
  const errors = [];
  const serialized = JSON.stringify(manifest);
  if (secretPattern.test(serialized)) {
    errors.push('render_manifest_v2 fixture appears to contain a secret value or env assignment');
  }
  if (forbiddenRuntimePattern.test(serialized)) {
    errors.push('render_manifest_v2 must not require Remotion or renderer replacement');
  }

  if (manifest.target_renderer_policy?.renderer_neutral !== true) {
    errors.push('target_renderer_policy.renderer_neutral must be true');
  }
  if (manifest.target_renderer_policy?.active_runtime_renderer !== 'local_ffmpeg') {
    errors.push('target_renderer_policy.active_runtime_renderer must remain local_ffmpeg');
  }
  if (manifest.target_renderer_policy?.replaces_current_renderer !== false) {
    errors.push('target_renderer_policy.replaces_current_renderer must be false');
  }
  if (manifest.implementation_notes?.runtime_behavior_changed !== false) {
    errors.push('implementation_notes.runtime_behavior_changed must be false');
  }
  if (manifest.implementation_notes?.requires_renderer_replacement !== false) {
    errors.push('implementation_notes.requires_renderer_replacement must be false');
  }
  if (manifest.implementation_notes?.active_workflow_consumes_this !== false) {
    errors.push('implementation_notes.active_workflow_consumes_this must be false until a wiring session');
  }

  const safeAreaIds = new Set((manifest.safe_areas?.areas ?? []).map((area) => area.safe_area_id));
  uniqueBy(manifest.safe_areas?.areas ?? [], 'safe_area_id', 'safe_areas.areas', errors);

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  uniqueBy(assets, 'asset_id', 'assets', errors);
  const assetsById = new Map(assets.map((asset) => [asset.asset_id, asset]));
  for (const [index, asset] of assets.entries()) {
    if (!isPublicHttpsUrl(asset.storage_url)) {
      errors.push(`assets[${index}].storage_url must be a public https URL`);
    }
    if (asset.publish_allowed !== true) {
      errors.push(`assets[${index}].publish_allowed must be true`);
    }
    if (asset.license_status === 'unknown') {
      errors.push(`assets[${index}].license_status must not be unknown`);
    }
    if ((asset.asset_type === 'music' || asset.asset_type === 'sfx') && asset.license_status === 'not_applicable') {
      errors.push(`assets[${index}].license_status must be explicit for music/SFX assets`);
    }
  }

  const scenes = [...(Array.isArray(manifest.scenes) ? manifest.scenes : [])]
    .sort((a, b) => Number(a.scene_number) - Number(b.scene_number));
  uniqueBy(scenes, 'scene_number', 'scenes', errors);
  let expectedStart = 0;
  for (const [index, scene] of scenes.entries()) {
    const scenePath = `scenes[${index}]`;
    if (scene.scene_number !== index + 1) {
      errors.push(`${scenePath}.scene_number must be contiguous starting at 1`);
    }
    if (!approxEqual(scene.start_time_seconds, expectedStart)) {
      errors.push(`${scenePath}.start_time_seconds must equal previous scene end (${expectedStart})`);
    }
    if (!approxEqual(scene.duration_seconds, Number(scene.end_time_seconds) - Number(scene.start_time_seconds))) {
      errors.push(`${scenePath}.duration_seconds must equal end_time_seconds - start_time_seconds`);
    }
    const visualAsset = assetsById.get(scene.visual_asset_id);
    if (!visualAsset) {
      errors.push(`${scenePath}.visual_asset_id references unknown asset '${scene.visual_asset_id}'`);
    } else if (!['image', 'video'].includes(visualAsset.asset_type)) {
      errors.push(`${scenePath}.visual_asset_id must reference image or video asset`);
    }
    const narrationAsset = assetsById.get(scene.narration_asset_id);
    if (!narrationAsset) {
      errors.push(`${scenePath}.narration_asset_id references unknown asset '${scene.narration_asset_id}'`);
    } else if (narrationAsset.asset_type !== 'narration_audio') {
      errors.push(`${scenePath}.narration_asset_id must reference narration_audio asset`);
    }
    expectedStart = Number(scene.end_time_seconds);
  }
  if (scenes.length > 0 && !approxEqual(scenes.at(-1).end_time_seconds, manifest.output?.duration_seconds)) {
    errors.push('output.duration_seconds must equal the final scene end_time_seconds');
  }
  if (manifest.output?.width !== manifest.export_settings?.width || manifest.output?.height !== manifest.export_settings?.height) {
    errors.push('output dimensions must match export_settings dimensions');
  }
  if (manifest.output?.fps !== manifest.export_settings?.fps) {
    errors.push('output.fps must match export_settings.fps');
  }
  if (manifest.output?.aspect_ratio !== manifest.export_settings?.aspect_ratio) {
    errors.push('output.aspect_ratio must match export_settings.aspect_ratio');
  }
  if (manifest.output?.duration_seconds > manifest.export_settings?.max_duration_seconds) {
    errors.push('output.duration_seconds must not exceed export_settings.max_duration_seconds');
  }

  const timeline = Array.isArray(manifest.timeline) ? manifest.timeline : [];
  uniqueBy(timeline, 'timeline_id', 'timeline', errors);
  const visualEntries = timeline.filter((entry) => entry.track_type === 'visual');
  const narrationEntries = timeline.filter((entry) => entry.track_type === 'narration');
  for (const scene of scenes) {
    const matchingVisual = visualEntries.filter((entry) => entry.scene_number === scene.scene_number);
    if (matchingVisual.length !== 1) {
      errors.push(`scene ${scene.scene_number} must have exactly one visual timeline entry`);
    } else {
      const entry = matchingVisual[0];
      if (entry.asset_id !== scene.visual_asset_id) {
        errors.push(`visual timeline for scene ${scene.scene_number} must use scene.visual_asset_id`);
      }
      if (!approxEqual(entry.start_time_seconds, scene.start_time_seconds) || !approxEqual(entry.duration_seconds, scene.duration_seconds)) {
        errors.push(`visual timeline for scene ${scene.scene_number} must match scene timing`);
      }
    }
    const matchingNarration = narrationEntries.filter((entry) => entry.scene_number === scene.scene_number);
    if (matchingNarration.length !== 1) {
      errors.push(`scene ${scene.scene_number} must have exactly one narration timeline entry`);
    } else if (matchingNarration[0].asset_id !== scene.narration_asset_id) {
      errors.push(`narration timeline for scene ${scene.scene_number} must use scene.narration_asset_id`);
    }
  }
  for (const [index, entry] of timeline.entries()) {
    if (!approxEqual(entry.duration_seconds, Number(entry.end_time_seconds) - Number(entry.start_time_seconds))) {
      errors.push(`timeline[${index}].duration_seconds must equal end_time_seconds - start_time_seconds`);
    }
    if (entry.asset_id && !assetsById.has(entry.asset_id)) {
      errors.push(`timeline[${index}].asset_id references unknown asset '${entry.asset_id}'`);
    }
  }

  const overlayIds = new Set((manifest.overlays ?? []).map((overlay) => overlay.overlay_id));
  uniqueBy(manifest.overlays ?? [], 'overlay_id', 'overlays', errors);
  for (const [index, overlay] of (manifest.overlays ?? []).entries()) {
    if (!safeAreaIds.has(overlay.safe_area_id)) {
      errors.push(`overlays[${index}].safe_area_id references unknown safe area`);
    }
    if (overlay.text && overlay.renderer_owns_text !== true) {
      errors.push(`overlays[${index}] with text must set renderer_owns_text true`);
    }
    if (overlay.generated_asset_text_allowed !== false) {
      errors.push(`overlays[${index}].generated_asset_text_allowed must be false`);
    }
  }
  for (const [sceneIndex, scene] of scenes.entries()) {
    for (const overlayId of scene.overlay_ids ?? []) {
      if (!overlayIds.has(overlayId)) {
        errors.push(`scenes[${sceneIndex}].overlay_ids references unknown overlay '${overlayId}'`);
      }
    }
  }

  for (const [index, track] of (manifest.caption_tracks ?? []).entries()) {
    if (!safeAreaIds.has(track.safe_area_id)) {
      errors.push(`caption_tracks[${index}].safe_area_id references unknown safe area`);
    }
    for (const [lineIndex, line] of (track.lines ?? []).entries()) {
      const scene = scenes.find((item) => item.scene_number === line.scene_number);
      if (!scene) {
        errors.push(`caption_tracks[${index}].lines[${lineIndex}] references unknown scene`);
      } else if (line.start_time_seconds < scene.start_time_seconds - tolerance || line.end_time_seconds > scene.end_time_seconds + tolerance) {
        errors.push(`caption_tracks[${index}].lines[${lineIndex}] must stay within its scene timing`);
      }
    }
  }

  for (const [index, track] of (manifest.audio_tracks ?? []).entries()) {
    for (const assetId of track.asset_ids ?? []) {
      const asset = assetsById.get(assetId);
      if (!asset) {
        errors.push(`audio_tracks[${index}].asset_ids references unknown asset '${assetId}'`);
      }
      if ((track.track_type === 'music' || track.track_type === 'sfx') && asset?.publish_allowed !== true) {
        errors.push(`audio_tracks[${index}] references non-publishable music/SFX asset '${assetId}'`);
      }
    }
    if (track.track_type === 'music' && !String(track.ducking?.strategy || '').toLowerCase().includes('narration')) {
      errors.push(`audio_tracks[${index}].ducking.strategy must mention narration clarity`);
    }
  }

  const transitionIds = new Set((manifest.transitions ?? []).map((transition) => transition.transition_id));
  for (const [sceneIndex, scene] of scenes.entries()) {
    if (scene.transition_id && !transitionIds.has(scene.transition_id)) {
      errors.push(`scenes[${sceneIndex}].transition_id references unknown transition '${scene.transition_id}'`);
    }
  }

  const coverAsset = assetsById.get(manifest.storage?.cover_asset_id);
  if (!coverAsset) {
    errors.push('storage.cover_asset_id must reference an existing asset');
  } else if (!['image', 'video'].includes(coverAsset.asset_type)) {
    errors.push('storage.cover_asset_id must reference an image or video asset');
  }
  const outputPath = String(manifest.storage?.output_path || '');
  if (outputPath.startsWith('/') || outputPath.includes('..')) {
    errors.push('storage.output_path must be a relative object path');
  }
  if (manifest.storage?.public_url_required !== true) {
    errors.push('storage.public_url_required must be true for publishable renders');
  }

  const ffmpeg = manifest.ffmpeg_compatibility ?? {};
  const preview = ffmpeg.render_request_preview ?? {};
  if (ffmpeg.can_map_to_current_ffmpeg !== true) {
    errors.push('ffmpeg_compatibility.can_map_to_current_ffmpeg must be true');
  }
  if (ffmpeg.compatibility_mode !== 'lower_to_current_render_request') {
    errors.push('ffmpeg_compatibility.compatibility_mode must be lower_to_current_render_request');
  }
  if (preview.render_provider !== 'local_ffmpeg') {
    errors.push('ffmpeg_compatibility.render_request_preview.render_provider must be local_ffmpeg');
  }
  if (preview.output?.width !== manifest.output?.width || preview.output?.height !== manifest.output?.height || preview.output?.fps !== manifest.output?.fps) {
    errors.push('ffmpeg render_request_preview.output must match manifest output dimensions and fps');
  }
  if (!Array.isArray(preview.timeline) || preview.timeline.length !== scenes.length) {
    errors.push('ffmpeg render_request_preview.timeline must contain one entry per scene');
  } else {
    for (const [index, scene] of scenes.entries()) {
      const entry = preview.timeline[index];
      const visualAsset = assetsById.get(scene.visual_asset_id);
      const narrationAsset = assetsById.get(scene.narration_asset_id);
      if (entry.scene_number !== scene.scene_number) {
        errors.push(`ffmpeg preview timeline[${index}].scene_number must match scene order`);
      }
      if (entry.asset_url !== visualAsset?.storage_url) {
        errors.push(`ffmpeg preview timeline[${index}].asset_url must match scene visual asset URL`);
      }
      if (entry.narration_url !== narrationAsset?.storage_url) {
        errors.push(`ffmpeg preview timeline[${index}].narration_url must match scene narration asset URL`);
      }
      if (!approxEqual(entry.start_time, scene.start_time_seconds) || !approxEqual(entry.duration_seconds, scene.duration_seconds)) {
        errors.push(`ffmpeg preview timeline[${index}] must match scene timing`);
      }
    }
  }
  if (preview.audio?.narration?.mode !== 'per_scene') {
    errors.push('ffmpeg render_request_preview.audio.narration.mode must be per_scene for this contract fixture');
  }
  if (preview.cover?.cover_asset_url !== coverAsset?.storage_url) {
    errors.push('ffmpeg render_request_preview.cover.cover_asset_url must match storage.cover_asset_id URL');
  }
  if (preview.storage?.output_path !== manifest.storage?.output_path) {
    errors.push('ffmpeg render_request_preview.storage.output_path must match manifest storage.output_path');
  }

  for (const [index, gate] of (manifest.quality_gates ?? []).entries()) {
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
    fail('Usage: node scripts/validate_render_manifest_v2_fixture.mjs [--expect-fail] <fixture.json>');
  }

  const fixturePath = path.resolve(repoRoot, fixtureArg);
  const [schema, fixture] = await Promise.all([
    readJson(schemaPath),
    readJson(fixturePath),
  ]);
  const errors = [
    ...validateSchema(fixture, schema),
    ...validateRenderManifest(fixture),
  ];

  if (expectFail) {
    if (errors.length === 0) {
      fail(`Expected '${fixtureArg}' to fail render_manifest_v2 validation, but it passed.`);
    }
    process.stdout.write(`Expected render_manifest_v2 validation failure for ${fixtureArg}: ${errors[0]}\n`);
    return;
  }

  if (errors.length > 0) {
    fail(`Render manifest v2 fixture validation failed for ${fixtureArg}:\n- ${errors.join('\n- ')}`);
  }
  process.stdout.write(`Render manifest v2 fixture valid: ${fixtureArg}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
