#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { uploadBinaryAsset } from '../../workflows/scripts/asset_host_adapters.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const ENTRY_POINT = path.join(__dirname, 'src/index.jsx');
const PORT = Math.max(1, Number.parseInt(String(process.env.REMOTION_RENDERER_PORT || '8081'), 10) || 8081);

let bundlePromise = null;

function trimString(value) {
  return String(value ?? '').trim();
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function renderOutputKey(request) {
  const configuredPath = trimString(request?.storage?.output_path);
  if (configuredPath) {
    return configuredPath.replace(/^\/+/, '');
  }
  const prefix = trimString(process.env.RENDER_OUTPUT_PATH_PREFIX || 'reels').replace(/^\/+|\/+$/g, '') || 'reels';
  const contentId = trimString(request.content_id || 'unknown-content');
  return `${prefix}/${contentId}/final.mp4`;
}

function buildRenderProps(request) {
  const manifest = request.render_manifest && typeof request.render_manifest === 'object'
    ? request.render_manifest
    : {
      manifest_version: 2,
      render_mode: request.render_mode || request.reel_type || 'video',
      reel_type: request.reel_type || 'video',
      title: request.title || '',
      title_overlay: request.title_overlay || { enabled: false },
      output: request.output || {},
      timeline: Array.isArray(request.timeline) ? request.timeline.map((scene) => ({
        scene_number: scene.scene_number,
        start_time_seconds: scene.start_time ?? scene.start_time_seconds ?? 0,
        end_time_seconds: scene.end_time ?? scene.end_time_seconds ?? null,
        duration_seconds: scene.duration_seconds,
        asset_url: scene.asset_url,
        asset_type: scene.asset_type,
        narration_url: scene.narration_url,
        transition: scene.transition,
      })) : [],
      audio: request.audio || {},
      subtitles: request.subtitles || { enabled: false, lines: [] },
      cover_image_url: request.cover?.cover_asset_url || '',
    };

  return {
    request_id: trimString(request.request_id),
    content_id: trimString(request.content_id),
    title: trimString(request.title || manifest.title),
    title_overlay: request.title_overlay || manifest.title_overlay || { enabled: false },
    render_mode: trimString(request.render_mode || manifest.render_mode || request.reel_type || manifest.reel_type || 'video'),
    reel_type: trimString(request.reel_type || manifest.reel_type || 'video'),
    output: request.output || manifest.output || {},
    timeline: Array.isArray(manifest.timeline) ? manifest.timeline : [],
    audio: manifest.audio || request.audio || {},
    subtitles: manifest.subtitles || request.subtitles || { enabled: false, lines: [] },
    cover: request.cover || { enabled: Boolean(manifest.cover_image_url), cover_asset_url: manifest.cover_image_url || null },
    render_manifest: manifest,
  };
}

async function getBundleUrl() {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: ENTRY_POINT,
      webpackOverride: (config) => ({
        ...config,
        optimization: {
          ...(config.optimization || {}),
          concatenateModules: false,
        },
      }),
    });
  }
  return bundlePromise;
}

function estimateDurationSeconds(props) {
  const manifestDuration = Number(props.render_manifest?.total_duration_seconds ?? 0);
  if (Number.isFinite(manifestDuration) && manifestDuration > 0) {
    return manifestDuration;
  }
  const timeline = Array.isArray(props.timeline) ? props.timeline : [];
  const total = timeline.reduce((max, scene) => {
    const end = Number(scene.end_time_seconds ?? scene.end_time ?? 0);
    const start = Number(scene.start_time_seconds ?? scene.start_time ?? 0);
    const duration = Number(scene.duration_seconds ?? 0);
    return Math.max(max, Number.isFinite(end) && end > 0 ? end : start + duration);
  }, 0);
  return Number.isFinite(total) && total > 0 ? total : 1;
}

async function renderSync(request) {
  const props = buildRenderProps(request);
  const output = props.output || {};
  const width = Number(output.width || 1080);
  const height = Number(output.height || 1920);
  const fps = Number(output.fps || 30);
  const durationSeconds = estimateDurationSeconds(props);
  const coverImageUrl = trimString(props.cover?.cover_asset_url || props.render_manifest?.cover_image_url);

  if (trimString(process.env.REMOTION_RENDER_STUB).toLowerCase() === 'true') {
    return {
      render_status: 'success',
      output_video_url: `stub://remotion-renderer/${encodeURIComponent(props.content_id || props.request_id || 'render')}.mp4`,
      cover_image_url: coverImageUrl,
      duration_seconds: durationSeconds,
      resolution: `${width}x${height}`,
      render_log: 'REMOTION_RENDER_STUB=true returned without rendering.',
    };
  }

  const serveUrl = await getBundleUrl();
  const composition = await selectComposition({
    serveUrl,
    id: 'ReelComposition',
    inputProps: props,
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'n8n-insta-remotion-'));
  const outputLocation = path.join(tempDir, 'final.mp4');
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    inputProps: props,
    chromiumOptions: {
      enableMultiProcessOnLinux: true,
    },
  });

  const binary = await fs.readFile(outputLocation);
  const objectKey = renderOutputKey(request);
  const storage = await uploadBinaryAsset('render_output', binary, {
    objectKey,
    contentType: 'video/mp4',
    fileName: path.basename(objectKey),
  });
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  return {
    render_status: 'success',
    output_video_url: storage.url,
    cover_image_url: coverImageUrl,
    duration_seconds: durationSeconds,
    resolution: `${width}x${height}`,
    render_log: `Rendered ${composition.id} with Remotion and uploaded via ${storage.mode}.`,
  };
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, {
        ok: true,
        service: 'remotion-renderer',
        stub: trimString(process.env.REMOTION_RENDER_STUB).toLowerCase() === 'true',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/render-sync') {
      const payload = await readJsonBody(request);
      const result = await renderSync(payload);
      sendJson(response, result.render_status === 'success' ? 200 : 500, result);
      return;
    }
    sendJson(response, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(response, 500, {
      render_status: 'failed',
      error_message: error.message,
      render_log: error.stack || error.message,
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`[remotion-renderer] listening on ${PORT} from ${REPO_ROOT}\n`);
});
