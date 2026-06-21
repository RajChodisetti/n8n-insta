#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function fail(message) {
  throw new Error(message);
}

async function readWorkflow(relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), 'utf8'));
  } catch (error) {
    throw new Error(`Could not read workflow '${relativePath}': ${error.message}`);
  }
}

function nodeById(workflow, id) {
  const node = workflow.nodes?.find((entry) => entry.id === id);
  if (!node) {
    fail(`Workflow '${workflow.name}' is missing node '${id}'.`);
  }
  return node;
}

function requireIncludes(text, needle, label) {
  if (!String(text || '').includes(needle)) {
    fail(`${label} must include '${needle}'.`);
  }
}

function requireExcludes(text, needle, label) {
  if (String(text || '').includes(needle)) {
    fail(`${label} must not include '${needle}'.`);
  }
}

async function main() {
  const [reel, simplePost, readiness] = await Promise.all([
    readWorkflow('workflows/n8n/wf_instagram_reel_publish.json'),
    readWorkflow('workflows/n8n/wf_instagram_simple_post_publish.json'),
    readWorkflow('workflows/n8n/wf_instagram_publish_readiness.json'),
  ]);

  const reelClaimQuery = nodeById(reel, 'claim_next_reel_publish_item').parameters?.query || '';
  requireIncludes(reelClaimQuery, 'publish_approvals', 'Reel publish claim query');
  requireIncludes(reelClaimQuery, "pa.package_type = 'instagram_reel'", 'Reel publish claim query');
  requireIncludes(reelClaimQuery, "pa.approval_status = 'approved'", 'Reel publish claim query');
  requireIncludes(reelClaimQuery, "pa.qa_status = 'passed'", 'Reel publish claim query');
  requireIncludes(reelClaimQuery, 'pa.selected_video_id = r.render_id', 'Reel publish claim query');
  requireIncludes(reelClaimQuery, 'pa.approved_at is not null', 'Reel publish claim query');
  requireIncludes(reelClaimQuery, 'pa.platform_account_id', 'Reel publish claim query');
  requireIncludes(reelClaimQuery, 'content_account_contexts', 'Reel publish claim query');
  requireIncludes(reelClaimQuery, "context_snapshot_json->'publishing_policy'->>'platform_account_id' = pa.platform_account_id", 'Reel publish claim query');

  const reelPublishCode = nodeById(reel, 'publish_reel_via_meta').parameters?.jsCode || '';
  requireIncludes(reelPublishCode, 'Final QA and selected-render approval are required before Reel publish.', 'Reel publish code');
  requireIncludes(reelPublishCode, 'Approval account', 'Reel publish code');
  requireIncludes(reelPublishCode, 'selected_video_id is required', 'Reel publish code');
  requireIncludes(reelPublishCode, 'client/account context publish account', 'Reel publish code');

  const simpleClaimQuery = nodeById(simplePost, 'claim_next_instagram_publish_item').parameters?.query || '';
  requireIncludes(simpleClaimQuery, "ci.status = 'qa_approved'", 'Simple-post publish claim query');
  requireExcludes(simpleClaimQuery, "ci.status in ('assets_ready', 'qa_approved')", 'Simple-post publish claim query');

  const readinessCode = nodeById(readiness, 'validate_instagram_publish_readiness').parameters?.jsCode || '';
  requireIncludes(readinessCode, 'approvalGate', 'Publish readiness code');
  requireIncludes(readinessCode, 'publish_approvals', 'Publish readiness code');

  process.stdout.write('Publish gate workflow checks passed.\n');
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
