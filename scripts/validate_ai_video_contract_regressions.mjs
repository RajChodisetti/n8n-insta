#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const jsonRoots = [
  'prompts/schemas',
  'prompts/rules',
  'prompts/style_packs',
  'prompts/examples',
  'fixtures/ai-video',
];

const tests = [
  ['director contract valid fixture', ['scripts/validate_director_contract_fixture.mjs', 'fixtures/ai-video/founder_explainer/expected_director_contract.json']],
  ['director contract invalid style pack blocks', ['scripts/validate_director_contract_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_director_contract_bad_style_pack.json']],
  ['storyboard contract valid fixture', ['scripts/validate_storyboard_fixture.mjs', 'fixtures/ai-video/founder_explainer/expected_storyboard_and_shot_plan.json']],
  ['visual prompt valid fixture', ['scripts/validate_visual_prompt_fixture.mjs', 'fixtures/ai-video/founder_explainer/expected_visual_prompt_builder.json']],
  ['visual prompt vague fixture blocks', ['scripts/validate_visual_prompt_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_vague.json']],
  ['visual prompt missing negative prompt blocks', ['scripts/validate_visual_prompt_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_missing_negative_prompt.json']],
  ['voice performance valid fixture', ['scripts/validate_voice_performance_fixture.mjs', 'fixtures/ai-video/founder_explainer/expected_voice_performance_script.json']],
  ['voice performance mutated clean script blocks', ['scripts/validate_voice_performance_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_voice_performance_script_mutated_text.json']],
  ['music/SFX valid fixture', ['scripts/validate_music_sfx_fixture.mjs', 'fixtures/ai-video/founder_explainer/expected_music_sfx_plan.json']],
  ['music/SFX unknown license blocks', ['scripts/validate_music_sfx_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_music_sfx_plan_unknown_license.json']],
  ['music library license metadata valid', ['scripts/validate_music_library.mjs', 'workflows/assets/music/library.json']],
  ['final QA approved fixture', ['scripts/validate_final_qa_fixture.mjs', '--expect-approved', 'fixtures/ai-video/founder_explainer/expected_final_qa_result_pass.json']],
  ['final QA missing music license blocks', ['scripts/validate_final_qa_fixture.mjs', '--expect-blocked', 'fixtures/ai-video/founder_explainer/failed_final_qa_license.json']],
  ['final QA missing avatar consent blocks', ['scripts/validate_final_qa_fixture.mjs', '--expect-blocked', 'fixtures/ai-video/founder_explainer/failed_final_qa_avatar_consent.json']],
  ['final QA caption/export failure blocks', ['scripts/validate_final_qa_fixture.mjs', '--expect-blocked', 'fixtures/ai-video/founder_explainer/failed_final_qa_caption_export.json']],
  ['publish approval publish-ready fixture', ['scripts/validate_approval_fixture.mjs', '--expect-publish-ready', '--expected-platform-account-id', '17841400000000000', 'fixtures/ai-video/founder_explainer/expected_publish_approval_reel.json']],
  ['publish approval missing selected render blocks', ['scripts/validate_approval_fixture.mjs', '--expect-fail', '--expect-publish-ready', 'fixtures/ai-video/founder_explainer/invalid_publish_approval_missing_selected_video.json']],
  ['publish approval account mismatch blocks', ['scripts/validate_approval_fixture.mjs', '--expect-fail', '--expected-platform-account-id', '17841400000000000', 'fixtures/ai-video/founder_explainer/invalid_publish_approval_account_mismatch.json']],
  ['publish approval unapproved render blocks', ['scripts/validate_approval_fixture.mjs', '--expect-fail', '--expect-publish-ready', 'fixtures/ai-video/founder_explainer/invalid_publish_approval_unapproved_render.json']],
  ['publish gate workflow static check', ['scripts/validate_publish_gate_workflow.mjs']],
  ['client/account context valid fixture', ['scripts/validate_client_account_context_fixture.mjs', 'fixtures/ai-video/founder_explainer/expected_client_account_context.json']],
  ['client/account safety override blocks', ['scripts/validate_client_account_context_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_client_account_context_safety_override.json']],
  ['client/account style conflict blocks', ['scripts/validate_client_account_context_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_client_account_context_style_conflict.json']],
  ['model provider route valid fixture', ['scripts/validate_model_route_fixture.mjs', 'fixtures/ai-video/founder_explainer/expected_model_provider_route.json']],
  ['model provider runtime-change blocks', ['scripts/validate_model_route_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_model_provider_route_runtime_change.json']],
  ['model provider boundary mismatch blocks', ['scripts/validate_model_route_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_model_provider_route_boundary_mismatch.json']],
  ['render manifest v2 valid fixture', ['scripts/validate_render_manifest_v2_fixture.mjs', 'fixtures/ai-video/founder_explainer/expected_render_manifest_v2.json']],
  ['render manifest v2 renderer replacement blocks', ['scripts/validate_render_manifest_v2_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_renderer_replacement.json']],
  ['render manifest v2 timeline gap blocks', ['scripts/validate_render_manifest_v2_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_timeline_gap.json']],
  ['Remotion edit plan valid fixture', ['scripts/validate_remotion_edit_plan_fixture.mjs', 'fixtures/ai-video/founder_explainer/expected_remotion_edit_plan.json']],
  ['Remotion edit plan runtime install blocks', ['scripts/validate_remotion_edit_plan_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_runtime_install.json']],
  ['Remotion edit plan frame gap blocks', ['scripts/validate_remotion_edit_plan_fixture.mjs', '--expect-fail', 'fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_frame_gap.json']],
  ['avatar decision valid fixture', ['scripts/validate_avatar_decision_fixture.mjs', 'fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision.json']],
  ['avatar decision active HeyGen fixture', ['scripts/validate_avatar_decision_fixture.mjs', 'fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision_active_heygen.json']],
  ['avatar decision fallback fixture', ['scripts/validate_avatar_decision_fixture.mjs', 'fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision_fallback_video.json']],
  ['avatar decision missing consent blocks', ['scripts/validate_avatar_decision_fixture.mjs', '--expect-fail', 'fixtures/ai-video/avatar_sales_outreach/invalid_avatar_decision_missing_consent.json']],
  ['avatar decision character reference consent blocks', ['scripts/validate_avatar_decision_fixture.mjs', '--expect-fail', 'fixtures/ai-video/avatar_sales_outreach/invalid_avatar_decision_character_reference_consent.json']],
  ['creative workflow prompt context', ['scripts/test_creative_workflow_prompt_context.mjs']],
  ['story package v2 compatibility contract', ['scripts/test_story_package_v2_compat_contract.mjs']],
  ['story package empty scene repair', ['scripts/test_story_package_empty_scene_repair.mjs']],
  ['storyboard split merge', ['scripts/test_storyboard_split_merge.mjs']],
  ['story package v2 compatibility helper syntax', ['--check', 'workflows/scripts/story_package_v2_compat.mjs']],
];

