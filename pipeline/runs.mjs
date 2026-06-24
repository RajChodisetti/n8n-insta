import { ensurePipelineSchema } from './schema.mjs';
import { withClient, withTransaction } from './db.mjs';

export const REEL_TYPES = Object.freeze(['image', 'video', 'avatar']);

export const REEL_TYPE_LABELS = Object.freeze({
  image: 'Image Reel',
  video: 'Video Reel',
  avatar: 'Avatar Video',
});

export const PIPELINE_STAGE_PLANS = Object.freeze({
  generate_reel: Object.freeze({
    image: Object.freeze([
      'story_package_generation',
      'image_asset_generation',
      'narration_generation',
      'remotion_manifest',
      'remotion_render',
      'caption_and_hashtags',
      'final_qa_approval_gate',
    ]),
    video: Object.freeze([
      'story_package_generation',
      'asset_generation_v3',
      'narration_generation',
      'remotion_manifest',
      'remotion_render',
      'caption_and_hashtags',
      'final_qa_approval_gate',
    ]),
    avatar: Object.freeze([
      'story_package_generation',
      'avatar_consent_gate',
      'heygen_avatar_generation',
      'remotion_manifest',
      'remotion_render',
      'caption_and_hashtags',
      'final_qa_approval_gate',
    ]),
  }),
  publish_approved_reel: Object.freeze([
    'instagram_reel_publish',
  ]),
});

export const PIPELINE_ACTIONS = Object.freeze({
  generate_reel: PIPELINE_STAGE_PLANS.generate_reel.video,
  publish_approved_reel: PIPELINE_STAGE_PLANS.publish_approved_reel,
});

export const PIPELINE_ACTION_LABELS = Object.freeze({
  generate_reel: 'Generate Reel To Approval',
  publish_approved_reel: 'Publish Approved Reel',
});

function normalizeAction(value) {
  const action = String(value || 'generate_reel').trim() || 'generate_reel';
  if (!PIPELINE_STAGE_PLANS[action]) {
    throw new Error(`Unsupported pipeline action '${action}'.`);
  }
  return action;
}

export function normalizeReelType(value, { fallback = 'video' } = {}) {
  const fallbackType = REEL_TYPES.includes(String(fallback || '').trim().toLowerCase())
    ? String(fallback).trim().toLowerCase()
    : 'video';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return fallbackType;
  }
  if (!REEL_TYPES.includes(normalized)) {
    throw new Error(`Unsupported reel_type '${value}'. Use one of: ${REEL_TYPES.join(', ')}.`);
  }
  return normalized;
}

export function getDefaultReelType() {
  return normalizeReelType(process.env.DEFAULT_REEL_TYPE, { fallback: 'video' });
}

export function getPipelineStagesForAction(actionValue, { reelType } = {}) {
  const action = normalizeAction(actionValue);
  if (action === 'generate_reel') {
    const normalizedReelType = normalizeReelType(reelType, { fallback: getDefaultReelType() });
    return [...PIPELINE_STAGE_PLANS.generate_reel[normalizedReelType]];
  }
  return [...PIPELINE_STAGE_PLANS[action]];
}

function normalizeUuid(value, name = 'content_id') {
  const normalized = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${name} must be a valid UUID.`);
  }
  return normalized;
}

export async function recordPipelineEvent(client, {
  pipelineRunId,
  pipelineStepId = null,
  contentId = null,
  eventType,
  eventLevel = 'info',
  stageKey = null,
  message,
  details = {},
}) {
  await client.query(
    `insert into pipeline_events (
      pipeline_run_id,
      pipeline_step_id,
      content_id,
      event_type,
      event_level,
      stage_key,
      message,
      details_json
    ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      pipelineRunId,
      pipelineStepId,
      contentId,
      eventType,
      eventLevel,
      stageKey,
      message,
      JSON.stringify(details ?? {}),
    ],
  );
}

