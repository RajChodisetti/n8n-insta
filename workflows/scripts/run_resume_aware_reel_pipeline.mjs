#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('/usr/local/lib/node_modules/n8n/node_modules/pg');

const WAIT_FOR_RENDER_STAGE = '__wait_for_render_completion__';
const ACTIVE_PIPELINE_STATUSES = [
  'idea_approved',
  'scripting',
  'script_complete',
  'directing',
  'directed',
  'storyboarding',
  'storyboard_complete',
  'validating',
  'validation_complete',
  'generating_assets',
  'assets_ready',
  'generating_narration',
  'narration_ready',
  'building_render_manifest',
  'render_manifest_ready',
  'dispatching_render',
  'render_queued',
  'render_complete',
  'render_failed',
];
const TRANSIENT_STATUS_RESETS = {
  scripting: 'idea_approved',
  directing: 'script_complete',
  storyboarding: 'directed',
  validating: 'storyboard_complete',
  generating_assets: 'storyboard_complete',
  generating_narration: 'assets_ready',
  building_render_manifest: 'narration_ready',
};
const WORKFLOW_FILES = {
  wf_research_and_script: '/workflows/n8n/wf_research_and_script.json',
  wf_director_contract: '/workflows/n8n/wf_director.json',
  wf_storyboard_and_prompts: '/workflows/n8n/wf_storyboard_and_prompts.json',
  wf_validation_check: '/workflows/n8n/wf_validation_check.json',
  wf_asset_generation: '/workflows/n8n/wf_asset_generation.json',
  wf_narration_generation: '/workflows/n8n/wf_narration_generation.json',
  wf_render_manifest_construction: '/workflows/n8n/wf_render_manifest_construction.json',
  wf_render_worker_dispatch: '/workflows/n8n/wf_render_worker_dispatch.json',
  wf_render_sync_completion: '/workflows/n8n/wf_render_sync_completion.json',
  wf_caption_and_hashtags: '/workflows/n8n/wf_caption_and_hashtags.json',
  wf_instagram_reel_publish: '/workflows/n8n/wf_instagram_reel_publish.json',
};

function fail(message) {
  throw new Error(message);
}

function ensureString(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    fail(`${name} is required.`);
  }
  return normalized;
}

