#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  DEFAULT_CREATIVE_WORKFLOW_ID,
  creativeWorkflowOptions,
  creativeWorkflowPromptData,
  normalizeCreativeWorkflowId,
} from '../workflows/scripts/creative_workflows.mjs';
import { resolveStagePromptTemplateData } from '../workflows/scripts/prompt_stage_defaults.mjs';

const expectedWorkflows = {
  high_retention_story: '# High-Retention Story',
  premium_documentary: '# Premium Documentary',
  sales_conversion: '# Sales / Conversion',
};

const options = creativeWorkflowOptions();
assert.deepEqual(
  options.map((option) => option.id).sort(),
  Object.keys(expectedWorkflows).sort(),
);
assert.equal(DEFAULT_CREATIVE_WORKFLOW_ID, 'high_retention_story');
assert.equal(normalizeCreativeWorkflowId('Sales / Conversion'), 'sales_conversion');
assert.equal(normalizeCreativeWorkflowId('unknown-workflow'), DEFAULT_CREATIVE_WORKFLOW_ID);

const cards = new Set();
for (const [workflowId, expectedHeading] of Object.entries(expectedWorkflows)) {
  const data = creativeWorkflowPromptData(workflowId);
  assert.equal(data.creative_workflow_id, workflowId);
  assert.ok(data.creative_workflow_label);
  assert.ok(data.creative_workflow_role);
  assert.ok(data.creative_workflow_summary);
  assert.ok(data.creative_workflow_prompt_card.includes(expectedHeading));
  cards.add(data.creative_workflow_prompt_card);
}
assert.equal(cards.size, Object.keys(expectedWorkflows).length);

const promptedStages = [
  'idea_ingest',
  'story_package_generation',
  'director_contract',
  'storyboard_and_shot_plan',
  'visual_prompt_builder',
  'voice_performance_script',
  'final_qa_validator',
];

for (const stageKey of promptedStages) {
  const resolved = resolveStagePromptTemplateData(stageKey, {
    creative_workflow: 'premium_documentary',
    target_duration_seconds: '45',
  });
  assert.equal(resolved.creative_workflow, 'premium_documentary');
  assert.equal(resolved.creative_workflow_id, 'premium_documentary');
  assert.ok(resolved.creative_workflow_prompt_card.includes('# Premium Documentary'));
}

const sourcePayloadResolved = resolveStagePromptTemplateData('visual_prompt_builder', {
  source_payload_json: { creative_workflow: 'sales_conversion' },
  target_duration_seconds: '45',
});
assert.equal(sourcePayloadResolved.creative_workflow, 'sales_conversion');
assert.ok(sourcePayloadResolved.creative_workflow_prompt_card.includes('# Sales / Conversion'));

const creativeDefaultsResolved = resolveStagePromptTemplateData('director_contract', {
  creative_defaults: { creative_workflow: 'premium_documentary' },
  target_duration_seconds: '45',
});
assert.equal(creativeDefaultsResolved.creative_workflow, 'premium_documentary');

process.stdout.write(`PASS creative workflow prompt context (${options.length} workflows, ${promptedStages.length} stages)\n`);