export async function createPipelineRun(pool, {
  contentId,
  requestedAction = 'generate_reel',
  reelType = null,
  source = 'studio_api',
  requestedBy = '',
} = {}) {
  const normalizedContentId = normalizeUuid(contentId);
  const action = normalizeAction(requestedAction);

  return withTransaction(pool, async (client) => {
    await ensurePipelineSchema(client);

    const contentResult = await client.query(
      'select content_id, title, status, reel_type from content_items where content_id = $1 for update',
      [normalizedContentId],
    );
    if (contentResult.rowCount === 0) {
      throw new Error(`No content item exists for content_id ${normalizedContentId}.`);
    }
    const normalizedReelType = action === 'generate_reel'
      ? normalizeReelType(reelType ?? contentResult.rows[0].reel_type, { fallback: getDefaultReelType() })
      : null;
    const stages = getPipelineStagesForAction(action, { reelType: normalizedReelType });

    const existingResult = await client.query(
      `select pipeline_run_id, reel_type
      from pipeline_runs
      where content_id = $1
        and requested_action = $2
        and status in ('queued', 'running')
      order by created_at desc
      limit 1`,
      [normalizedContentId, action],
    );
    if (existingResult.rowCount > 0) {
      const existingReelType = normalizeReelType(existingResult.rows[0].reel_type, { fallback: 'video' });
      if (normalizedReelType && existingReelType !== normalizedReelType) {
        throw new Error(`An active ${existingReelType} generate_reel run already exists for this content item.`);
      }
      return getPipelineRunById(client, existingResult.rows[0].pipeline_run_id, { includeEvents: true, existing: true });
    }

    if (normalizedReelType) {
      await client.query(
        `update content_items
        set reel_type = $2,
            updated_at = now()
        where content_id = $1`,
        [normalizedContentId, normalizedReelType],
      );
    }

    const runResult = await client.query(
      `insert into pipeline_runs (
        content_id,
        requested_action,
        reel_type,
        status,
        current_stage,
        stage_plan,
        summary_json
      ) values ($1,$2,$3,'queued',$4,$5::jsonb,$6::jsonb)
      returning *`,
      [
        normalizedContentId,
        action,
        normalizedReelType,
        stages[0] ?? null,
        JSON.stringify(stages),
        JSON.stringify({
          source,
          requested_by: requestedBy,
          reel_type: normalizedReelType,
          content_title: String(contentResult.rows[0].title || '').trim(),
          content_status_at_enqueue: String(contentResult.rows[0].status || '').trim(),
        }),
      ],
    );
    const run = runResult.rows[0];

    for (const [index, stageKey] of stages.entries()) {
      await client.query(
        `insert into pipeline_steps (
          pipeline_run_id,
          content_id,
          stage_key,
          stage_order,
          step_status
        ) values ($1,$2,$3,$4,'pending')`,
        [run.pipeline_run_id, normalizedContentId, stageKey, index + 1],
      );
    }

    await recordPipelineEvent(client, {
      pipelineRunId: run.pipeline_run_id,
      contentId: normalizedContentId,
      eventType: 'run_queued',
      message: `Queued ${PIPELINE_ACTION_LABELS[action] || action}.`,
      details: { requested_action: action, reel_type: normalizedReelType, stage_plan: stages },
    });

    return getPipelineRunById(client, run.pipeline_run_id, { includeEvents: true });
  });
}

export async function getPipelineRunById(clientOrPool, pipelineRunId, { includeEvents = true, existing = false } = {}) {
  const normalizedRunId = normalizeUuid(pipelineRunId, 'pipeline_run_id');
  const runQuery = async (client) => {
    const runResult = await client.query(
      `select
        pr.*,
        ci.title as content_title,
        ci.slug as content_slug,
        ci.status as content_status,
        ci.reel_type as content_reel_type
      from pipeline_runs pr
      left join content_items ci on ci.content_id = pr.content_id
      where pr.pipeline_run_id = $1`,
      [normalizedRunId],
    );
    if (runResult.rowCount === 0) {
      throw new Error(`Unknown pipeline_run_id '${normalizedRunId}'.`);
    }

    const stepsResult = await client.query(
      `select *
      from pipeline_steps
      where pipeline_run_id = $1
      order by stage_order asc`,
      [normalizedRunId],
    );

    const eventsResult = includeEvents
      ? await client.query(
        `select *
        from pipeline_events
        where pipeline_run_id = $1
        order by created_at desc
        limit 200`,
        [normalizedRunId],
      )
      : { rows: [] };

    return {
      existing,
      ...runResult.rows[0],
      steps: stepsResult.rows,
      events: eventsResult.rows.reverse(),
    };
  };

  if (typeof clientOrPool.connect === 'function') {
    return withClient(clientOrPool, runQuery);
  }
  return runQuery(clientOrPool);
}