function runCommand(command, args, { passthrough = true } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (passthrough && result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (passthrough && result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(' ')}`);
  }

  return result;
}

function formatCandidate(candidate) {
  return `${candidate.slug || candidate.content_id} [status=${candidate.content_status}${candidate.render_status ? `, render_status=${candidate.render_status}` : ''}${candidate.publish_status ? `, publish_status=${candidate.publish_status}` : ''}]`;
}

function parseJson(text) {
  const normalized = String(text ?? '').trim();
  if (!normalized) {
    return null;
  }
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function normalizedRenderWorkerMode() {
  return String(process.env.RENDER_WORKER_MODE || '').trim().toLowerCase();
}

function hasSyncRenderWorkerConfigured() {
  const syncUrl = String(process.env.RENDER_WORKER_SYNC_URL || '').trim();
  const workerUrl = String(process.env.RENDER_WORKER_URL || '').trim();
  return Boolean(syncUrl || workerUrl);
}

function useSyncRenderPath() {
  const mode = normalizedRenderWorkerMode();
  if (mode === 'webhook') {
    return false;
  }
  return hasSyncRenderWorkerConfigured();
}

function detectRecordedRenderMode(candidate) {
  const parsed = parseJson(candidate.render_log);
  const directMode = String(parsed?.mode || '').trim().toLowerCase();
  if (directMode) {
    return directMode;
  }
  const responseMode = String(parsed?.response?.mode || '').trim().toLowerCase();
  if (responseMode) {
    return responseMode;
  }
  const requestSummaryMode = String(parsed?.worker_mode || '').trim().toLowerCase();
  if (requestSummaryMode) {
    return requestSummaryMode;
  }
  return '';
}

function normalizeCandidateRow(row) {
  return {
    content_id: String(row.content_id || '').trim(),
    slug: String(row.slug || '').trim(),
    title: String(row.title || '').trim(),
    category: String(row.category || 'general').trim() || 'general',
    content_status: String(row.content_status || '').trim(),
    confidence_label: String(row.confidence_label || 'unverified').trim() || 'unverified',
    target_duration_seconds: Number(row.target_duration_seconds || 45),
    render_status: String(row.render_status || '').trim(),
    render_log: String(row.render_log || '').trim(),
    publish_status: String(row.publish_status || '').trim(),
    source_payload_json: row.source_payload_json && typeof row.source_payload_json === 'object'
      ? row.source_payload_json
      : parseJson(row.source_payload_json) || {},
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function ensureProductionSchema(client) {
  await client.query(`
    create table if not exists directors (
      director_id uuid primary key default gen_random_uuid(),
      content_id uuid not null unique references content_items(content_id) on delete cascade,
      voice_role text,
      tts_delivery text,
      global_visual_style text,
      visual_strategy text,
      global_pacing text,
      global_music_direction text,
      director_json jsonb not null default '{}'::jsonb,
      generation_model text,
      generated_at timestamptz not null default now()
    );
  `);
  await client.query('alter table directors add column if not exists tts_delivery text;');
  await client.query('alter table directors add column if not exists visual_strategy text;');
  await client.query('create index if not exists idx_directors_content_id on directors (content_id);');
}

async function fetchActiveCandidates(client) {
  const result = await client.query(
    `select
      ci.content_id,
      ci.slug,
      ci.title,
      ci.category,
      ci.status as content_status,
      ci.confidence_label,
      ci.target_duration_seconds,
      ci.source_payload_json,
      coalesce(r.render_status, '') as render_status,
      coalesce(r.render_log, '') as render_log,
      coalesce(p.publish_status, '') as publish_status,
      ci.updated_at
    from content_items ci
    left join renders r on r.content_id = ci.content_id
    left join publishes p on p.content_id = ci.content_id
    where ci.status = any($1::text[])
    order by ci.updated_at desc, ci.created_at desc`,
    [ACTIVE_PIPELINE_STATUSES],
  );

  return result.rows.map(normalizeCandidateRow);
}

async function fetchCandidateById(client, contentId) {
  const result = await client.query(
    `select
      ci.content_id,
      ci.slug,
      ci.title,
      ci.category,
      ci.status as content_status,
      ci.confidence_label,
      ci.target_duration_seconds,
      ci.source_payload_json,
      coalesce(r.render_status, '') as render_status,
      coalesce(r.render_log, '') as render_log,
      coalesce(p.publish_status, '') as publish_status,
      ci.updated_at
    from content_items ci
    left join renders r on r.content_id = ci.content_id
    left join publishes p on p.content_id = ci.content_id
    where ci.content_id = $1
    limit 1`,
    [contentId],
  );

  if (result.rowCount === 0) {
    fail(`Could not reload content item ${contentId}.`);
  }

  return normalizeCandidateRow(result.rows[0]);
}

async function updateContentStatus(client, contentId, expectedStatus, nextStatus) {
  const result = await client.query(
    `update content_items
    set status = $2,
        updated_at = now()
    where content_id = $1
      and status = $3
    returning content_id`,
    [contentId, nextStatus, expectedStatus],
  );

  if (result.rowCount === 0) {
    fail(`Could not change content_items.status from ${expectedStatus} to ${nextStatus} for ${contentId}.`);
  }
}

async function updateRenderStatus(client, contentId, expectedStatus, nextStatus) {
  const result = await client.query(
    `update renders
    set render_status = $2,
        completed_at = case when $2 in ('success', 'failed') then completed_at else null end
    where content_id = $1
      and render_status = $3
    returning content_id`,
    [contentId, nextStatus, expectedStatus],
  );

  if (result.rowCount === 0) {
    fail(`Could not change renders.render_status from ${expectedStatus} to ${nextStatus} for ${contentId}.`);
  }
}

async function rewindQueuedStubRenderToManifestReady(client, candidate) {
  await updateContentStatus(client, candidate.content_id, candidate.content_status, 'render_manifest_ready');
  await updateRenderStatus(client, candidate.content_id, candidate.render_status, 'manifest_ready');
  return fetchCandidateById(client, candidate.content_id);
}

async function normalizeResumePoint(client, candidate) {
  if (TRANSIENT_STATUS_RESETS[candidate.content_status]) {
    await updateContentStatus(
      client,
      candidate.content_id,
      candidate.content_status,
      TRANSIENT_STATUS_RESETS[candidate.content_status],
    );
    return fetchCandidateById(client, candidate.content_id);
  }

  const recordedRenderMode = detectRecordedRenderMode(candidate);
  if (
    candidate.content_status === 'render_queued'
    && candidate.render_status === 'queued'
    && (recordedRenderMode === 'stub' || useSyncRenderPath())
  ) {
    return rewindQueuedStubRenderToManifestReady(client, candidate);
  }

  if (candidate.content_status === 'dispatching_render') {
    if (candidate.render_status === 'queued') {
      if (recordedRenderMode === 'stub' || useSyncRenderPath()) {
        return rewindQueuedStubRenderToManifestReady(client, {
          ...candidate,
          content_status: 'dispatching_render',
        });
      }
      await updateContentStatus(client, candidate.content_id, 'dispatching_render', 'render_queued');
      return fetchCandidateById(client, candidate.content_id);
    }
    if (candidate.render_status === 'manifest_ready') {
      await updateContentStatus(client, candidate.content_id, 'dispatching_render', 'render_manifest_ready');
      return fetchCandidateById(client, candidate.content_id);
    }
    if (candidate.render_status === 'success') {
      await updateContentStatus(client, candidate.content_id, 'dispatching_render', 'render_complete');
      return fetchCandidateById(client, candidate.content_id);
    }
    fail(`Cannot resume ${candidate.slug || candidate.content_id} from dispatching_render with render_status=${candidate.render_status || '<empty>'}.`);
  }

  return candidate;
}

function buildStagePlan(candidate) {
  const renderStage = useSyncRenderPath() ? 'wf_render_sync_completion' : 'wf_render_worker_dispatch';
  const shouldWaitForRender = !useSyncRenderPath();
  switch (candidate.content_status) {
    case 'idea_approved':
      return [
        'wf_research_and_script',
        'wf_director_contract',
        'wf_storyboard_and_prompts',
        'wf_validation_check',
        'wf_asset_generation',
        'wf_narration_generation',
        'wf_render_manifest_construction',
        renderStage,
        ...(shouldWaitForRender ? [WAIT_FOR_RENDER_STAGE] : []),
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'script_complete':
      return [
        'wf_director_contract',
        'wf_storyboard_and_prompts',
        'wf_validation_check',
        'wf_asset_generation',
        'wf_narration_generation',
        'wf_render_manifest_construction',
        renderStage,
        ...(shouldWaitForRender ? [WAIT_FOR_RENDER_STAGE] : []),
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'directed':
      return [
        'wf_storyboard_and_prompts',
        'wf_validation_check',
        'wf_asset_generation',
        'wf_narration_generation',
        'wf_render_manifest_construction',
        renderStage,
        ...(shouldWaitForRender ? [WAIT_FOR_RENDER_STAGE] : []),
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'storyboard_complete':
      return [
        'wf_validation_check',
        'wf_asset_generation',
        'wf_narration_generation',
        'wf_render_manifest_construction',
        renderStage,
        ...(shouldWaitForRender ? [WAIT_FOR_RENDER_STAGE] : []),
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'validation_complete':
      return [
        'wf_asset_generation',
        'wf_narration_generation',
        'wf_render_manifest_construction',
        renderStage,
        ...(shouldWaitForRender ? [WAIT_FOR_RENDER_STAGE] : []),
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'assets_ready':
      return [
        'wf_narration_generation',
        'wf_render_manifest_construction',
        renderStage,
        ...(shouldWaitForRender ? [WAIT_FOR_RENDER_STAGE] : []),
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'narration_ready':
      return [
        'wf_render_manifest_construction',
        renderStage,
        ...(shouldWaitForRender ? [WAIT_FOR_RENDER_STAGE] : []),
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'render_manifest_ready':
      return [
        renderStage,
        ...(shouldWaitForRender ? [WAIT_FOR_RENDER_STAGE] : []),
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'render_queued':
      if (useSyncRenderPath()) {
        fail(`Render for ${candidate.slug || candidate.content_id} is still queued from the old stub dispatch path. Re-run the one-click workflow after the wrapper rewinds it to render_manifest_ready.`);
      }
      return [
        WAIT_FOR_RENDER_STAGE,
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'render_complete':
      if (candidate.publish_status === 'publishing') {
        fail(`Cannot resume ${candidate.slug || candidate.content_id} because publishes.publish_status is still publishing.`);
      }
      return [
        'wf_caption_and_hashtags',
        'wf_instagram_reel_publish',
      ];
    case 'render_failed':
      if (candidate.render_status === 'failed') {
        fail(`Render previously failed for ${candidate.slug || candidate.content_id}. Reset it manually to render_manifest_ready if you want to retry from the existing manifest.`);
      }
      fail(`Cannot resume ${candidate.slug || candidate.content_id} from render_failed with render_status=${candidate.render_status || '<empty>'}.`);
    default:
      fail(`Resume is not supported from content_items.status=${candidate.content_status || '<empty>'}.`);
  }
}

async function fetchFinalSummary(client, contentId) {
  const result = await client.query(
    `select
      ci.content_id,
      ci.slug,
      ci.title,
      ci.status as content_status,
      coalesce(r.render_status, '') as render_status,
      coalesce(r.output_video_url, '') as output_video_url,
      coalesce(p.publish_status, '') as publish_status,
      coalesce(p.instagram_media_id, '') as instagram_media_id,
      coalesce(p.instagram_container_id, '') as instagram_container_id,
      coalesce(p.publish_error, '') as publish_error,
      p.published_at
    from content_items ci
    left join renders r on r.content_id = ci.content_id
    left join publishes p on p.content_id = ci.content_id
    where ci.content_id = $1
    limit 1`,
    [contentId],
  );

  if (result.rowCount === 0) {
    fail(`Could not fetch final summary for ${contentId}.`);
  }

  const row = result.rows[0];
  return {
    content_id: String(row.content_id || '').trim(),
    slug: String(row.slug || '').trim(),
    title: String(row.title || '').trim(),
    content_status: String(row.content_status || '').trim(),
    render_status: String(row.render_status || '').trim(),
    output_video_url: String(row.output_video_url || '').trim(),
    publish_status: String(row.publish_status || '').trim(),
    instagram_media_id: String(row.instagram_media_id || '').trim(),
    instagram_container_id: String(row.instagram_container_id || '').trim(),
    publish_error: String(row.publish_error || '').trim(),
    published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
  };
}

function assertStageOutcome(stage, summary) {
  if (stage === WAIT_FOR_RENDER_STAGE || stage === 'wf_render_sync_completion') {
    if (
      summary.content_status !== 'render_complete'
      || summary.render_status !== 'success'
      || !summary.output_video_url
    ) {
      fail(
        `Render stage did not complete successfully for ${summary.slug || summary.content_id}. `
        + `Current state: content_status=${summary.content_status || '<empty>'}, `
        + `render_status=${summary.render_status || '<empty>'}, `
        + `output_video_url=${summary.output_video_url ? 'present' : 'missing'}.`,
      );
    }
    return;
  }

  if (stage === 'wf_instagram_reel_publish') {
    if (
      summary.publish_status !== 'published'
      || !summary.instagram_media_id
      || !summary.instagram_container_id
    ) {
      fail(
        `Reel publish did not complete for ${summary.slug || summary.content_id}. `
        + `Current publish_status=${summary.publish_status || '<empty>'}. `
        + `${summary.publish_error || 'No publish_error was recorded.'}`,
      );
    }
  }
}

async function main() {
  const planOnly = process.argv.slice(2).includes('--plan-only');
  const client = new Client({
    host: ensureString('DB_POSTGRESDB_HOST', process.env.DB_POSTGRESDB_HOST),
    port: Number.parseInt(String(process.env.DB_POSTGRESDB_PORT || '5432'), 10) || 5432,
    database: ensureString('DB_POSTGRESDB_DATABASE', process.env.DB_POSTGRESDB_DATABASE),
    user: ensureString('DB_POSTGRESDB_USER', process.env.DB_POSTGRESDB_USER),
    password: ensureString('DB_POSTGRESDB_PASSWORD', process.env.DB_POSTGRESDB_PASSWORD),
  });

  await client.connect();

  try {
    await ensureProductionSchema(client);
    const activeCandidates = await fetchActiveCandidates(client);
    if (activeCandidates.length === 0) {
      fail('No unfinished Reel candidate exists. Inject a new idea or reset an existing row into a resumable status first.');
    }
    if (activeCandidates.length > 1) {
      fail(`One-click resume requires a single unfinished Reel candidate. Found ${activeCandidates.length}: ${activeCandidates.map(formatCandidate).join('; ')}`);
    }

    const originalCandidate = activeCandidates[0];
    const candidate = await normalizeResumePoint(client, originalCandidate);
    const resumePlan = buildStagePlan(candidate);

    if (planOnly) {
      process.stdout.write(`${JSON.stringify({
        resumed_candidate: {
          content_id: originalCandidate.content_id,
          slug: originalCandidate.slug,
          title: originalCandidate.title,
          detected_status: originalCandidate.content_status,
          detected_render_status: originalCandidate.render_status || null,
          detected_render_mode: detectRecordedRenderMode(originalCandidate) || null,
          detected_publish_status: originalCandidate.publish_status || null,
        },
        normalized_resume_status: candidate.content_status,
        render_strategy: useSyncRenderPath() ? 'sync' : 'async',
        idea_ingest_creative_defaults: 'used instead of idea_prompt_profile for v1',
        planned_stages: resumePlan.map((stage) => stage === WAIT_FOR_RENDER_STAGE ? 'wait_for_render_completion' : stage),
      })}\n`);
      return;
    }

    const executedStages = [];

    for (const stage of resumePlan) {
      if (stage === WAIT_FOR_RENDER_STAGE) {
        runCommand('node', ['/workflows/scripts/wait_for_render_completion.mjs']);
        executedStages.push('wait_for_render_completion');
        assertStageOutcome(stage, await fetchFinalSummary(client, candidate.content_id));
        continue;
      }

      const workflowFile = WORKFLOW_FILES[stage];
      if (!workflowFile) {
        fail(`No workflow file mapping exists for ${stage}.`);
      }
      runCommand('node', ['/workflows/scripts/execute_workflow_by_name.mjs', stage, workflowFile]);
      executedStages.push(stage);
      assertStageOutcome(stage, await fetchFinalSummary(client, candidate.content_id));
    }

    const finalSummary = await fetchFinalSummary(client, candidate.content_id);
    process.stdout.write(`${JSON.stringify({
      resumed_candidate: {
        content_id: originalCandidate.content_id,
        slug: originalCandidate.slug,
        title: originalCandidate.title,
        detected_status: originalCandidate.content_status,
        detected_render_status: originalCandidate.render_status || null,
        detected_render_mode: detectRecordedRenderMode(originalCandidate) || null,
        detected_publish_status: originalCandidate.publish_status || null,
      },
      normalized_resume_status: candidate.content_status,
      render_strategy: useSyncRenderPath() ? 'sync' : 'async',
      idea_ingest_creative_defaults: 'used instead of idea_prompt_profile for v1',
      executed_stages: executedStages,
      final_summary: finalSummary,
    })}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
