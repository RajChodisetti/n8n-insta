import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction } from './db.mjs';
import { uploadBinaryAsset } from '../workflows/scripts/asset_host_adapters.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message) {
  throw new Error(message);
}

function ensureUuid(value, name = 'content_id') {
  const normalized = String(value || '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    fail(`${name} must be a valid UUID.`);
  }
  return normalized;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function trimString(value) {
  return String(value ?? '').trim();
}

function roundToHundredths(value) {
  return Number(Number(value || 0).toFixed(2));
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function objectKeyForRole(contentId, role, extension) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const prefix = trimString(process.env.REELS_STORAGE_KEY_PREFIX || 'generated/instagram-posts').replace(/^\/+|\/+$/g, '') || 'generated/instagram-posts';
  const safeRole = trimString(role || 'asset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
  const safeExtension = trimString(extension || 'bin').replace(/^\.+/, '') || 'bin';
  return `${prefix}/${safeRole}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${contentId}.${safeExtension}`;
}

function parseJsonOutput(stdout, label) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      // Keep scanning; helper scripts may print informational lines.
    }
  }
  fail(`${label} did not return JSON output.`);
}

function runNodeScript(relativeScriptPath, args = [], { env = {}, label = relativeScriptPath } = {}) {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, relativeScriptPath), ...args],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    const stderr = trimString(result.stderr);
    const stdout = trimString(result.stdout);
    fail(`${label} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : '.'}`);
  }
  return parseJsonOutput(result.stdout, label);
}

async function logWorkflowRun(client, {
  contentId,
  workflowName,
  runStatus = 'success',
  startedAt = new Date().toISOString(),
  durationMs = 0,
  errorMessage = null,
  details = {},
}) {
  await client.query(
    `insert into workflow_runs (
      content_id,
      workflow_name,
      run_status,
      started_at,
      ended_at,
      duration_ms,
      error_message,
      details_json
    ) values ($1,$2,$3,$4::timestamptz,now(),$5,$6,$7::jsonb)`,
    [
      contentId,
      workflowName,
      runStatus,
      startedAt,
      Math.max(0, Number(durationMs) || 0),
      errorMessage,
      JSON.stringify(details ?? {}),
    ],
  );
}

function durationMsFrom(startedAt) {
  const started = new Date(String(startedAt || new Date().toISOString()));
  return Math.max(0, Date.now() - started.getTime());
}

async function runStoryPackageGeneration({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  return runNodeScript(
    'workflows/scripts/run_story_package_generation.mjs',
    [],
    {
      label: 'story_package_generation',
      env: {
        CODE_PIPELINE_CONTENT_ID: contentId,
      },
    },
  );
}

function buildAssetGenerationPayload(candidate, workflowName) {
  const directorJson = asObject(candidate.director_json);
  return {
    ...candidate,
    scenes: asArray(candidate.storyboard_json),
    character_reference: asObject(candidate.source_payload_json)?.character_reference ?? null,
    prompt_profile: asObject(asObject(candidate.source_payload_json).prompt_profile),
    director_global_visual_style: trimString(directorJson.global_visual_style),
    director_avoid_rules: [
      trimString(directorJson.global_avoid_rules),
      trimString(directorJson.avoid_rules),
      trimString(directorJson.visual_avoid_rules),
    ].filter(Boolean).join(' | '),
    workflow_name: workflowName,
    run_started_at: new Date().toISOString(),
  };
}

async function persistSceneAssets(pool, contentId, sceneAssets, result, workflowName) {
  await withTransaction(pool, async (client) => {
    await client.query(
      `delete from assets
      where content_id = $1
        and asset_role in ('scene_image', 'scene_video')`,
      [contentId],
    );
    for (const asset of sceneAssets) {
      await client.query(
        `insert into assets (
          content_id,
          scene_number,
          asset_role,
          provider,
          source_url,
          storage_url,
          mime_type,
          duration_seconds,
          width,
          height,
          status,
          metadata_json
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ready',$11::jsonb)`,
        [
          contentId,
          Number(asset.scene_number || 0) || null,
          trimString(asset.asset_role || 'scene_video'),
          trimString(asset.provider),
          trimString(asset.source_url),
          trimString(asset.storage_url),
          trimString(asset.mime_type),
          Number.isFinite(Number(asset.duration_seconds)) ? Number(asset.duration_seconds) : null,
          Number.isFinite(Number(asset.width)) ? Number(asset.width) : null,
          Number.isFinite(Number(asset.height)) ? Number(asset.height) : null,
          JSON.stringify(asObject(asset.metadata_json)),
        ],
      );
    }
    await client.query(
      `update content_items
      set status = 'assets_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName,
      startedAt: result.run_started_at,
      durationMs: durationMsFrom(result.run_started_at),
      details: {
        generation_model: result.generation_model || '',
        generation_provider: result.generation_provider || '',
        rehost_provider: result.rehost_provider || '',
        scene_count: sceneAssets.length,
        cost: result.cost ?? {},
      },
    });
  });
}

async function fetchAndClaimAssetCandidate(pool, contentId) {
  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.status,
        ci.source_payload_json,
        sb.storyboard_json,
        coalesce(sb.style_notes, '') as style_notes,
        coalesce(s.selected_hook, '') as selected_hook,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(d.director_json, '{}'::jsonb) as director_json
      from content_items ci
      join storyboards sb on sb.content_id = ci.content_id
      join scripts s on s.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      where ci.content_id = $1
        and ci.status in ('validation_complete', 'storyboard_complete', 'generating_assets')
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No storyboard_complete content item is ready for asset generation: ${contentId}.`);
    }
    await client.query(
      `update content_items
      set status = 'generating_assets',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    return result.rows[0];
  });
}

async function runAssetGenerationV3({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const candidate = await fetchAndClaimAssetCandidate(pool, contentId);
  const payload = buildAssetGenerationPayload(candidate, 'wf_asset_generation_v3');
  const result = runNodeScript(
    'workflows/scripts/generate_and_rehost_scene_assets_v3.mjs',
    [encodePayload(payload)],
    { label: 'asset_generation_v3' },
  );

  const sceneAssets = asArray(result.scene_assets);
  if (sceneAssets.length === 0) {
    fail('asset_generation_v3 returned no scene assets.');
  }

  await persistSceneAssets(pool, contentId, sceneAssets, result, 'wf_asset_generation_v3');

  return {
    content_id: contentId,
    status_after_success: 'assets_ready',
    scene_count: sceneAssets.length,
    cost: result.cost ?? {},
  };
}

async function runImageAssetGeneration({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const candidate = await fetchAndClaimAssetCandidate(pool, contentId);
  const payload = buildAssetGenerationPayload(candidate, 'wf_image_asset_generation');
  const result = runNodeScript(
    'workflows/scripts/generate_and_rehost_scene_assets.mjs',
    [encodePayload(payload)],
    { label: 'image_asset_generation' },
  );

  const sceneAssets = asArray(result.scene_assets);
  if (sceneAssets.length === 0) {
    fail('image_asset_generation returned no scene assets.');
  }

  await persistSceneAssets(pool, contentId, sceneAssets, result, 'wf_image_asset_generation');

  return {
    content_id: contentId,
    status_after_success: 'assets_ready',
    scene_count: sceneAssets.length,
    cost: result.cost ?? {},
  };
}

async function fetchAndClaimNarrationCandidate(pool, contentId) {
  return withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'generating_narration',
          updated_at = now()
      where content_id = $1
        and status in ('assets_ready', 'generating_narration')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No assets_ready content item is ready for narration generation: ${contentId}.`);
    }
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.status,
        ci.target_duration_seconds,
        ci.source_payload_json,
        s.narration_script,
        coalesce(s.raw_response_json->>'v2_story_package', 'false') as is_v2_story_package,
        sb.storyboard_json,
        count(distinct a.scene_number)::int as scene_asset_count,
        coalesce(d.director_json, '{}'::jsonb) as director_json
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      join storyboards sb on sb.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      join assets a on a.content_id = ci.content_id
        and a.asset_role in ('scene_image', 'scene_video')
        and a.status = 'ready'
      where ci.content_id = $1
        and ci.status = 'generating_narration'
      group by ci.content_id, ci.title, ci.status, ci.target_duration_seconds, ci.source_payload_json,
        s.narration_script, s.raw_response_json, sb.storyboard_json, d.director_json
      having count(distinct a.scene_number) >= jsonb_array_length(sb.storyboard_json)`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`Content item does not have enough ready scene assets for narration generation: ${contentId}.`);
    }
    return result.rows[0];
  });
}

async function runNarrationGeneration({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const candidate = await fetchAndClaimNarrationCandidate(pool, contentId);
  const directorJson = asObject(candidate.director_json);
  const payload = {
    ...candidate,
    workflow_name: 'wf_narration_generation',
    run_started_at: new Date().toISOString(),
    director_scenes: asArray(directorJson.scenes),
    director_tts_delivery: trimString(directorJson.tts_delivery),
    prompt_profile: asObject(candidate.source_payload_json?.prompt_profile),
  };
  const result = runNodeScript(
    'workflows/scripts/generate_and_rehost_narration_audio.mjs',
    [encodePayload(payload)],
    { label: 'narration_generation' },
  );

  const scenes = asArray(result.scenes);
  if (scenes.length === 0) {
    fail('narration_generation returned no narration scenes.');
  }

  await withTransaction(pool, async (client) => {
    await client.query(
      `delete from assets
      where content_id = $1
        and asset_role = 'scene_narration'`,
      [contentId],
    );
    for (const scene of scenes) {
      await client.query(
        `insert into assets (
          content_id,
          scene_number,
          asset_role,
          provider,
          source_url,
          storage_url,
          mime_type,
          duration_seconds,
          status,
          metadata_json
        ) values ($1,$2,'scene_narration',$3,$4,$5,$6,$7,'ready',$8::jsonb)`,
        [
          contentId,
          Number(scene.scene_number || 0) || null,
          trimString(scene.provider),
          trimString(scene.source_url),
          trimString(scene.storage_url),
          trimString(scene.mime_type || 'audio/mpeg'),
          Number.isFinite(Number(scene.duration_seconds)) ? Number(scene.duration_seconds) : null,
          JSON.stringify(asObject(scene.metadata_json)),
        ],
      );
    }
    await client.query(
      `update content_items
      set status = 'narration_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_narration_generation',
      startedAt: result.run_started_at,
      durationMs: durationMsFrom(result.run_started_at),
      details: {
        scene_count: scenes.length,
        total_duration_seconds: Number(result.total_duration_seconds || 0),
        voice: trimString(scenes[0]?.metadata_json?.voice),
        generation_model: trimString(scenes[0]?.metadata_json?.generation_model),
        cost: result.cost ?? {},
      },
    });
  });

  return {
    content_id: contentId,
    status_after_success: 'narration_ready',
    scene_count: scenes.length,
    total_duration_seconds: Number(result.total_duration_seconds || 0),
    cost: result.cost ?? {},
  };
}

