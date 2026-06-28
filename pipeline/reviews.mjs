import { withClient, withTransaction } from './db.mjs';
import { ensurePipelineSchema } from './schema.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REEL_TYPES = new Set(['image', 'video', 'avatar', 'hybrid']);

export const REVIEWABLE_STAGE_KEYS = Object.freeze([
  'idea_ingest',
  'story_package_generation',
  'remotion_manifest',
  'caption_and_hashtags',
]);

const REVIEW_STAGE_META = Object.freeze({
  idea_ingest: Object.freeze({
    kind: 'idea_payload',
    title: 'Review Injected Idea',
    summary: 'Approve or edit the ingested idea payload before the story package stage runs.',
  }),
  story_package_generation: Object.freeze({
    kind: 'story_package',
    title: 'Review Story Package',
    summary: 'Approve or edit generated script, storyboard, visual prompts, narration text, and render seed before asset generation.',
  }),
  remotion_manifest: Object.freeze({
    kind: 'render_manifest',
    title: 'Review Render Manifest',
    summary: 'Approve or edit the render manifest before Remotion renders the video.',
  }),
  caption_and_hashtags: Object.freeze({
    kind: 'caption_package',
    title: 'Review Caption Package',
    summary: 'Approve or edit final caption and hashtags before final QA.',
  }),
});

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function normalizeUuid(value, name = 'id') {
  const normalized = String(value || '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    fail(`${name} must be a valid UUID.`);
  }
  return normalized;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function trimString(value) {
  return String(value ?? '').trim();
}

function jsonEditableValue(value, fallback) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return value;
  return fallback;
}

function parseEditableJson(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return asObject(parsed);
    } catch (error) {
      fail(`edited_json must be valid JSON: ${error.message}`);
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    fail('edited_json must be a JSON object.');
  }
  return asObject(value);
}

function normalizeReviewMode(value) {
  if (value === true) return true;
  const normalized = trimString(value).toLowerCase();
  return ['true', '1', 'yes', 'review', 'required', 'human_review'].includes(normalized);
}

export function isReviewModeEnabled(summaryJson = {}) {
  const summary = asObject(summaryJson);
  return normalizeReviewMode(summary.review_mode || summary.human_review || summary.review_required);
}

export function isReviewableStage(stageKey) {
  return REVIEWABLE_STAGE_KEYS.includes(trimString(stageKey));
}