export async function listPipelineRuns(pool, { limit = 25 } = {}) {
  return withClient(pool, async (client) => {
    await ensurePipelineSchema(client);
    const result = await client.query(
      `select
        pr.*,
        ci.title as content_title,
        ci.slug as content_slug,
        ci.status as content_status,
        ci.reel_type as content_reel_type
      from pipeline_runs pr
      left join content_items ci on ci.content_id = pr.content_id
      order by pr.created_at desc
      limit $1`,
      [Math.max(1, Math.min(Number(limit) || 25, 100))],
    );
    return result.rows;
  });
}

export async function resetStaleRunningSteps(pool, { staleSeconds = 900 } = {}) {
  return withTransaction(pool, async (client) => {
    await ensurePipelineSchema(client);
    const result = await client.query(
      `with stale_steps as (
        update pipeline_steps ps
        set step_status = 'pending',
            error_message = coalesce(error_message, 'Reset from stale running state by code-first worker.'),
            started_at = null,
            ended_at = null,
            duration_ms = null,
            updated_at = now()
        from pipeline_runs pr
        where ps.pipeline_run_id = pr.pipeline_run_id
          and ps.step_status = 'running'
          and ps.started_at < now() - ($1::int * interval '1 second')
        returning ps.pipeline_run_id, ps.pipeline_step_id, ps.content_id, ps.stage_key
      ), stale_runs as (
        update pipeline_runs pr
        set status = 'queued',
            locked_by = null,
            locked_at = null,
            updated_at = now()
        where pr.pipeline_run_id in (select pipeline_run_id from stale_steps)
        returning pr.pipeline_run_id
      )
      select * from stale_steps`,
      [Math.max(60, Number(staleSeconds) || 900)],
    );
    for (const row of result.rows) {
      await recordPipelineEvent(client, {
        pipelineRunId: row.pipeline_run_id,
        pipelineStepId: row.pipeline_step_id,
        contentId: row.content_id,
        eventType: 'step_reset',
        eventLevel: 'warning',
        stageKey: row.stage_key,
        message: `Reset stale running step ${row.stage_key}.`,
      });
    }
    return result.rows;
  });
}

export async function claimNextPipelineStep(pool, { workerId }) {
  return withTransaction(pool, async (client) => {
    await ensurePipelineSchema(client);
    const result = await client.query(
      `select
        ps.*,
        pr.requested_action,
        pr.reel_type,
        pr.status as run_status,
        pr.stage_plan,
        pr.summary_json as run_summary_json
      from pipeline_steps ps
      join pipeline_runs pr on pr.pipeline_run_id = ps.pipeline_run_id
      where pr.status in ('queued', 'running')
        and ps.step_status = 'pending'
        and not exists (
          select 1
          from pipeline_steps earlier
          where earlier.pipeline_run_id = ps.pipeline_run_id
            and earlier.stage_order < ps.stage_order
            and earlier.step_status in ('pending', 'running')
        )
      order by pr.created_at asc, ps.stage_order asc
      for update of ps, pr skip locked
      limit 1`,
    );
    if (result.rowCount === 0) {
      return null;
    }

    const step = result.rows[0];
    const now = new Date().toISOString();
    await client.query(
      `update pipeline_steps
      set step_status = 'running',
          attempts = attempts + 1,
          started_at = coalesce(started_at, now()),
          ended_at = null,
          error_message = null,
          updated_at = now()
      where pipeline_step_id = $1`,
      [step.pipeline_step_id],
    );
    await client.query(
      `update pipeline_runs
      set status = 'running',
          current_stage = $2,
          locked_by = $3,
          locked_at = now(),
          started_at = coalesce(started_at, now()),
          updated_at = now()
      where pipeline_run_id = $1`,
      [step.pipeline_run_id, step.stage_key, workerId],
    );
    await recordPipelineEvent(client, {
      pipelineRunId: step.pipeline_run_id,
      pipelineStepId: step.pipeline_step_id,
      contentId: step.content_id,
      eventType: 'step_started',
      stageKey: step.stage_key,
      message: `Started ${step.stage_key}.`,
      details: { worker_id: workerId, started_at: now, attempt: Number(step.attempts || 0) + 1 },
    });

    return {
      ...step,
      attempts: Number(step.attempts || 0) + 1,
      started_at: now,
    };
  });
}