function getHeygenConfig() {
  const apiKey = trimString(process.env.HEYGEN_API_KEY);
  const avatarId = trimString(process.env.HEYGEN_AVATAR_ID);
  const voiceId = trimString(process.env.HEYGEN_VOICE_ID);
  const missing = [];
  if (!apiKey) missing.push('HEYGEN_API_KEY');
  if (!avatarId) missing.push('HEYGEN_AVATAR_ID');
  if (!voiceId) missing.push('HEYGEN_VOICE_ID');
  if (missing.length) {
    fail(`Avatar video generation requires ${missing.join(', ')}.`);
  }
  return {
    apiKey,
    avatarId,
    voiceId,
    callbackUrl: trimString(process.env.HEYGEN_CALLBACK_URL),
    pollIntervalMs: Math.max(1000, Number.parseInt(trimString(process.env.HEYGEN_POLL_INTERVAL_SECONDS || '10'), 10) * 1000 || 10000),
    timeoutMs: Math.max(60000, Number.parseInt(trimString(process.env.HEYGEN_TIMEOUT_SECONDS || '900'), 10) * 1000 || 900000),
    mockCompletedUrl: trimString(process.env.HEYGEN_MOCK_COMPLETED_URL),
  };
}

function evaluateAvatarConsent({ sourcePayload, clientAccountContext }) {
  const sourceContext = asObject(sourcePayload.client_account_context);
  const context = Object.keys(clientAccountContext).length ? clientAccountContext : sourceContext;
  const avatarPolicy = asObject(context.avatar_policy);
  const avatarDecision = asObject(sourcePayload.avatar_decision);
  const presenterProfile = asObject(sourcePayload.presenter_profile ?? avatarDecision.presenter_profile);
  const presenterConsent = asObject(presenterProfile.consent);
  const allowedStatuses = new Set(['approved', 'active', 'valid', 'documented', 'current']);
  const consentStatus = trimString(
    presenterConsent.status
    || presenterConsent.consent_status
    || avatarPolicy.consent_status,
  ).toLowerCase();
  const consentRecordUri = trimString(
    avatarPolicy.consent_record_uri
    || presenterConsent.consent_record_uri
    || presenterProfile.consent_record_uri
    || process.env.HEYGEN_AVATAR_CONSENT_RECORD_URI,
  );
  const requiresConsent = avatarPolicy.requires_consent !== false;
  const avatarAllowed = avatarPolicy.avatar_allowed === true;
  const errors = [];

  if (!avatarAllowed) {
    errors.push('client/account avatar_policy.avatar_allowed must be true.');
  }
  if (requiresConsent && !consentRecordUri) {
    errors.push('avatar consent_record_uri is required.');
  }
  if (requiresConsent && consentStatus && !allowedStatuses.has(consentStatus)) {
    errors.push(`avatar consent status '${consentStatus}' is not allowed.`);
  }

  return {
    allowed: errors.length === 0,
    errors,
    avatar_policy: avatarPolicy,
    consent: {
      requires_consent: requiresConsent,
      consent_status: consentStatus || null,
      consent_record_uri: consentRecordUri || null,
    },
  };
}

async function runAvatarConsentGate({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const config = getHeygenConfig();
  const result = await withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'checking_avatar_consent',
          updated_at = now()
      where content_id = $1
        and reel_type = 'avatar'
        and status in ('storyboard_complete', 'checking_avatar_consent', 'avatar_consent_ready')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No avatar storyboard_complete content item is ready for avatar consent gate: ${contentId}.`);
    }
    const rowResult = await client.query(
      `select
        ci.content_id,
        coalesce(ci.source_payload_json, '{}'::jsonb) as source_payload_json,
        coalesce(cac.context_snapshot_json, ci.source_payload_json->'client_account_context', '{}'::jsonb) as client_account_context
      from content_items ci
      left join content_account_contexts cac on cac.content_id = ci.content_id
      where ci.content_id = $1
      for update of ci`,
      [contentId],
    );
    if (rowResult.rowCount === 0) {
      fail(`No content item exists for avatar consent gate: ${contentId}.`);
    }
    const evaluation = evaluateAvatarConsent({
      sourcePayload: asObject(rowResult.rows[0].source_payload_json),
      clientAccountContext: asObject(rowResult.rows[0].client_account_context),
    });
    if (!evaluation.allowed) {
      await client.query(
        `update content_items
        set status = 'avatar_consent_blocked',
            updated_at = now()
        where content_id = $1`,
        [contentId],
      );
      await logWorkflowRun(client, {
        contentId,
        workflowName: 'avatar_consent_gate',
        runStatus: 'failed',
        startedAt,
        durationMs: durationMsFrom(startedAt),
        errorMessage: evaluation.errors.join(' '),
        details: {
          provider: 'heygen',
          provider_call_blocked: true,
          consent: evaluation.consent,
          avatar_policy: evaluation.avatar_policy,
          errors: evaluation.errors,
        },
      });
      return { blocked: true, evaluation };
    }
    await client.query(
      `update content_items
      set status = 'avatar_consent_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'avatar_consent_gate',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        provider: 'heygen',
        provider_configured: Boolean(config.apiKey && config.avatarId && config.voiceId),
        consent: evaluation.consent,
        avatar_policy: evaluation.avatar_policy,
      },
    });
    return { blocked: false, evaluation };
  });

  if (result.blocked) {
    fail(`Avatar consent gate blocked provider calls: ${result.evaluation.errors.join(' ')}`);
  }

  return {
    content_id: contentId,
    status_after_success: 'avatar_consent_ready',
    consent: result.evaluation.consent,
  };
}

function extractHeygenVideoId(body = {}) {
  const data = asObject(body.data);
  const video = asObject(data.video);
  return trimString(
    body.video_id
    || body.id
    || data.video_id
    || data.id
    || video.video_id
    || video.id,
  );
}

function normalizeHeygenStatus(body = {}) {
  const data = asObject(body.data);
  const video = asObject(data.video);
  const status = trimString(
    body.status
    || body.provider_status
    || data.status
    || data.video_status
    || video.status,
  ).toLowerCase();
  return {
    status: status || 'unknown',
    outputUrl: trimString(
      body.output_url
      || body.video_url
      || body.url
      || data.output_url
      || data.video_url
      || data.url
      || video.output_url
      || video.video_url
      || video.url,
    ),
    thumbnailUrl: trimString(
      body.thumbnail_url
      || data.thumbnail_url
      || data.cover_url
      || video.thumbnail_url
      || video.cover_url,
    ),
    durationSeconds: Number(body.duration_seconds ?? data.duration_seconds ?? data.duration ?? video.duration_seconds ?? video.duration ?? 0) || null,
  };
}

async function heygenRequest({ method = 'GET', path: requestPath, apiKey, body = null }) {
  const response = await fetch(`https://api.heygen.com${requestPath}`, {
    method,
    headers: {
      'X-Api-Key': apiKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`HeyGen request failed (${response.status}): ${JSON.stringify(responseBody)}`);
  }
  return responseBody;
}

async function fetchBinaryAsset(assetUrl, label) {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    fail(`${label} download failed (${response.status}).`);
  }
  return {
    binary: Buffer.from(await response.arrayBuffer()),
    contentType: trimString(response.headers.get('content-type') || 'video/mp4') || 'video/mp4',
  };
}

