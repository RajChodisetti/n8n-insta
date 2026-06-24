#!/usr/bin/env node

import os from 'node:os';
import { createPool } from './db.mjs';
import {
  claimNextPipelineStep,
  completePipelineStep,
  failPipelineStep,
  resetStaleRunningSteps,
} from './runs.mjs';
import { executePipelineStage } from './stages.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message, details = {}) {
  const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  process.stdout.write(`[pipeline-worker] ${new Date().toISOString()} ${message}${suffix}\n`);
}

async function main() {
  const pool = createPool();
  const workerId = String(process.env.PIPELINE_WORKER_ID || `${os.hostname()}-${process.pid}`).trim();
  const pollMs = Math.max(500, Number.parseInt(String(process.env.PIPELINE_WORKER_POLL_MS || '5000'), 10) || 5000);
  const staleSeconds = Math.max(60, Number.parseInt(String(process.env.PIPELINE_STALE_RUNNING_SECONDS || '900'), 10) || 900);
  let stopping = false;

  const stop = () => {
    stopping = true;
    log('stop requested');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    const resetRows = await resetStaleRunningSteps(pool, { staleSeconds });
    if (resetRows.length) {
      log('reset stale running steps', { count: resetRows.length });
    }

    log('started', { worker_id: workerId, poll_ms: pollMs });
    while (!stopping) {
      const step = await claimNextPipelineStep(pool, { workerId });
      if (!step) {
        await sleep(pollMs);
        continue;
      }

      log('claimed step', {
        pipeline_run_id: step.pipeline_run_id,
        stage_key: step.stage_key,
        content_id: step.content_id,
      });
      try {
        const output = await executePipelineStage(step.stage_key, { pool, step, workerId });
        const completion = await completePipelineStep(pool, step, output);
        log('completed step', {
          pipeline_run_id: step.pipeline_run_id,
          stage_key: step.stage_key,
          terminal: completion.terminal === true,
          status: completion.status || 'running',
        });
      } catch (error) {
        await failPipelineStep(pool, step, error);
        log('failed step', {
          pipeline_run_id: step.pipeline_run_id,
          stage_key: step.stage_key,
          error: error.message,
        });
      }
    }
  } finally {
    await pool.end();
    log('stopped');
  }
}

main().catch((error) => {
  process.stderr.write(`[pipeline-worker] fatal: ${error.stack || error.message}\n`);
  process.exit(1);
});
