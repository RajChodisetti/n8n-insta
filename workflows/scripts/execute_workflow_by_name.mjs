#!/usr/bin/env node

import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const { Client } = require('/usr/local/lib/node_modules/n8n/node_modules/pg');

function fail(message) {
  throw new Error(message);
}

function trimForOutput(value, maxChars = 2000) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function ensureString(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    fail(`${name} is required.`);
  }
  return normalized;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runN8n(args, { passthrough = true } = {}) {
  const result = spawnSync('n8n', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error) {
    const reason = result.error.code === 'ENOBUFS'
      ? `n8n output exceeded the ${32}MB capture limit`
      : result.error.message;
    fail(`Failed to run n8n ${args.join(' ')}: ${reason}`);
  }

  if (passthrough && result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (passthrough && result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    if (!passthrough && result.stderr) {
      process.stderr.write(`${trimForOutput(result.stderr)}\n`);
    }
    process.exit(result.status ?? 1);
  }

  return result;
}

async function waitForWebhookRegistration(client, workflowId) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const registration = await client.query(
      'select count(*)::int as count from webhook_entity where "workflowId" = $1',
      [workflowId],
    );
    if (Number(registration.rows[0]?.count || 0) > 0) {
      return;
    }
    await sleep(1000);
  }

  fail(`Workflow '${workflowId}' was activated, but its webhook routes were not registered in time.`);
}

async function main() {
  const workflowName = ensureString('workflow_name', process.argv[2]);
  const workflowFile = ensureString('workflow_file', process.argv[3]);
  const activateOnly = process.argv.slice(4).includes('--activate-only');
  const pgCredentialName = String(process.env.PG_CREDENTIAL_NAME || 'Postgres account').trim() || 'Postgres account';

  const client = new Client({
    host: ensureString('DB_POSTGRESDB_HOST', process.env.DB_POSTGRESDB_HOST),
    port: Number.parseInt(String(process.env.DB_POSTGRESDB_PORT || '5432'), 10) || 5432,
    database: ensureString('DB_POSTGRESDB_DATABASE', process.env.DB_POSTGRESDB_DATABASE),
    user: ensureString('DB_POSTGRESDB_USER', process.env.DB_POSTGRESDB_USER),
    password: ensureString('DB_POSTGRESDB_PASSWORD', process.env.DB_POSTGRESDB_PASSWORD),
  });

  await client.connect();

  try {
    let workflowId = '';
    const existing = await client.query(
      'select id from workflow_entity where name = $1 order by \"updatedAt\" desc limit 1',
      [workflowName],
    );
    workflowId = String(existing.rows[0]?.id || '').trim();

    const workflow = JSON.parse(await fs.readFile(workflowFile, 'utf8'));
    const project = await client.query(
      "select distinct \"projectId\" from shared_workflow where role = 'workflow:owner' order by \"projectId\" asc limit 1",
    );
    const projectId = String(project.rows[0]?.projectId || '').trim();
    if (!projectId) {
      fail('Could not determine the default n8n project for shared workflow ownership.');
    }

    if (!workflowId) {
      workflowId = crypto.randomUUID();
      await client.query(
        `insert into workflow_entity (
          id,
          name,
          active,
          nodes,
          connections,
          "createdAt",
          "updatedAt",
          settings,
          "staticData",
          "pinData",
          "versionId",
          "triggerCount",
          meta
        ) values (
          $1,
          $2,
          $3,
          $4::json,
          $5::json,
          now(),
          now(),
          $6::json,
          $7::json,
          $8::json,
          $9,
          $10,
          $11::json
        )`,
        [
          workflowId,
          workflowName,
          Boolean(workflow.active ?? false),
          JSON.stringify(workflow.nodes || []),
          JSON.stringify(workflow.connections || {}),
          JSON.stringify(workflow.settings ?? {}),
          JSON.stringify(workflow.staticData ?? null),
          JSON.stringify(workflow.pinData ?? {}),
          String(workflow.versionId || crypto.randomUUID()),
          Number.isInteger(workflow.triggerCount) ? workflow.triggerCount : 0,
          JSON.stringify(workflow.meta ?? {}),
        ],
      );
      await client.query(
        `insert into shared_workflow (
          "workflowId",
          "projectId",
          role,
          "createdAt",
          "updatedAt"
        ) values (
          $1,
          $2,
          'workflow:owner',
          now(),
          now()
        )`,
        [workflowId, projectId],
      );
    }

    const sharedWorkflow = await client.query(
      'select 1 from shared_workflow where \"workflowId\" = $1 and role = $2 limit 1',
      [workflowId, 'workflow:owner'],
    );
    if (sharedWorkflow.rowCount === 0) {
      await client.query(
        `insert into shared_workflow (
          "workflowId",
          "projectId",
          role,
          "createdAt",
          "updatedAt"
        ) values (
          $1,
          $2,
          'workflow:owner',
          now(),
          now()
        )`,
        [workflowId, projectId],
      );
    }

    const credential = await client.query(
      'select id from credentials_entity where name = $1 order by name limit 1',
      [pgCredentialName],
    );
    const pgCredentialId = String(credential.rows[0]?.id || '').trim();
    if (!pgCredentialId) {
      fail(`Could not find runtime Postgres credential named '${pgCredentialName}'.`);
    }

    for (const node of workflow.nodes || []) {
      if (node.type === 'n8n-nodes-base.postgres') {
        node.credentials = node.credentials || {};
        node.credentials.postgres = {
          id: pgCredentialId,
          name: pgCredentialName,
        };
      }
    }

    await client.query(
      'update workflow_entity set nodes = $1::json, connections = $2::json, \"updatedAt\" = now() where id = $3',
      [JSON.stringify(workflow.nodes || []), JSON.stringify(workflow.connections || {}), workflowId],
    );

    if (activateOnly) {
      runN8n(['update:workflow', `--id=${workflowId}`, '--active=true'], { passthrough: false });
      if ((workflow.nodes || []).some((node) => node.type === 'n8n-nodes-base.webhook')) {
        await waitForWebhookRegistration(client, workflowId);
      }
      process.stdout.write(JSON.stringify({
        workflow_id: workflowId,
        workflow_name: workflowName,
        active: true,
      }));
      return;
    }

    const result = runN8n(['execute', `--id=${workflowId}`], { passthrough: false });
    process.stdout.write(JSON.stringify({
      workflow_id: workflowId,
      workflow_name: workflowName,
      executed: true,
      stdout_chars: String(result.stdout || '').length,
      stderr_chars: String(result.stderr || '').length,
      had_stderr: Boolean(String(result.stderr || '').trim()),
    }) + '\n');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