async function runHeygenAvatarGeneration({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const config = getHeygenConfig();
  const row = await withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'generating_avatar',
          updated_at = now()
      where content_id = $1
        and reel_type = 'avatar'
        and status in ('avatar_consent_ready', 'generating_avatar')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No avatar_consent_ready content item is ready for HeyGen generation: ${contentId}.`);
    }
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.target_duration_seconds,
        coalesce(ci.source_payload_json, '{}'::jsonb) as source_payload_json,
        coalesce(s.narration_script, '') as narration_script
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      where ci.content_id = $1
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`HeyGen avatar generation requires a story script for ${contentId}.`);
    }
    return result.rows[0];
  });

  const narrationScript = trimString(row.narration_script);
  if (!narrationScript) fail('HeyGen avatar generation requires narration_script.');
  const requestBody = {
    type: 'avatar',
    avatar_id: config.avatarId,
    voice_id: config.voiceId,
    script: narrationScript,
    title: trimString(row.title),
    ...(config.callbackUrl ? { callback_url: config.callbackUrl } : {}),
  };

  const avatarGeneration = await withTransaction(pool, async (client) => {
    const insert = await client.query(
      `insert into avatar_generations (
        content_id,
        provider,
        provider_status,
        request_json
      ) values ($1,'heygen','queued',$2::jsonb)
      returning avatar_generation_id`,
      [contentId, JSON.stringify(requestBody)],
    );
    return insert.rows[0];
  });

  try {
    let createResponse = {};
    let statusResponse = {};
    let videoId = '';
    let finalStatus = {
      status: 'completed',
      outputUrl: config.mockCompletedUrl,
      thumbnailUrl: trimString(process.env.HEYGEN_MOCK_THUMBNAIL_URL),
      durationSeconds: Number(process.env.HEYGEN_MOCK_DURATION_SECONDS || row.target_duration_seconds || 0) || null,
    };

    if (!config.mockCompletedUrl) {
      createResponse = await heygenRequest({
        method: 'POST',
        path: '/v3/videos',
        apiKey: config.apiKey,
        body: requestBody,
      });
      videoId = extractHeygenVideoId(createResponse);
      if (!videoId) {
        fail(`HeyGen create-video response did not include a video_id: ${JSON.stringify(createResponse)}`);
      }
      await withTransaction(pool, async (client) => {
        await client.query(
          `update avatar_generations
          set provider_video_id = $2,
              provider_request_id = $2,
              provider_status = 'submitted',
              response_json = $3::jsonb,
              updated_at = now()
          where avatar_generation_id = $1`,
          [avatarGeneration.avatar_generation_id, videoId, JSON.stringify(createResponse)],
        );
      });

      const deadline = Date.now() + config.timeoutMs;
      while (Date.now() < deadline) {
        statusResponse = await heygenRequest({
          path: `/v3/videos/${encodeURIComponent(videoId)}`,
          apiKey: config.apiKey,
        });
        finalStatus = normalizeHeygenStatus(statusResponse);
        await withTransaction(pool, async (client) => {
          await client.query(
            `update avatar_generations
            set provider_status = $2,
                response_json = $3::jsonb,
                updated_at = now()
            where avatar_generation_id = $1`,
            [avatarGeneration.avatar_generation_id, finalStatus.status, JSON.stringify(statusResponse)],
          );
        });
        if (['completed', 'success', 'done', 'failed', 'error'].includes(finalStatus.status)) {
          break;
        }
        await sleep(config.pollIntervalMs);
      }
    }

    if (!['completed', 'success', 'done'].includes(finalStatus.status)) {
      fail(`HeyGen avatar generation did not complete. Last status: ${finalStatus.status || 'unknown'}.`);
    }
    if (!trimString(finalStatus.outputUrl)) {
      fail('HeyGen completed without an output video URL.');
    }

    const downloaded = await fetchBinaryAsset(finalStatus.outputUrl, 'HeyGen avatar video');
    const objectKey = objectKeyForRole(contentId, 'avatar-video', 'mp4');
    const storage = await uploadBinaryAsset('avatar_video', downloaded.binary, {
      objectKey,
      contentType: downloaded.contentType || 'video/mp4',
      fileName: path.basename(objectKey),
    });

    await withTransaction(pool, async (client) => {
      await client.query(
        `delete from assets
        where content_id = $1
          and asset_role = 'avatar_video'`,
        [contentId],
      );
      await client.query(
        `insert into assets (
          content_id,
          scene_number,
          asset_role,
          provider,
          source_url,
          storage_url,
          mime_type,
          duration_seconds,
          status,
          metadata_json
        ) values ($1,null,'avatar_video','heygen',$2,$3,$4,$5,'ready',$6::jsonb)`,
        [
          contentId,
          finalStatus.outputUrl,
          storage.url,
          downloaded.contentType || 'video/mp4',
          finalStatus.durationSeconds,
          JSON.stringify({
            provider: 'heygen',
            provider_video_id: videoId || 'mock',
            avatar_generation_id: avatarGeneration.avatar_generation_id,
            source_type: config.mockCompletedUrl ? 'mock_completed_url_rehosted' : 'heygen_direct_video_rehosted',
            thumbnail_url: finalStatus.thumbnailUrl || null,
            rehost_provider: storage.mode,
            storage_object_key: storage.objectKey,
            generated_at: new Date().toISOString(),
          }),
        ],
      );
      await client.query(
        `update avatar_generations
        set provider_status = 'completed',
            output_url = $2,
            thumbnail_url = nullif($3, ''),
            duration_seconds = $4,
            response_json = case when $5::jsonb = '{}'::jsonb then response_json else $5::jsonb end,
            completed_at = now(),
            updated_at = now()
        where avatar_generation_id = $1`,
        [
          avatarGeneration.avatar_generation_id,
          storage.url,
          finalStatus.thumbnailUrl || '',
          finalStatus.durationSeconds,
          JSON.stringify(statusResponse),
        ],
      );
      await client.query(
        `update content_items
        set status = 'avatar_ready',
            updated_at = now()
        where content_id = $1`,
        [contentId],
      );
      await logWorkflowRun(client, {
        contentId,
        workflowName: 'heygen_avatar_generation',
        startedAt,
        durationMs: durationMsFrom(startedAt),
        details: {
          provider: 'heygen',
          provider_video_id: videoId || 'mock',
          avatar_generation_id: avatarGeneration.avatar_generation_id,
          output_video_url: storage.url,
          duration_seconds: finalStatus.durationSeconds,
          cost: { type: 'provider_dashboard', provider: 'heygen', total_usd: 0 },
        },
      });
    });

    return {
      content_id: contentId,
      status_after_success: 'avatar_ready',
      provider: 'heygen',
      provider_video_id: videoId || 'mock',
      output_video_url: storage.url,
      duration_seconds: finalStatus.durationSeconds,
    };
  } catch (error) {
    const message = String(error?.message || error || 'HeyGen avatar generation failed.').slice(0, 4000);
    await withTransaction(pool, async (client) => {
      await client.query(
        `update avatar_generations
        set provider_status = 'failed',
            error_message = $2,
            updated_at = now()
        where avatar_generation_id = $1
          and provider_status <> 'completed'`,
        [avatarGeneration.avatar_generation_id, message],
      );
      await client.query(
        `update content_items
        set status = 'avatar_failed',
            updated_at = now()
        where content_id = $1
          and status <> 'avatar_ready'`,
        [contentId],
      );
      await logWorkflowRun(client, {
        contentId,
        workflowName: 'heygen_avatar_generation',
        runStatus: 'failed',
        startedAt,
        durationMs: durationMsFrom(startedAt),
        errorMessage: message,
        details: {
          provider: 'heygen',
          avatar_generation_id: avatarGeneration.avatar_generation_id,
          provider_call_attempted: !config.mockCompletedUrl,
        },
      });
    });
    throw error;
  }
}

function inferAssetType(asset) {
  const mimeType = trimString(asset?.mime_type).toLowerCase();
  const assetRole = trimString(asset?.asset_role).toLowerCase();
  const storageUrl = trimString(asset?.storage_url).toLowerCase();
  if (mimeType.startsWith('video/') || assetRole === 'scene_video' || storageUrl.endsWith('.mp4')) {
    return 'video';
  }
  return 'image';
}

function renderOutputSettings(seed) {
  const outputWidth = Number.parseInt(trimString(process.env.RENDER_OUTPUT_WIDTH || seed?.output?.width || '1080'), 10);
  const outputHeight = Number.parseInt(trimString(process.env.RENDER_OUTPUT_HEIGHT || seed?.output?.height || '1920'), 10);
  const outputFps = Number.parseInt(trimString(process.env.RENDER_OUTPUT_FPS || seed?.output?.fps || '30'), 10);
  const outputFormat = trimString(process.env.RENDER_OUTPUT_FORMAT || seed?.output?.format || 'mp4') || 'mp4';
  return {
    width: Number.isFinite(outputWidth) ? outputWidth : 1080,
    height: Number.isFinite(outputHeight) ? outputHeight : 1920,
    fps: Number.isFinite(outputFps) ? outputFps : 30,
    format: outputFormat,
    aspect_ratio: '9:16',
  };
}

function buildAvatarRenderManifest(row, {
  contentId,
  title,
  storyboard,
  subtitleLines,
  seed,
  output,
  subtitleStyle,
}) {
  const avatarAssets = asArray(row.avatar_assets_json).filter((asset) => trimString(asset?.storage_url));
  if (avatarAssets.length === 0) {
    fail('Avatar render manifest requires one ready avatar_video asset.');
  }
  const avatarAsset = avatarAssets[0];
  const durationSeconds = roundToHundredths(Math.max(
    Number(avatarAsset.duration_seconds ?? row.target_duration_seconds ?? 0) || 0,
    0.5,
  ));
  const firstStoryboardScene = storyboard[0] ?? {};
  const faceImageScene = storyboard.find((scene) => scene.is_face_image === true) ?? firstStoryboardScene;
  const faceImageTitle = trimString(faceImageScene?.face_image_title);
  const thumbnailUrl = trimString(avatarAsset.metadata_json?.thumbnail_url);
  const coverImageUrl = thumbnailUrl || trimString(row.cover_image_url);
  const manifestScenes = [{
    scene_number: 1,
    start_time_seconds: 0,
    end_time_seconds: durationSeconds,
    duration_seconds: durationSeconds,
    transition: trimString(firstStoryboardScene.transition),
    mood: trimString(firstStoryboardScene.mood),
    music_cue: trimString(firstStoryboardScene.music_cue),
    visual_prompt: trimString(firstStoryboardScene.visual_prompt || 'Avatar presenter video'),
    narration_text: trimString(row.narration_script),
    narration_url: '',
    narration_duration_seconds: durationSeconds,
    asset: {
      asset_role: 'avatar_video',
      asset_type: 'video',
      provider: trimString(avatarAsset.provider || 'heygen'),
      storage_url: trimString(avatarAsset.storage_url),
      mime_type: trimString(avatarAsset.mime_type || 'video/mp4'),
      width: Number(avatarAsset.width ?? 0),
      height: Number(avatarAsset.height ?? 0),
    },
    subtitle: null,
  }];
  const renderManifest = {
    manifest_version: 2,
    render_mode: 'avatar',
    reel_type: 'avatar',
    content_id: contentId,
    title,
    title_overlay: faceImageTitle ? { text: faceImageTitle, enabled: true, duration_seconds: 4.0 } : null,
    output,
    audio: {
      narration: {
        mode: 'embedded_avatar',
        provider: trimString(avatarAsset.provider || 'heygen'),
        storage_url: '',
        total_duration_seconds: durationSeconds,
      },
    },
    subtitles: {
      enabled: false,
      style: subtitleStyle,
      lines: subtitleLines,
    },
    timing: {
      mode: 'avatar_primary_video',
      total_duration_seconds: durationSeconds,
      scene_count: 1,
    },
    scenes: manifestScenes,
    timeline: [{
      scene_number: 1,
      start_time_seconds: 0,
      end_time_seconds: durationSeconds,
      duration_seconds: durationSeconds,
      asset_url: trimString(avatarAsset.storage_url),
      asset_type: 'video',
      narration_url: '',
      transition: trimString(firstStoryboardScene.transition),
    }],
    total_duration_seconds: durationSeconds,
    cover_image_url: coverImageUrl,
    seed,
  };
  return {
    render_manifest_json: renderManifest,
    render_manifest_summary: {
      reel_type: 'avatar',
      scene_count: 1,
      total_duration_seconds: durationSeconds,
      timeline_mode: 'avatar_primary_video',
      output,
      cover_image_url: coverImageUrl,
      scene_asset_types: [{ scene_number: 1, asset_type: 'video', asset_role: 'avatar_video' }],
    },
    cover_image_url: coverImageUrl,
    resolution: `${output.width}x${output.height}`,
    aspect_ratio: '9:16',
    duration_seconds: durationSeconds,
    render_status: 'manifest_ready',
  };
}

function buildRenderManifest(row) {
  const contentId = ensureUuid(row.content_id);
  const title = trimString(row.title);
  const reelType = trimString(row.reel_type || 'video').toLowerCase() || 'video';
  const storyboard = asArray(row.storyboard_json);
  const faceImageScene = storyboard.find((scene) => scene.is_face_image === true) ?? storyboard[0] ?? null;
  const faceImageTitle = trimString(faceImageScene?.face_image_title);
  const subtitleLines = asArray(row.subtitle_lines_json);
  const sceneAssets = asArray(row.scene_assets_json);
  const sceneNarrationAssets = asArray(row.scene_narration_assets_json);
  const seed = asObject(row.render_manifest_seed_json);
  const output = renderOutputSettings(seed);
  const subtitleStyle = trimString(process.env.RENDER_SUBTITLE_STYLE || seed?.subtitles?.style || 'cinematic_center_safe') || 'cinematic_center_safe';

  if (!title) fail('Render manifest candidate did not return title.');
  if (storyboard.length < 4) fail('A render manifest requires at least 4 storyboard scenes.');
  if (reelType === 'avatar') {
    return buildAvatarRenderManifest(row, {
      contentId,
      title,
      storyboard,
      subtitleLines,
      seed,
      output,
      subtitleStyle,
    });
  }
  if (sceneAssets.length < 4) fail('A render manifest requires at least 4 ready scene assets.');
  if (sceneNarrationAssets.length < storyboard.length) {
    fail(`A render manifest requires ${storyboard.length} scene_narration assets, got ${sceneNarrationAssets.length}.`);
  }

  const narrationSpeed = Number.isFinite(Number(sceneNarrationAssets[0]?.metadata_json?.speed))
    ? Number(sceneNarrationAssets[0].metadata_json.speed)
    : 1;
  const narrationByScene = Object.fromEntries(sceneNarrationAssets.map((asset) => [Number(asset.scene_number), asset]));

  let currentTime = 0;
  const manifestScenes = storyboard.map((scene, index) => {
    const sceneNumber = Number(scene?.scene_number ?? index + 1);
    const narrationAsset = narrationByScene[sceneNumber] ?? null;
    if (!narrationAsset) fail(`Missing scene_narration asset for scene ${sceneNumber}.`);
    const durationSeconds = roundToHundredths(Math.max(Number(narrationAsset.duration_seconds ?? 0), 0.5));
    const matchingAsset = sceneAssets.find((asset) => Number(asset?.scene_number ?? 0) === sceneNumber);
    if (!matchingAsset) fail(`Missing scene asset for scene ${sceneNumber}.`);
    if (!trimString(matchingAsset.storage_url)) fail(`Scene ${sceneNumber} asset is missing storage_url.`);
    const startTime = roundToHundredths(currentTime);
    const endTime = roundToHundredths(currentTime + durationSeconds);
    currentTime = endTime;
    const subtitle = subtitleLines.find((line) => Number(line?.scene_number ?? 0) === sceneNumber);
    const assetType = inferAssetType(matchingAsset);
    return {
      scene_number: sceneNumber,
      start_time_seconds: startTime,
      end_time_seconds: endTime,
      duration_seconds: durationSeconds,
      transition: trimString(scene?.transition),
      mood: trimString(scene?.mood),
      music_cue: trimString(scene?.music_cue),
      visual_prompt: trimString(scene?.visual_prompt),
      narration_text: trimString(scene?.narration_text),
      narration_url: trimString(narrationAsset.storage_url),
      narration_duration_seconds: Number(narrationAsset.duration_seconds ?? 0),
      asset: {
        asset_role: trimString(matchingAsset.asset_role),
        asset_type: assetType,
        provider: trimString(matchingAsset.provider),
        storage_url: trimString(matchingAsset.storage_url),
        mime_type: trimString(matchingAsset.mime_type),
        width: Number(matchingAsset.width ?? 0),
        height: Number(matchingAsset.height ?? 0),
      },
      subtitle: subtitle ? {
        text: trimString(subtitle.text),
        style: subtitleStyle,
      } : null,
    };
  });
  const totalDuration = roundToHundredths(manifestScenes.reduce((sum, scene) => sum + scene.duration_seconds, 0));
  const coverImageUrl = trimString((sceneAssets.find((asset) => inferAssetType(asset) === 'image') ?? sceneAssets[0])?.storage_url);
  const renderManifest = {
    manifest_version: 2,
    render_mode: reelType === 'image' ? 'image' : 'video',
    reel_type: reelType,
    content_id: contentId,
    title,
    title_overlay: faceImageTitle ? { text: faceImageTitle, enabled: true, duration_seconds: 4.0 } : null,
    output,
    audio: {
      narration: {
        mode: 'per_scene',
        scenes: sceneNarrationAssets.map((asset) => ({
          scene_number: Number(asset.scene_number),
          provider: trimString(asset.provider),
          storage_url: trimString(asset.storage_url),
          mime_type: trimString(asset.mime_type || 'audio/mpeg'),
          duration_seconds: Number(asset.duration_seconds ?? 0),
        })),
        total_duration_seconds: totalDuration,
        voice: trimString(sceneNarrationAssets[0]?.metadata_json?.voice),
        speed: narrationSpeed,
      },
    },
    subtitles: {
      enabled: false,
      style: subtitleStyle,
      lines: subtitleLines,
    },
    timing: {
      mode: 'per_scene_narration',
      total_duration_seconds: totalDuration,
      narration_speed: narrationSpeed,
      scene_count: manifestScenes.length,
    },
    scenes: manifestScenes,
    timeline: manifestScenes.map((scene) => ({
      scene_number: scene.scene_number,
      start_time_seconds: scene.start_time_seconds,
      end_time_seconds: scene.end_time_seconds,
      duration_seconds: scene.duration_seconds,
      asset_url: scene.asset.storage_url,
      asset_type: scene.asset.asset_type,
      narration_url: scene.narration_url,
      transition: scene.transition,
    })),
    total_duration_seconds: totalDuration,
    cover_image_url: coverImageUrl,
    seed,
  };
  const summary = {
    scene_count: manifestScenes.length,
    total_duration_seconds: totalDuration,
    timeline_mode: 'per_scene_narration',
    narration_speed: narrationSpeed,
    output: renderManifest.output,
    cover_image_url: coverImageUrl,
    scene_asset_types: manifestScenes.map((scene) => ({
      scene_number: scene.scene_number,
      asset_type: scene.asset.asset_type,
      asset_role: scene.asset.asset_role,
    })),
  };
  return {
    render_manifest_json: renderManifest,
    render_manifest_summary: summary,
    cover_image_url: coverImageUrl,
    resolution: `${output.width}x${output.height}`,
    aspect_ratio: '9:16',
    duration_seconds: totalDuration,
    render_status: 'manifest_ready',
  };
}

async function runRenderManifestConstruction({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const claim = await client.query(
      `update content_items
      set status = 'building_render_manifest',
          updated_at = now()
      where content_id = $1
        and status in ('narration_ready', 'avatar_ready', 'building_render_manifest')
      returning content_id`,
      [contentId],
    );
    if (claim.rowCount === 0) {
      fail(`No narration_ready/avatar_ready content item is ready for render manifest construction: ${contentId}.`);
    }
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.reel_type,
        ci.target_duration_seconds,
        ci.status,
        coalesce(s.narration_script, '') as narration_script,
        sb.storyboard_json,
        sb.subtitle_lines_json,
        sb.render_manifest_seed_json,
        jsonb_agg(
          jsonb_build_object(
            'scene_number', a.scene_number,
            'asset_role', a.asset_role,
            'provider', a.provider,
            'storage_url', a.storage_url,
            'mime_type', a.mime_type,
            'duration_seconds', a.duration_seconds,
            'width', a.width,
            'height', a.height,
            'metadata_json', a.metadata_json
          )
          order by a.scene_number, a.asset_role
        ) filter (where a.asset_role in ('scene_image', 'scene_video') and a.status = 'ready') as scene_assets_json,
        jsonb_agg(
          jsonb_build_object(
            'scene_number', a.scene_number,
            'provider', a.provider,
            'storage_url', a.storage_url,
            'mime_type', a.mime_type,
            'duration_seconds', a.duration_seconds,
            'metadata_json', a.metadata_json
          )
          order by a.scene_number
        ) filter (where a.asset_role = 'scene_narration' and a.status = 'ready') as scene_narration_assets_json,
        jsonb_agg(
          jsonb_build_object(
            'asset_role', a.asset_role,
            'provider', a.provider,
            'storage_url', a.storage_url,
            'mime_type', a.mime_type,
            'duration_seconds', a.duration_seconds,
            'width', a.width,
            'height', a.height,
            'metadata_json', a.metadata_json
          )
          order by a.created_at desc
        ) filter (where a.asset_role = 'avatar_video' and a.status = 'ready') as avatar_assets_json
      from content_items ci
      join storyboards sb on sb.content_id = ci.content_id
      left join scripts s on s.content_id = ci.content_id
      left join assets a on a.content_id = ci.content_id
      where ci.content_id = $1
        and ci.status = 'building_render_manifest'
      group by ci.content_id, ci.title, ci.reel_type, ci.target_duration_seconds, ci.status,
        s.narration_script, sb.storyboard_json, sb.subtitle_lines_json, sb.render_manifest_seed_json`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`Content item does not have enough ready assets for render manifest construction: ${contentId}.`);
    }
    return result.rows[0];
  });

  const manifest = buildRenderManifest(row);
  await withTransaction(pool, async (client) => {
    await client.query(
      `insert into renders (
        content_id,
        render_manifest_json,
        output_video_url,
        cover_image_url,
        resolution,
        aspect_ratio,
        duration_seconds,
        render_status,
        render_log,
        requested_at,
        completed_at
      ) values ($1,$2::jsonb,null,$3,$4,$5,$6,$7,null,now(),null)
      on conflict (content_id) do update set
        render_manifest_json = excluded.render_manifest_json,
        output_video_url = null,
        cover_image_url = excluded.cover_image_url,
        resolution = excluded.resolution,
        aspect_ratio = excluded.aspect_ratio,
        duration_seconds = excluded.duration_seconds,
        render_status = excluded.render_status,
        render_log = null,
        requested_at = now(),
        completed_at = null`,
      [
        contentId,
        JSON.stringify(manifest.render_manifest_json),
        manifest.cover_image_url,
        manifest.resolution,
        manifest.aspect_ratio,
        manifest.duration_seconds,
        manifest.render_status,
      ],
    );
    await client.query(
      `update content_items
      set status = 'render_manifest_ready',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_remotion_manifest',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        render_manifest: manifest.render_manifest_summary,
      },
    });
  });
  return {
    content_id: contentId,
    status_after_success: 'render_manifest_ready',
    render_status: manifest.render_status,
    ...manifest.render_manifest_summary,
  };
}

function parseNumber(value, fallback) {
  const parsed = Number.parseFloat(trimString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildRenderRequest(row) {
  const contentId = ensureUuid(row.content_id);
  const manifest = asObject(row.render_manifest_json);
  const renderMode = trimString(manifest.render_mode || row.reel_type || 'video').toLowerCase() || 'video';
  const sourcePayload = asObject(row.source_payload_json);
  const promptProfile = asObject(sourcePayload.prompt_profile);
  const creativeDefaults = asObject(sourcePayload.creative_defaults);
  const directorJson = asObject(row.director_json);
  const narrationMode = trimString(manifest?.audio?.narration?.mode);
  const isPerScene = narrationMode === 'per_scene';
  const isEmbeddedAvatar = narrationMode === 'embedded_avatar' || renderMode === 'avatar';
  const minTimelineEntries = renderMode === 'avatar' ? 1 : 4;
  if (!Array.isArray(manifest.scenes) || manifest.scenes.length < minTimelineEntries) fail('render_manifest_json is missing scenes.');
  if (!Array.isArray(manifest.timeline) || manifest.timeline.length < minTimelineEntries) fail('render_manifest_json is missing timeline entries.');
  if (isPerScene) {
    const narrationScenes = asArray(manifest?.audio?.narration?.scenes);
    if (narrationScenes.length === 0) fail('render_manifest_json has empty per-scene narration.');
    const missingUrl = narrationScenes.find((scene) => !trimString(scene?.storage_url));
    if (missingUrl) fail(`render_manifest_json per_scene narration scene ${missingUrl.scene_number ?? '?'} is missing storage_url.`);
  } else if (!isEmbeddedAvatar && !trimString(manifest?.audio?.narration?.storage_url)) {
    fail('render_manifest_json is missing narration audio.');
  }

  const configuredSyncUrl = trimString(process.env.RENDER_WORKER_SYNC_URL);
  const configuredWorkerUrl = trimString(process.env.RENDER_WORKER_URL);
  const workerUrl = configuredSyncUrl || (configuredWorkerUrl ? configuredWorkerUrl.replace(/\/render\/?$/, '/render-sync') : 'http://remotion-renderer:8081/render-sync');
  const outputPrefix = trimString(process.env.RENDER_OUTPUT_PATH_PREFIX || 'reels').replace(/^\/+|\/+$/g, '') || 'reels';
  const renderProvider = trimString(process.env.RENDER_PROVIDER || 'remotion').toLowerCase() || 'remotion';
  const requestId = `render-${contentId}-${Date.now()}`;
  const backgroundMusicVolume = Math.min(1, Math.max(0, parseNumber(process.env.BACKGROUND_MUSIC_DEFAULT_VOLUME, 0.12)));
  const backgroundMusicFadeInSeconds = Math.max(0, parseNumber(process.env.BACKGROUND_MUSIC_FADE_IN_SECONDS, 0.8));
  const backgroundMusicFadeOutSeconds = Math.max(0, parseNumber(process.env.BACKGROUND_MUSIC_FADE_OUT_SECONDS, 2.5));
  const sceneMoods = manifest.scenes.flatMap((scene) => [trimString(scene?.mood), trimString(scene?.music_cue)]).filter(Boolean);
  const scenePromptSummary = manifest.scenes.map((scene) => trimString(scene?.visual_prompt)).filter(Boolean).slice(0, 6).join(' | ');
  const scriptMusicDirection = trimString(row.script_music_direction);
  const narrationScript = trimString(row.narration_script);
  const backgroundMusicDirection = [
    trimString(directorJson.global_music_direction),
    trimString(creativeDefaults.music_mood),
    trimString(promptProfile?.narration_generation?.background_music_direction),
    scriptMusicDirection,
  ].filter(Boolean).join(' | ');
  const narrationStyle = [
    trimString(directorJson.tts_delivery),
    trimString(creativeDefaults.narrator_style),
    trimString(promptProfile?.narration_generation?.narration_style),
  ].filter(Boolean).join(' | ');
  const styleNotes = [
    trimString(directorJson.global_visual_style),
    trimString(directorJson.visual_strategy),
    trimString(creativeDefaults.visual_strategy),
    trimString(promptProfile?.storyboard_and_prompts?.visual_style_rules),
    trimString(promptProfile?.scene_asset_generation?.style_notes),
    trimString(promptProfile?.post_image_generation?.style_notes),
  ].filter(Boolean).join(' | ');

  return {
    worker_url: workerUrl,
    request_id: requestId,
    render_provider: renderProvider,
    render_request: {
      content_id: contentId,
      request_id: requestId,
      reel_type: trimString(manifest.reel_type || row.reel_type || 'video') || 'video',
      render_mode: renderMode,
      title: trimString(row.title),
      title_overlay: manifest.title_overlay && typeof manifest.title_overlay === 'object'
        ? { ...manifest.title_overlay }
        : { enabled: false },
      render_provider: renderProvider,
      render_manifest: manifest,
      output: manifest.output,
      timeline: manifest.timeline.map((scene) => ({
        scene_number: scene.scene_number,
        asset_url: scene.asset_url,
        asset_type: scene.asset_type,
        start_time: scene.start_time_seconds,
        end_time: scene.end_time_seconds,
        duration_seconds: scene.duration_seconds,
        narration_url: trimString(scene.narration_url) || null,
        transition: scene.transition,
      })),
      audio: {
        narration_url: isPerScene || isEmbeddedAvatar ? null : (trimString(manifest.audio?.narration?.storage_url) || null),
        narration: {
          ...asObject(manifest.audio?.narration),
          mode: narrationMode || (isEmbeddedAvatar ? 'embedded_avatar' : 'single'),
          storage_url: isPerScene || isEmbeddedAvatar ? null : (trimString(manifest.audio?.narration?.storage_url) || null),
        },
        music_url: null,
        music_path: null,
        music_volume: backgroundMusicVolume,
        music_fade_in_seconds: backgroundMusicFadeInSeconds,
        music_fade_out_seconds: backgroundMusicFadeOutSeconds,
      },
      music_context: {
        category: trimString(row.category || 'general') || 'general',
        selected_hook: trimString(row.selected_hook),
        narration_script_excerpt: narrationScript.slice(0, 1500),
        scene_prompt_summary: scenePromptSummary,
        prompt_profile_summary: trimString(sourcePayload.prompt_profile_summary),
        background_music_direction: backgroundMusicDirection,
        narration_style: narrationStyle,
        style_notes: styleNotes,
        scene_moods: sceneMoods,
        script_music_direction: scriptMusicDirection,
      },
      subtitles: {
        enabled: false,
        subtitle_lines: asArray(manifest.subtitles?.lines),
        style: trimString(manifest.subtitles?.style || process.env.RENDER_SUBTITLE_STYLE || 'cinematic_center_safe'),
      },
      cover: {
        enabled: Boolean(manifest.cover_image_url),
        cover_asset_url: trimString(manifest.cover_image_url) || null,
      },
      storage: {
        output_path: `${outputPrefix}/${contentId}/final.${trimString(manifest.output?.format || 'mp4') || 'mp4'}`,
      },
    },
  };
}

async function runRenderSyncCompletion({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.reel_type,
        ci.status,
        ci.category,
        ci.source_payload_json,
        coalesce(d.director_json, '{}'::jsonb) as director_json,
        r.render_manifest_json,
        r.render_status,
        r.resolution,
        r.aspect_ratio,
        r.duration_seconds,
        r.cover_image_url,
        coalesce(s.selected_hook, '') as selected_hook,
        coalesce(s.narration_script, '') as narration_script,
        coalesce(s.raw_response_json->'parsed_response'->>'music_direction', s.raw_response_json->>'music_direction', '') as script_music_direction
      from content_items ci
      join renders r on r.content_id = ci.content_id
      left join scripts s on s.content_id = ci.content_id
      left join directors d on d.content_id = ci.content_id
      where ci.content_id = $1
        and ci.status in ('render_manifest_ready', 'dispatching_render')
        and r.render_status in ('manifest_ready', 'queued')
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No render_manifest_ready content item is ready for render sync: ${contentId}.`);
    }
    await client.query(
      `update content_items
      set status = 'dispatching_render',
          updated_at = now()
      where content_id = $1`,
      [contentId],
    );
    await client.query(
      `update renders
      set render_status = 'queued',
          render_log = null,
          completed_at = null
      where content_id = $1`,
      [contentId],
    );
    return result.rows[0];
  });

  const request = buildRenderRequest(row);
  let renderResult;
  if (!request.worker_url) {
    renderResult = {
      render_status: 'failed',
      output_video_url: '',
      cover_image_url: trimString(request.render_request?.cover?.cover_asset_url),
      duration_seconds: 0,
      resolution: '',
      render_log: '',
      error_message: 'Set RENDER_WORKER_SYNC_URL or RENDER_WORKER_URL before running render sync.',
    };
  } else {
    const response = await fetch(request.worker_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.render_request),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && trimString(body.render_status).toLowerCase() === 'success') {
      renderResult = {
        render_status: 'success',
        output_video_url: trimString(body.output_video_url),
        cover_image_url: trimString(body.cover_image_url || request.render_request?.cover?.cover_asset_url),
        duration_seconds: Number(body.duration_seconds ?? 0),
        resolution: trimString(body.resolution),
        render_log: trimString(body.render_log),
        error_message: '',
      };
    } else {
      renderResult = {
        render_status: 'failed',
        output_video_url: '',
        cover_image_url: trimString(body.cover_image_url || request.render_request?.cover?.cover_asset_url),
        duration_seconds: Number(body.duration_seconds ?? 0),
        resolution: trimString(body.resolution),
        render_log: trimString(body.render_log),
        error_message: trimString(body.error_message || body.message || JSON.stringify(body) || `Render worker request failed (${response.status}).`),
      };
    }
  }

  const isSuccess = renderResult.render_status === 'success';
  await withTransaction(pool, async (client) => {
    await client.query(
      `update renders
      set render_status = $2,
          output_video_url = nullif($3, ''),
          cover_image_url = coalesce(nullif($4, ''), cover_image_url),
          duration_seconds = $5,
          resolution = nullif($6, ''),
          render_log = nullif($7, ''),
          completed_at = now()
      where content_id = $1`,
      [
        contentId,
        isSuccess ? 'success' : 'failed',
        renderResult.output_video_url,
        renderResult.cover_image_url,
        Number(renderResult.duration_seconds || 0),
        renderResult.resolution,
        renderResult.render_log || renderResult.error_message,
      ],
    );
    await client.query(
      `update content_items
      set status = $2,
          updated_at = now()
      where content_id = $1`,
      [contentId, isSuccess ? 'render_complete' : 'render_failed'],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_remotion_render',
      runStatus: isSuccess ? 'success' : 'failed',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      errorMessage: renderResult.error_message || null,
      details: {
        render_sync: {
          render_status: isSuccess ? 'success' : 'failed',
          request_id: request.request_id,
          output_video_url: renderResult.output_video_url,
          cover_image_url: renderResult.cover_image_url,
          duration_seconds: Number(renderResult.duration_seconds || 0),
          resolution: renderResult.resolution,
          error_message: renderResult.error_message,
        },
      },
    });
  });

  if (!isSuccess) {
    fail(renderResult.error_message || 'Render worker failed.');
  }

  return {
    content_id: contentId,
    status_after_success: 'render_complete',
    render_status: 'success',
    output_video_url: renderResult.output_video_url,
    duration_seconds: Number(renderResult.duration_seconds || 0),
  };
}