async function insertPipelineEvent(client, {
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

function stageMeta(stageKey) {
  return REVIEW_STAGE_META[stageKey] || {
    kind: 'stage_artifact',
    title: `Review ${stageKey}`,
    summary: 'Approve or edit generated stage output before the next phase runs.',
  };
}

async function fetchIdeaReviewPayload(client, contentId) {
  const result = await client.query(
    `select
      content_id,
      title,
      slug,
      category,
      reel_type,
      confidence_label,
      target_duration_seconds,
      status,
      source_payload_json
    from content_items
    where content_id = $1`,
    [contentId],
  );
  if (result.rowCount === 0) {
    fail(`No content item exists for ${contentId}.`, 404);
  }
  const row = result.rows[0];
  const editable = {
    title: trimString(row.title),
    category: trimString(row.category || 'general') || 'general',
    reel_type: trimString(row.reel_type || asObject(row.source_payload_json).reel_type || 'video') || 'video',
    confidence_label: trimString(row.confidence_label || 'unverified') || 'unverified',
    target_duration_seconds: Number(row.target_duration_seconds || 45),
    source_payload_json: asObject(row.source_payload_json),
  };
  return {
    artifact_json: {
      content_id: row.content_id,
      slug: trimString(row.slug),
      status: trimString(row.status),
      editable,
    },
    editable_json: editable,
  };
}

async function fetchStoryPackageReviewPayload(client, contentId, outputSummary = {}) {
  const result = await client.query(
    `select
      ci.content_id,
      ci.title,
      ci.confidence_label,
      s.hook_option_1,
      s.hook_option_2,
      s.hook_option_3,
      s.selected_hook,
      s.narration_script,
      s.short_script,
      s.caption_draft,
      s.cta_line,
      s.onscreen_text_json,
      s.generation_model,
      s.raw_response_json,
      sb.storyboard_json,
      sb.cover_prompt,
      sb.subtitle_lines_json,
      sb.style_notes,
      sb.render_manifest_seed_json
    from content_items ci
    join scripts s on s.content_id = ci.content_id
    join storyboards sb on sb.content_id = ci.content_id
    where ci.content_id = $1`,
    [contentId],
  );
  if (result.rowCount === 0) {
    fail(`No story package exists for ${contentId}.`, 404);
  }
  const row = result.rows[0];
  const rawResponse = asObject(row.raw_response_json);
  const parsedResponse = asObject(rawResponse.parsed_response);
  const editable = {
    confidence_label: trimString(row.confidence_label || parsedResponse.confidence_label || 'unverified') || 'unverified',
    script: {
      hook_option_1: trimString(row.hook_option_1),
      hook_option_2: trimString(row.hook_option_2),
      hook_option_3: trimString(row.hook_option_3),
      selected_hook: trimString(row.selected_hook),
      narration_script: trimString(row.narration_script),
      short_script: trimString(row.short_script),
      caption_draft: trimString(row.caption_draft),
      cta_line: trimString(row.cta_line),
      music_direction: trimString(parsedResponse.music_direction || rawResponse.music_direction),
      onscreen_text_json: row.onscreen_text_json ?? [],
    },
    storyboard: {
      storyboard_json: row.storyboard_json ?? [],
      cover_prompt: trimString(row.cover_prompt),
      subtitle_lines_json: row.subtitle_lines_json ?? [],
      style_notes: trimString(row.style_notes),
      render_manifest_seed_json: row.render_manifest_seed_json ?? {},
    },
  };
  return {
    artifact_json: {
      content_id: row.content_id,
      title: trimString(row.title),
      generation_model: trimString(row.generation_model),
      output_summary: outputSummary,
      editable,
    },
    editable_json: editable,
  };
}

async function fetchRenderManifestReviewPayload(client, contentId, outputSummary = {}) {
  const result = await client.query(
    `select
      render_id,
      content_id,
      render_manifest_json,
      cover_image_url,
      resolution,
      aspect_ratio,
      duration_seconds,
      render_status
    from renders
    where content_id = $1`,
    [contentId],
  );
  if (result.rowCount === 0) {
    fail(`No render manifest exists for ${contentId}.`, 404);
  }
  const row = result.rows[0];
  const editable = {
    render_manifest_json: asObject(row.render_manifest_json),
    cover_image_url: trimString(row.cover_image_url),
    resolution: trimString(row.resolution || '1080x1920') || '1080x1920',
    aspect_ratio: trimString(row.aspect_ratio || '9:16') || '9:16',
    duration_seconds: Number(row.duration_seconds || 0),
  };
  return {
    artifact_json: {
      render_id: row.render_id,
      content_id: row.content_id,
      render_status: trimString(row.render_status),
      output_summary: outputSummary,
      editable,
    },
    editable_json: editable,
  };
}

async function fetchCaptionReviewPayload(client, contentId, outputSummary = {}) {
  const result = await client.query(
    `select
      publish_id,
      content_id,
      caption_final,
      hashtags_final,
      publish_status
    from publishes
    where content_id = $1
      and platform = 'instagram'`,
    [contentId],
  );
  if (result.rowCount === 0) {
    fail(`No caption package exists for ${contentId}.`, 404);
  }
  const row = result.rows[0];
  const editable = {
    caption_final: trimString(row.caption_final),
    hashtags_final: trimString(row.hashtags_final),
  };
  return {
    artifact_json: {
      publish_id: row.publish_id,
      content_id: row.content_id,
      publish_status: trimString(row.publish_status),
      output_summary: outputSummary,
      editable,
    },
    editable_json: editable,
  };
}

async function buildReviewPayload(client, stageKey, contentId, outputSummary = {}) {
  if (stageKey === 'idea_ingest') return fetchIdeaReviewPayload(client, contentId);
  if (stageKey === 'story_package_generation') return fetchStoryPackageReviewPayload(client, contentId, outputSummary);
  if (stageKey === 'remotion_manifest') return fetchRenderManifestReviewPayload(client, contentId, outputSummary);
  if (stageKey === 'caption_and_hashtags') return fetchCaptionReviewPayload(client, contentId, outputSummary);
  fail(`Stage '${stageKey}' is not reviewable.`);
}

export async function createPendingPipelineReview(client, {
  pipelineRunId,
  pipelineStepId = null,
  contentId,
  stageKey,
  outputSummary = {},
}) {
  const normalizedRunId = normalizeUuid(pipelineRunId, 'pipeline_run_id');
  const normalizedContentId = normalizeUuid(contentId, 'content_id');
  const normalizedStageKey = trimString(stageKey);
  if (!isReviewableStage(normalizedStageKey)) {
    return null;
  }

  const meta = stageMeta(normalizedStageKey);
  const payload = await buildReviewPayload(client, normalizedStageKey, normalizedContentId, outputSummary);
  const result = await client.query(
    `insert into pipeline_reviews (
      pipeline_run_id,
      content_id,
      stage_key,
      review_kind,
      review_status,
      title,
      summary,
      artifact_json,
      editable_json,
      approved_json,
      reviewer,
      review_note,
      approved_at,
      updated_at
    ) values ($1,$2,$3,$4,'pending',$5,$6,$7::jsonb,$8::jsonb,null,null,null,null,now())
    on conflict (pipeline_run_id, stage_key, review_kind) do update set
      review_status = 'pending',
      title = excluded.title,
      summary = excluded.summary,
      artifact_json = excluded.artifact_json,
      editable_json = excluded.editable_json,
      approved_json = null,
      reviewer = null,
      review_note = null,
      approved_at = null,
      updated_at = now()
    returning *`,
    [
      normalizedRunId,
      normalizedContentId,
      normalizedStageKey,
      meta.kind,
      meta.title,
      meta.summary,
      JSON.stringify(payload.artifact_json ?? {}),
      JSON.stringify(payload.editable_json ?? {}),
    ],
  );
  const review = result.rows[0];
  await insertPipelineEvent(client, {
    pipelineRunId: normalizedRunId,
    pipelineStepId,
    contentId: normalizedContentId,
    eventType: 'review_requested',
    eventLevel: 'warning',
    stageKey: normalizedStageKey,
    message: `${meta.title} is waiting for approval.`,
    details: {
      review_id: review.review_id,
      review_kind: meta.kind,
    },
  });
  return review;
}

export async function createInitialIdeaReview(client, {
  pipelineRunId,
  contentId,
}) {
  return createPendingPipelineReview(client, {
    pipelineRunId,
    contentId,
    stageKey: 'idea_ingest',
  });
}

export async function maybeCreateReviewForCompletedStep(client, step, outputSummary = {}) {
  const summary = asObject(step.run_summary_json);
  if (!isReviewModeEnabled(summary)) {
    return null;
  }
  if (trimString(step.requested_action) !== 'generate_reel') {
    return null;
  }
  const stageKey = trimString(step.stage_key);
  if (stageKey === 'idea_ingest' || !isReviewableStage(stageKey)) {
    return null;
  }
  return createPendingPipelineReview(client, {
    pipelineRunId: step.pipeline_run_id,
    pipelineStepId: step.pipeline_step_id,
    contentId: step.content_id,
    stageKey,
    outputSummary,
  });
}

export async function listPipelineReviews(pool, {
  status = '',
  limit = 20,
} = {}) {
  return withClient(pool, async (client) => {
    await ensurePipelineSchema(client);
    const normalizedStatus = trimString(status).toLowerCase();
    const params = [Math.max(1, Math.min(Number(limit) || 20, 100))];
    const statusClause = normalizedStatus ? 'where pr.review_status = $2' : '';
    if (normalizedStatus) params.push(normalizedStatus);
    const result = await client.query(
      `select
        pr.*,
        ci.title as content_title,
        ci.slug as content_slug,
        ci.status as content_status,
        run.status as pipeline_status,
        run.current_stage as pipeline_current_stage
      from pipeline_reviews pr
      left join content_items ci on ci.content_id = pr.content_id
      left join pipeline_runs run on run.pipeline_run_id = pr.pipeline_run_id
      ${statusClause}
      order by
        case pr.review_status when 'pending' then 0 else 1 end,
        pr.updated_at desc
      limit $1`,
      params,
    );
    return result.rows;
  });
}

export async function getPipelineReviewById(pool, reviewId) {
  const normalizedReviewId = normalizeUuid(reviewId, 'review_id');
  return withClient(pool, async (client) => {
    await ensurePipelineSchema(client);
    const result = await client.query(
      `select
        pr.*,
        ci.title as content_title,
        ci.slug as content_slug,
        ci.status as content_status,
        run.status as pipeline_status,
        run.current_stage as pipeline_current_stage
      from pipeline_reviews pr
      left join content_items ci on ci.content_id = pr.content_id
      left join pipeline_runs run on run.pipeline_run_id = pr.pipeline_run_id
      where pr.review_id = $1`,
      [normalizedReviewId],
    );
    if (result.rowCount === 0) {
      fail(`Unknown review_id '${normalizedReviewId}'.`, 404);
    }
    return result.rows[0];
  });
}

function normalizePositiveInteger(value, name) {
  const parsed = Number.parseInt(trimString(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`${name} must be a positive integer.`);
  }
  return parsed;
}

function normalizeReelTypeForReview(value) {
  const normalized = trimString(value || 'video').toLowerCase() || 'video';
  if (!REEL_TYPES.has(normalized)) {
    fail(`reel_type must be one of: ${Array.from(REEL_TYPES).join(', ')}.`);
  }
  return normalized;
}

function requireString(object, key, label = key) {
  const value = trimString(asObject(object)[key]);
  if (!value) {
    fail(`${label} is required.`);
  }
  return value;
}

async function applyIdeaReviewEdits(client, review, approvedJson) {
  const editable = asObject(approvedJson);
  const title = requireString(editable, 'title');
  const category = trimString(editable.category || 'general') || 'general';
  const reelType = normalizeReelTypeForReview(editable.reel_type || asObject(editable.source_payload_json).reel_type || 'video');
  const confidenceLabel = trimString(editable.confidence_label || 'unverified') || 'unverified';
  const targetDurationSeconds = normalizePositiveInteger(editable.target_duration_seconds || 45, 'target_duration_seconds');
  const sourcePayload = {
    ...asObject(editable.source_payload_json),
    reel_type: reelType,
  };

  await client.query(
    `update content_items
    set title = $2,
        category = $3,
        reel_type = $4,
        confidence_label = $5,
        target_duration_seconds = $6,
        source_payload_json = $7::jsonb,
        updated_at = now()
    where content_id = $1`,
    [
      review.content_id,
      title,
      category,
      reelType,
      confidenceLabel,
      targetDurationSeconds,
      JSON.stringify(sourcePayload),
    ],
  );
}

async function applyStoryPackageReviewEdits(client, review, approvedJson) {
  const editable = asObject(approvedJson);
  const script = asObject(editable.script);
  const storyboard = asObject(editable.storyboard);
  const selectedHook = requireString(script, 'selected_hook', 'script.selected_hook');
  const narrationScript = requireString(script, 'narration_script', 'script.narration_script');
  const shortScript = requireString(script, 'short_script', 'script.short_script');
  const captionDraft = requireString(script, 'caption_draft', 'script.caption_draft');
  const ctaLine = requireString(script, 'cta_line', 'script.cta_line');
  const storyboardJson = asArray(storyboard.storyboard_json);
  if (storyboardJson.length === 0) {
    fail('storyboard.storyboard_json must contain at least one scene.');
  }
  const renderManifestSeedJson = asObject(storyboard.render_manifest_seed_json);
  const onscreenTextJson = jsonEditableValue(script.onscreen_text_json, []);
  const subtitleLinesJson = jsonEditableValue(storyboard.subtitle_lines_json, []);
  const confidenceLabel = trimString(editable.confidence_label || 'unverified') || 'unverified';
  const musicDirection = trimString(script.music_direction);

  const rawResult = await client.query(
    `select raw_response_json from scripts where content_id = $1`,
    [review.content_id],
  );
  const raw = asObject(rawResult.rows[0]?.raw_response_json);
  const parsedResponse = {
    ...asObject(raw.parsed_response),
    confidence_label: confidenceLabel,
    hook_option_1: trimString(script.hook_option_1),
    hook_option_2: trimString(script.hook_option_2),
    hook_option_3: trimString(script.hook_option_3),
    selected_hook: selectedHook,
    narration_script: narrationScript,
    short_script: shortScript,
    caption_draft: captionDraft,
    cta_line: ctaLine,
    music_direction: musicDirection,
    onscreen_text_json: onscreenTextJson,
    storyboard_json: storyboardJson,
    subtitle_lines_json: subtitleLinesJson,
    render_manifest_seed_json: renderManifestSeedJson,
  };
  const nextRaw = {
    ...raw,
    music_direction: musicDirection,
    parsed_response: parsedResponse,
  };

  await client.query(
    `update scripts
    set hook_option_1 = $2,
        hook_option_2 = $3,
        hook_option_3 = $4,
        selected_hook = $5,
        narration_script = $6,
        short_script = $7,
        caption_draft = $8,
        cta_line = $9,
        onscreen_text_json = $10::jsonb,
        raw_response_json = $11::jsonb,
        approved_by_human = true,
        generated_at = now()
    where content_id = $1`,
    [
      review.content_id,
      trimString(script.hook_option_1),
      trimString(script.hook_option_2),
      trimString(script.hook_option_3),
      selectedHook,
      narrationScript,
      shortScript,
      captionDraft,
      ctaLine,
      JSON.stringify(onscreenTextJson),
      JSON.stringify(nextRaw),
    ],
  );
  await client.query(
    `update storyboards
    set storyboard_json = $2::jsonb,
        cover_prompt = $3,
        subtitle_lines_json = $4::jsonb,
        style_notes = $5,
        render_manifest_seed_json = $6::jsonb,
        generated_at = now()
    where content_id = $1`,
    [
      review.content_id,
      JSON.stringify(storyboardJson),
      trimString(storyboard.cover_prompt),
      JSON.stringify(subtitleLinesJson),
      trimString(storyboard.style_notes),
      JSON.stringify(renderManifestSeedJson),
    ],
  );
  await client.query(
    `update content_items
    set confidence_label = $2,
        updated_at = now()
    where content_id = $1`,
    [review.content_id, confidenceLabel],
  );
}

async function applyRenderManifestReviewEdits(client, review, approvedJson) {
  const editable = asObject(approvedJson);
  const manifest = asObject(editable.render_manifest_json);
  if (!Array.isArray(manifest.scenes) || !Array.isArray(manifest.timeline)) {
    fail('render_manifest_json must include scenes and timeline arrays.');
  }
  await client.query(
    `update renders
    set render_manifest_json = $2::jsonb,
        cover_image_url = nullif($3, ''),
        resolution = $4,
        aspect_ratio = $5,
        duration_seconds = $6,
        render_status = 'manifest_ready',
        output_video_url = null,
        completed_at = null,
        requested_at = now()
    where content_id = $1`,
    [
      review.content_id,
      JSON.stringify(manifest),
      trimString(editable.cover_image_url),
      trimString(editable.resolution || '1080x1920') || '1080x1920',
      trimString(editable.aspect_ratio || '9:16') || '9:16',
      Number.isFinite(Number(editable.duration_seconds)) ? Number(editable.duration_seconds) : null,
    ],
  );
}

async function applyCaptionReviewEdits(client, review, approvedJson) {
  const editable = asObject(approvedJson);
  const captionFinal = requireString(editable, 'caption_final');
  const hashtagsFinal = trimString(editable.hashtags_final);
  await client.query(
    `update publishes
    set caption_final = $2,
        hashtags_final = $3,
        publish_status = case
          when publish_status = 'published' then publish_status
          else 'draft'
        end
    where content_id = $1
      and platform = 'instagram'`,
    [review.content_id, captionFinal, hashtagsFinal],
  );
}

async function applyReviewEdits(client, review, approvedJson) {
  const stageKey = trimString(review.stage_key);
  if (stageKey === 'idea_ingest') return applyIdeaReviewEdits(client, review, approvedJson);
  if (stageKey === 'story_package_generation') return applyStoryPackageReviewEdits(client, review, approvedJson);
  if (stageKey === 'remotion_manifest') return applyRenderManifestReviewEdits(client, review, approvedJson);
  if (stageKey === 'caption_and_hashtags') return applyCaptionReviewEdits(client, review, approvedJson);
  fail(`Stage '${stageKey}' is not reviewable.`);
}

export async function approvePipelineReview(pool, reviewId, {
  editedJson,
  reviewer = '',
  reviewNote = '',
} = {}) {
  const normalizedReviewId = normalizeUuid(reviewId, 'review_id');
  const approvedBy = trimString(reviewer) || 'Studio reviewer';
  const note = trimString(reviewNote);
  const parsedEditedJson = parseEditableJson(editedJson);

  return withTransaction(pool, async (client) => {
    await ensurePipelineSchema(client);
    const result = await client.query(
      `select *
      from pipeline_reviews
      where review_id = $1
      for update`,
      [normalizedReviewId],
    );
    if (result.rowCount === 0) {
      fail(`Unknown review_id '${normalizedReviewId}'.`, 404);
    }
    const review = result.rows[0];
    if (trimString(review.review_status) !== 'pending') {
      fail(`Review ${normalizedReviewId} is already ${review.review_status}.`, 409);
    }
    const approvedJson = parsedEditedJson ?? asObject(review.editable_json);
    await applyReviewEdits(client, review, approvedJson);

    const updatedReviewResult = await client.query(
      `update pipeline_reviews
      set review_status = 'approved',
          approved_json = $2::jsonb,
          reviewer = $3,
          review_note = nullif($4, ''),
          approved_at = now(),
          updated_at = now()
      where review_id = $1
      returning *`,
      [normalizedReviewId, JSON.stringify(approvedJson), approvedBy, note],
    );
    const nextStep = await client.query(
      `select stage_key
      from pipeline_steps
      where pipeline_run_id = $1
        and step_status = 'pending'
      order by stage_order asc
      limit 1`,
      [review.pipeline_run_id],
    );
    const nextStage = trimString(nextStep.rows[0]?.stage_key);
    await client.query(
      `update pipeline_runs
      set status = case when $2 = '' then status else 'queued' end,
          current_stage = nullif($2, ''),
          last_error = null,
          locked_by = null,
          locked_at = null,
          updated_at = now()
      where pipeline_run_id = $1`,
      [review.pipeline_run_id, nextStage],
    );
    await insertPipelineEvent(client, {
      pipelineRunId: review.pipeline_run_id,
      contentId: review.content_id,
      eventType: 'review_approved',
      stageKey: trimString(review.stage_key),
      message: `${review.title} approved by ${approvedBy}.`,
      details: {
        review_id: review.review_id,
        next_stage: nextStage || null,
        edited: parsedEditedJson !== null,
      },
    });
    return updatedReviewResult.rows[0];
  });
}