export async function completePipelineStep(pool, step, outputSummary = {}) {
  return withTransaction(pool, async (client) => {
    const endedAt = new Date();
    const startedAt = step.started_at ? new Date(step.started_at) : endedAt;
    const durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
    await client.query(
      `update pipeline_steps
      set step_status = 'succeeded',
          ended_at = now(),
          duration_ms = $2,
          output_summary_json = $3::jsonb,
          error_message = null,
          updated_at = now()
      where pipeline_step_id = $1`,
      [step.pipeline_step_id, durationMs, JSON.stringify(outputSummary ?? {})],
    );
    await recordPipelineEvent(client, {
      pipelineRunId: step.pipeline_run_id,
      pipelineStepId: step.pipeline_step_id,
      contentId: step.content_id,
      eventType: 'step_succeeded',
      stageKey: step.stage_key,
      message: `Completed ${step.stage_key}.`,
      details: { duration_ms: durationMs, output: outputSummary },
    });

    const pending = await client.query(
      `select count(*)::int as count
      from pipeline_steps
      where pipeline_run_id = $1
        and step_status = 'pending'`,
      [step.pipeline_run_id],
    );
    if (Number(pending.rows[0]?.count || 0) > 0) {
      const next = await client.query(
        `select stage_key
        from pipeline_steps
        where pipeline_run_id = $1
          and step_status = 'pending'
        order by stage_order asc
        limit 1`,
        [step.pipeline_run_id],
      );
      await client.query(
        `update pipeline_runs
        set current_stage = $2,
            locked_by = null,
            locked_at = null,
            updated_at = now()
        where pipeline_run_id = $1`,
        [step.pipeline_run_id, next.rows[0]?.stage_key ?? null],
      );
      return { terminal: false };
    }

    const terminalStatus = step.requested_action === 'generate_reel' ? 'awaiting_approval' : 'completed';
    const currentStage = step.requested_action === 'generate_reel' ? 'awaiting_approval' : 'completed';
    await client.query(
      `update pipeline_runs
      set status = $2,
          current_stage = $3,
          summary_json = summary_json || $4::jsonb,
          locked_by = null,
          locked_at = null,
          completed_at = now(),
          updated_at = now()
      where pipeline_run_id = $1`,
      [
        step.pipeline_run_id,
        terminalStatus,
        currentStage,
        JSON.stringify({ terminal_status: terminalStatus, terminal_stage: currentStage }),
      ],
    );
    await recordPipelineEvent(client, {
      pipelineRunId: step.pipeline_run_id,
      contentId: step.content_id,
      eventType: 'run_terminal',
      eventLevel: terminalStatus === 'awaiting_approval' ? 'warning' : 'info',
      stageKey: currentStage,
      message: terminalStatus === 'awaiting_approval'
        ? 'Pipeline finished generation and is waiting for Studio approval.'
        : 'Pipeline run completed.',
    });
    return { terminal: true, status: terminalStatus };
  });
}

export async function failPipelineStep(pool, step, error) {
  const message = String(error?.message || error || 'Pipeline step failed.').slice(0, 8000);
  return withTransaction(pool, async (client) => {
    const endedAt = new Date();
    const startedAt = step.started_at ? new Date(step.started_at) : endedAt;
    const durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
    await client.query(
      `update pipeline_steps
      set step_status = 'failed',
          ended_at = now(),
          duration_ms = $2,
          error_message = $3,
          updated_at = now()
      where pipeline_step_id = $1`,
      [step.pipeline_step_id, durationMs, message],
    );
    await client.query(
      `update pipeline_runs
      set status = 'failed',
          last_error = $2,
          locked_by = null,
          locked_at = null,
          completed_at = now(),
          updated_at = now()
      where pipeline_run_id = $1`,
      [step.pipeline_run_id, message],
    );
    await recordPipelineEvent(client, {
      pipelineRunId: step.pipeline_run_id,
      pipelineStepId: step.pipeline_step_id,
      contentId: step.content_id,
      eventType: 'step_failed',
      eventLevel: 'error',
      stageKey: step.stage_key,
      message,
      details: { stack: String(error?.stack || '').slice(0, 12000) },
    });
  });
}