function formatCaption({ title, category, selectedHook, captionDraft, ctaLine }) {
  const captionParts = [];
  if (captionDraft) captionParts.push(captionDraft);
  if (ctaLine) captionParts.push(ctaLine);
  const captionFinal = captionParts.join('\n\n') || selectedHook || title;
  const normalizedCategory = trimString(category || 'general').toLowerCase();
  const hashtagMap = {
    history: '#history #historical #worldhistory #historyfacts #ancienthistory #truestory',
    mystery: '#mystery #unsolved #truemystery #unexplained #creepy #truecrime',
    'true crime': '#truecrime #crimestory #coldcase #truecrimeaddict #crimepodcast #realstory',
    crime: '#crime #truecrime #crimestory #coldcase #realstory #truestory',
    war: '#war #military #history #warhistory #historicalfacts #truestory',
    culture: '#culture #history #worldhistory #traditions #heritage #truestory',
    science: '#science #facts #historicalfacts #discovery #truestory #educational',
  };
  const matchedKey = Object.keys(hashtagMap).find((key) => normalizedCategory.includes(key));
  return {
    caption_final: captionFinal,
    hashtags_final: matchedKey ? hashtagMap[matchedKey] : '#history #truestory #realstory #historical #factsonly #storytelling',
    selection_rationale: 'Assembled directly from research caption_draft and cta_line without LLM call',
    cost: { type: 'none', provider: 'none', total_usd: 0 },
  };
}