async function collectJsonFiles(root) {
  const absoluteRoot = path.join(repoRoot, root);
  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(absoluteRoot, entry.name);
    const relativePath = path.relative(repoRoot, absolutePath);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(relativePath);
    }
  }
  return files;
}

async function validateJsonParse() {
  const jsonFiles = [];
  for (const root of jsonRoots) {
    jsonFiles.push(...await collectJsonFiles(root));
  }

  for (const relativePath of jsonFiles.sort()) {
    const absolutePath = path.join(repoRoot, relativePath);
    try {
      JSON.parse(await fs.readFile(absolutePath, 'utf8'));
    } catch (error) {
      throw new Error(`${relativePath} is not valid JSON: ${error.message}`);
    }
  }
  process.stdout.write(`PASS json parse coverage (${jsonFiles.length} files)\n`);
}

function runNodeTest(name, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${name} failed with exit ${result.status}${output ? `:\n${output}` : ''}`);
  }

  const firstLine = String(result.stdout || '').trim().split('\n').filter(Boolean)[0] || 'ok';
  process.stdout.write(`PASS ${name}: ${firstLine}\n`);
}

async function main() {
  await validateJsonParse();
  for (const [name, args] of tests) {
    runNodeTest(name, args);
  }
  process.stdout.write(`AI video contract regressions passed: ${tests.length + 1} checks\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