async function runCaptionAndHashtags({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.category,
        ci.status,
        s.selected_hook,
        s.narration_script,
        s.caption_draft,
        s.cta_line,
        coalesce(p.publish_status, 'draft') as existing_publish_status
      from content_items ci
      join scripts s on s.content_id = ci.content_id
      left join publishes p on p.content_id = ci.content_id and p.platform = 'instagram'
      where ci.content_id = $1
        and ci.status = 'render_complete'
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No render_complete content item is ready for caption generation: ${contentId}.`);
    }
    return result.rows[0];
  });
  const selectedHook = trimString(row.selected_hook);
  const narrationScript = trimString(row.narration_script);
  if (!selectedHook) fail('Caption generation requires selected_hook.');
  if (!narrationScript) fail('Caption generation requires narration_script.');
  const caption = formatCaption({
    title: trimString(row.title),
    category: trimString(row.category),
    selectedHook,
    captionDraft: trimString(row.caption_draft),
    ctaLine: trimString(row.cta_line),
  });

  await withTransaction(pool, async (client) => {
    await client.query(
      `insert into publishes (
        content_id,
        platform,
        publish_status,
        caption_final,
        hashtags_final
      ) values ($1,'instagram','draft',$2,$3)
      on conflict (content_id) do update set
        platform = 'instagram',
        publish_status = case
          when publishes.publish_status = 'published' then publishes.publish_status
          else 'draft'
        end,
        caption_final = excluded.caption_final,
        hashtags_final = excluded.hashtags_final`,
      [contentId, caption.caption_final, caption.hashtags_final],
    );
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_caption_and_hashtags',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        generation_model: '',
        selection_rationale: caption.selection_rationale,
        caption_iteration: {
          provider: 'none',
          assembled_from_draft: true,
          output: {
            caption_final: caption.caption_final,
            hashtags_final: caption.hashtags_final,
          },
        },
        cost: caption.cost,
      },
    });
  });

  return {
    content_id: contentId,
    publish_status_after_success: 'draft',
    caption_final: caption.caption_final,
    hashtags_final: caption.hashtags_final,
    cost: caption.cost,
  };
}

async function runFinalQaApprovalGate({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.status as content_status,
        r.render_id,
        r.render_status,
        coalesce(r.output_video_url, '') as output_video_url,
        coalesce(p.caption_final, '') as caption_final,
        coalesce(cac.context_snapshot_json, '{}'::jsonb) as client_account_context
      from content_items ci
      join renders r on r.content_id = ci.content_id
      join publishes p on p.content_id = ci.content_id and p.platform = 'instagram'
      left join content_account_contexts cac on cac.content_id = ci.content_id
      where ci.content_id = $1
      for update of ci`,
      [contentId],
    );
    if (result.rowCount === 0) fail(`No rendered package exists for final QA gate: ${contentId}.`);
    const row = result.rows[0];
    if (trimString(row.content_status) !== 'render_complete') fail(`Final QA gate requires content status render_complete, got ${row.content_status || '<empty>'}.`);
    if (trimString(row.render_status) !== 'success') fail(`Final QA gate requires render_status success, got ${row.render_status || '<empty>'}.`);
    if (!trimString(row.output_video_url)) fail('Final QA gate requires output_video_url.');
    if (!trimString(row.caption_final)) fail('Final QA gate requires caption_final.');
    const clientContext = asObject(row.client_account_context);
    const platformAccountId = trimString(
      process.env.INSTAGRAM_IG_USER_ID
      || process.env.INSTAGRAM_TARGET_IG_USER_ID
      || clientContext?.publishing_policy?.platform_account_id
      || clientContext?.platform_account?.platform_account_id,
    );
    const platformAccountUsername = trimString(process.env.INSTAGRAM_USERNAME || clientContext?.platform_account?.username);
    const qaResult = {
      source: 'code_first_final_qa_gate',
      publish_decision: 'approved',
      blocks_publish: false,
      checked_at: new Date().toISOString(),
      summary: 'Automated structural QA passed. Studio approval is still required before publish.',
      publish_requirements: {
        requires_human_approval: true,
        blocks_publish: false,
      },
    };
    if (platformAccountId) {
      await client.query(
        `insert into publish_approvals (
          content_id,
          platform,
          platform_account_id,
          platform_account_username,
          package_type,
          selected_video_id,
          selected_asset_id,
          qa_status,
          qa_result_json,
          approval_status,
          approval_note,
          updated_at
        ) values ($1,'instagram',$2,nullif($3,''),'instagram_reel',$4,null,'passed',$5::jsonb,'pending','Awaiting Studio approval.',now())
        on conflict (content_id, platform, package_type) do update set
          platform_account_id = excluded.platform_account_id,
          platform_account_username = excluded.platform_account_username,
          selected_video_id = excluded.selected_video_id,
          selected_asset_id = excluded.selected_asset_id,
          qa_status = excluded.qa_status,
          qa_result_json = excluded.qa_result_json,
          approval_status = case
            when publish_approvals.approval_status = 'approved'
              and publish_approvals.selected_video_id = excluded.selected_video_id
              then publish_approvals.approval_status
            else 'pending'
          end,
          approved_by = case
            when publish_approvals.approval_status = 'approved'
              and publish_approvals.selected_video_id = excluded.selected_video_id
              then publish_approvals.approved_by
            else null
          end,
          approved_at = case
            when publish_approvals.approval_status = 'approved'
              and publish_approvals.selected_video_id = excluded.selected_video_id
              then publish_approvals.approved_at
            else null
          end,
          approval_note = case
            when publish_approvals.approval_status = 'approved'
              and publish_approvals.selected_video_id = excluded.selected_video_id
              then publish_approvals.approval_note
            else excluded.approval_note
          end,
          updated_at = now()`,
        [contentId, platformAccountId, platformAccountUsername, row.render_id, JSON.stringify(qaResult)],
      );
    }
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'code_first_final_qa_gate',
      startedAt,
      durationMs: durationMsFrom(startedAt),
      details: {
        qa_result: qaResult,
        approval_record: platformAccountId ? 'pending' : 'not_created_missing_platform_account_id',
        selected_video_id: row.render_id,
      },
    });
    return {
      content_id: contentId,
      pipeline_status_after_success: 'awaiting_approval',
      content_status_after_success: 'render_complete',
      qa_status: 'passed',
      approval_status: platformAccountId ? 'pending' : 'not_created_missing_platform_account_id',
      selected_video_id: row.render_id,
    };
  });
}

function isLocalOnlyAssetHost(assetUrl) {
  const match = trimString(assetUrl).match(/^https?:\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/i);
  const host = trimString(match?.[1]).toLowerCase();
  const privateIpv4 = /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  return !host
    || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|minio|host\.docker\.internal)$/i.test(host)
    || host === '::1'
    || host.endsWith('.local')
    || privateIpv4;
}

async function graphRequest({ method = 'GET', path: graphPath, token, qs, body }) {
  const graphApiVersion = trimString(process.env.GRAPH_API_VERSION || 'v25.0');
  const url = new URL(`https://graph.facebook.com/${graphApiVersion}/${graphPath}`);
  for (const [key, value] of Object.entries(qs ?? {})) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = await response.json().catch(() => ({}));
  return {
    ok: response.ok && !responseBody.error,
    status: response.status,
    body: responseBody,
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runInstagramReelPublish({ pool, step }) {
  const contentId = ensureUuid(step.content_id);
  const startedAt = new Date().toISOString();
  const row = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `with candidate_data as materialized (
        select
          ci.content_id,
          ci.title,
          ci.status as content_status,
          p.publish_status as previous_publish_status,
          p.caption_final,
          p.hashtags_final,
          p.scheduled_for,
          p.instagram_media_id as existing_instagram_media_id,
          p.instagram_container_id as existing_instagram_container_id,
          p.published_at as existing_published_at,
          r.render_id as selected_video_id,
          r.output_video_url,
          r.cover_image_url,
          r.duration_seconds,
          r.resolution,
          r.render_status,
          pa.approval_id,
          pa.platform as approval_platform,
          pa.platform_account_id as approval_platform_account_id,
          coalesce(pa.platform_account_username, '') as approval_platform_account_username,
          pa.approval_status,
          pa.qa_status,
          coalesce(pa.approved_by, '') as approved_by,
          pa.approved_at,
          coalesce(cac.account_context_key, '') as account_context_key,
          coalesce(cac.context_snapshot_json, '{}'::jsonb) as client_account_context
        from content_items ci
        left join content_account_contexts cac on cac.content_id = ci.content_id
        join publishes p on p.content_id = ci.content_id
        join renders r on r.content_id = ci.content_id
        join publish_approvals pa on pa.content_id = ci.content_id
          and pa.platform = 'instagram'
          and pa.package_type = 'instagram_reel'
          and pa.approval_status = 'approved'
          and pa.qa_status = 'passed'
          and pa.selected_video_id = r.render_id
          and coalesce(nullif(btrim(pa.approved_by), ''), '') <> ''
          and pa.approved_at is not null
          and coalesce(nullif(btrim(pa.platform_account_id), ''), '') <> ''
          and (
            coalesce(nullif(btrim(cac.context_snapshot_json->'publishing_policy'->>'platform_account_id'), ''), '') = ''
            or cac.context_snapshot_json->'publishing_policy'->>'platform_account_id' = pa.platform_account_id
          )
        where ci.content_id = $1
          and p.platform = 'instagram'
          and p.publish_status in ('draft', 'failed')
          and ci.status = 'render_complete'
          and r.render_status = 'success'
          and coalesce(nullif(btrim(r.output_video_url), ''), '') <> ''
          and (p.scheduled_for is null or p.scheduled_for <= now())
          and p.published_at is null
          and coalesce(nullif(btrim(p.instagram_media_id), ''), '') = ''
        limit 1
      ), claim as (
        update publishes p
        set publish_status = 'publishing',
            publish_error = null
        where p.content_id = (select content_id from candidate_data)
          and p.platform = 'instagram'
          and p.publish_status in ('draft', 'failed')
          and p.published_at is null
          and coalesce(nullif(btrim(p.instagram_media_id), ''), '') = ''
        returning p.content_id, p.publish_status
      )
      select c.*, cl.publish_status
      from candidate_data c
      join claim cl on cl.content_id = c.content_id`,
      [contentId],
    );
    if (result.rowCount === 0) {
      fail(`No approved Reel publish candidate is ready for ${contentId}.`);
    }
    return result.rows[0];
  });

  const errors = [];
  const rootAccessToken = trimString(process.env.INSTAGRAM_GRAPH_API_TOKEN);
  const publishEnabled = trimString(process.env.INSTAGRAM_PUBLISH_ENABLED || 'false').toLowerCase() === 'true';
  const preferredPageId = trimString(process.env.INSTAGRAM_TARGET_PAGE_ID);
  const preferredIgUserId = trimString(process.env.INSTAGRAM_IG_USER_ID);
  const assetUrl = trimString(row.output_video_url);
  const captionFinal = trimString(row.caption_final);
  const hashtagsFinal = trimString(row.hashtags_final);
  const composedCaption = [captionFinal, hashtagsFinal].filter(Boolean).join('\n\n').trim();
  const approvalPlatformAccountId = trimString(row.approval_platform_account_id);
  const clientAccountContext = asObject(row.client_account_context);
  const expectedContextPlatformAccountId = trimString(
    clientAccountContext?.publishing_policy?.platform_account_id
    || clientAccountContext?.platform_account?.platform_account_id,
  );

  if (trimString(row.content_status) !== 'render_complete') errors.push('Content status must be render_complete before Reel publish.');
  if (trimString(row.render_status) !== 'success') errors.push('Render status must be success before Reel publish.');
  if (!captionFinal) errors.push('caption_final is empty.');
  if (!assetUrl || !/^https?:\/\//i.test(assetUrl) || isLocalOnlyAssetHost(assetUrl)) errors.push('output_video_url must be a public http(s) MP4 URL.');
  if (!/\.mp4(?:[?#].*)?$/i.test(assetUrl)) errors.push('The Reel asset must resolve to a public MP4 delivery URL.');
  if (!publishEnabled) errors.push('INSTAGRAM_PUBLISH_ENABLED is not true.');
  if (!rootAccessToken) errors.push('INSTAGRAM_GRAPH_API_TOKEN is empty.');
  if (preferredIgUserId && approvalPlatformAccountId && approvalPlatformAccountId !== preferredIgUserId) {
    errors.push(`Approval account ${approvalPlatformAccountId} does not match INSTAGRAM_IG_USER_ID ${preferredIgUserId}.`);
  }
  if (expectedContextPlatformAccountId && approvalPlatformAccountId !== expectedContextPlatformAccountId) {
    errors.push(`Approval account ${approvalPlatformAccountId} does not match client/account context publish account ${expectedContextPlatformAccountId}.`);
  }

  const details = {
    checked_at: new Date().toISOString(),
    publish_enabled: publishEnabled,
    content_id: contentId,
    approval_id: row.approval_id,
    approval_platform_account_id: approvalPlatformAccountId,
    asset: {
      url: assetUrl,
      mime_type: 'video/mp4',
      duration_seconds: Number(row.duration_seconds ?? 0) || null,
      resolution: trimString(row.resolution) || null,
      cover_image_url: trimString(row.cover_image_url) || null,
    },
    caption_preview: composedCaption.slice(0, 500),
  };

  let publishResult = {
    run_status: 'failed',
    publish_status_after_run: 'failed',
    error_message: errors.join(' | '),
    instagram_media_id: '',
    instagram_container_id: '',
    details_json: { ...details, validation_errors: errors },
  };

  if (errors.length === 0) {
    const pagesResponse = await graphRequest({
      path: 'me/accounts',
      token: rootAccessToken,
      qs: { fields: 'id,name' },
    });
    details.page_lookup = {
      http_status: pagesResponse.status,
      page_count: Array.isArray(pagesResponse.body?.data) ? pagesResponse.body.data.length : 0,
    };
    if (!pagesResponse.ok) {
      publishResult.error_message = `/me/accounts failed: ${pagesResponse.body?.error?.message ?? 'unknown error'}`;
      publishResult.details_json = { ...details, page_lookup: { ...details.page_lookup, body: pagesResponse.body } };
    } else {
      const pages = Array.isArray(pagesResponse.body?.data) ? pagesResponse.body.data : [];
      const selectedPage = preferredPageId ? pages.find((page) => String(page.id) === preferredPageId) : pages[0];
      if (!selectedPage) {
        publishResult.error_message = preferredPageId
          ? `INSTAGRAM_TARGET_PAGE_ID=${preferredPageId} was not returned by /me/accounts.`
          : 'No linked Facebook Pages were returned by /me/accounts.';
        publishResult.details_json = { ...details, linked_pages: pages };
      } else {
        details.selected_page = { id: selectedPage.id, name: selectedPage.name };
        const pageDetailsResponse = await graphRequest({
          path: String(selectedPage.id),
          token: rootAccessToken,
          qs: { fields: 'id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}' },
        });
        if (!pageDetailsResponse.ok) {
          publishResult.error_message = `Page metadata lookup failed: ${pageDetailsResponse.body?.error?.message ?? 'unknown error'}`;
          publishResult.details_json = { ...details, page_details_lookup: { http_status: pageDetailsResponse.status, body: pageDetailsResponse.body } };
        } else {
          const pageDetails = pageDetailsResponse.body ?? {};
          const discoveredIgAccount = pageDetails.instagram_business_account ?? pageDetails.connected_instagram_account ?? null;
          const selectedIgAccount = preferredIgUserId
            ? (discoveredIgAccount && String(discoveredIgAccount.id) === preferredIgUserId ? discoveredIgAccount : null)
            : discoveredIgAccount;
          if (!selectedIgAccount) {
            publishResult.error_message = preferredIgUserId
              ? `INSTAGRAM_IG_USER_ID=${preferredIgUserId} was not returned for the selected Page.`
              : 'No Instagram professional account was returned for the selected Page.';
            publishResult.details_json = { ...details, page_details_lookup: { http_status: pageDetailsResponse.status } };
          } else if (approvalPlatformAccountId !== String(selectedIgAccount.id)) {
            publishResult.error_message = `Approval account ${approvalPlatformAccountId} does not match selected Instagram account ${selectedIgAccount.id}.`;
            publishResult.details_json = details;
          } else {
            const pageAccessToken = trimString(pageDetails.access_token) || rootAccessToken;
            const limitResponse = await graphRequest({
              path: `${selectedIgAccount.id}/content_publishing_limit`,
              token: pageAccessToken,
            });
            details.content_publishing_limit = {
              http_status: limitResponse.status,
              quota_usage: Number(limitResponse.body?.data?.[0]?.quota_usage ?? 0),
            };
            if (!limitResponse.ok) {
              publishResult.error_message = `content_publishing_limit failed: ${limitResponse.body?.error?.message ?? 'unknown error'}`;
              publishResult.details_json = { ...details, content_publishing_limit: { ...details.content_publishing_limit, body: limitResponse.body } };
            } else if (details.content_publishing_limit.quota_usage >= 100) {
              publishResult.error_message = `The account has already reached ${details.content_publishing_limit.quota_usage} API-published posts in the current 24-hour window.`;
              publishResult.details_json = details;
            } else {
              const containerResponse = await graphRequest({
                method: 'POST',
                path: `${selectedIgAccount.id}/media`,
                token: pageAccessToken,
                body: {
                  media_type: 'REELS',
                  video_url: assetUrl,
                  caption: composedCaption,
                  share_to_feed: true,
                },
              });
              details.container_create = { http_status: containerResponse.status, body: containerResponse.body };
              if (!containerResponse.ok || !containerResponse.body?.id) {
                publishResult.instagram_container_id = trimString(containerResponse.body?.id);
                publishResult.error_message = `Reel container creation failed: ${containerResponse.body?.error?.message ?? 'unknown error'}`;
                publishResult.details_json = details;
              } else {
                const containerId = trimString(containerResponse.body.id);
                let finalContainerStatus = '';
                const statusChecks = [];
                for (let attempt = 1; attempt <= 18; attempt += 1) {
                  const statusResponse = await graphRequest({
                    path: containerId,
                    token: pageAccessToken,
                    qs: { fields: 'status_code' },
                  });
                  const statusCode = trimString(statusResponse.body?.status_code).toUpperCase();
                  statusChecks.push({ attempt, http_status: statusResponse.status, status_code: statusCode || null, body: statusResponse.body });
                  if (!statusResponse.ok) {
                    publishResult.instagram_container_id = containerId;
                    publishResult.error_message = `Container status polling failed: ${statusResponse.body?.error?.message ?? 'unknown error'}`;
                    publishResult.details_json = { ...details, container_status_checks: statusChecks };
                    break;
                  }
                  finalContainerStatus = statusCode;
                  if (statusCode === 'FINISHED' || statusCode === 'ERROR' || statusCode === 'EXPIRED') break;
                  await sleep(5000);
                }
                details.container_status_checks = statusChecks;
                if (!publishResult.error_message) {
                  if (finalContainerStatus !== 'FINISHED') {
                    publishResult.instagram_container_id = containerId;
                    publishResult.error_message = `Container ${containerId} did not reach FINISHED status. Last status: ${finalContainerStatus || 'unknown'}.`;
                    publishResult.details_json = details;
                  } else {
                    const publishResponse = await graphRequest({
                      method: 'POST',
                      path: `${selectedIgAccount.id}/media_publish`,
                      token: pageAccessToken,
                      body: { creation_id: containerId },
                    });
                    details.publish_response = { http_status: publishResponse.status, body: publishResponse.body };
                    if (!publishResponse.ok || !publishResponse.body?.id) {
                      publishResult.instagram_container_id = containerId;
                      publishResult.error_message = `media_publish failed: ${publishResponse.body?.error?.message ?? 'unknown error'}`;
                      publishResult.details_json = details;
                    } else {
                      publishResult = {
                        run_status: 'success',
                        publish_status_after_run: 'published',
                        error_message: '',
                        instagram_media_id: trimString(publishResponse.body.id),
                        instagram_container_id: containerId,
                        details_json: details,
                      };
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  await withTransaction(pool, async (client) => {
    await client.query(
      `insert into publishes (
        content_id,
        platform,
        publish_status,
        caption_final,
        hashtags_final,
        instagram_media_id,
        instagram_container_id,
        published_at,
        publish_error
      ) values ($1,'instagram',$2,$3,$4,nullif($5,''),nullif($6,''),case when $2 = 'published' then now() else null end,nullif($7,''))
      on conflict (content_id) do update set
        publish_status = excluded.publish_status,
        caption_final = excluded.caption_final,
        hashtags_final = excluded.hashtags_final,
        instagram_media_id = excluded.instagram_media_id,
        instagram_container_id = excluded.instagram_container_id,
        published_at = excluded.published_at,
        publish_error = excluded.publish_error`,
      [
        contentId,
        publishResult.publish_status_after_run,
        captionFinal,
        hashtagsFinal,
        publishResult.instagram_media_id,
        publishResult.instagram_container_id,
        publishResult.error_message,
      ],
    );
    if (publishResult.run_status === 'success') {
      await client.query(
        `update content_items
        set status = 'published',
            published_at = now(),
            updated_at = now()
        where content_id = $1`,
        [contentId],
      );
    }
    await logWorkflowRun(client, {
      contentId,
      workflowName: 'wf_instagram_reel_publish',
      runStatus: publishResult.run_status,
      startedAt,
      durationMs: durationMsFrom(startedAt),
      errorMessage: publishResult.error_message || null,
      details: publishResult.details_json,
    });
  });

  if (publishResult.run_status !== 'success') {
    fail(publishResult.error_message || 'Instagram Reel publish failed.');
  }
  return {
    content_id: contentId,
    publish_status_after_success: 'published',
    instagram_media_id: publishResult.instagram_media_id,
    instagram_container_id: publishResult.instagram_container_id,
  };
}

const STAGE_HANDLERS = Object.freeze({
  story_package_generation: runStoryPackageGeneration,
  image_asset_generation: runImageAssetGeneration,
  asset_generation_v3: runAssetGenerationV3,
  narration_generation: runNarrationGeneration,
  avatar_consent_gate: runAvatarConsentGate,
  heygen_avatar_generation: runHeygenAvatarGeneration,
  remotion_manifest: runRenderManifestConstruction,
  render_manifest_construction: runRenderManifestConstruction,
  remotion_render: runRenderSyncCompletion,
  render_sync_completion: runRenderSyncCompletion,
  caption_and_hashtags: runCaptionAndHashtags,
  final_qa_approval_gate: runFinalQaApprovalGate,
  instagram_reel_publish: runInstagramReelPublish,
});

export async function executePipelineStage(stageKey, context) {
  const handler = STAGE_HANDLERS[stageKey];
  if (!handler) {
    fail(`No code-first pipeline handler exists for stage '${stageKey}'.`);
  }
  return handler(context);
}
