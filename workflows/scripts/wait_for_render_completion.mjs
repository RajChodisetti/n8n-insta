#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('/usr/local/lib/node_modules/n8n/node_modules/pg');

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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const waitSeconds = Math.max(5, Number.parseInt(String(process.env.RENDER_WAIT_SECONDS || '300'), 10) || 300);
  const pollSeconds = Math.max(2, Number.parseInt(String(process.env.RENDER_WAIT_POLL_SECONDS || '5'), 10) || 5);
  const deadline = Date.now() + (waitSeconds * 1000);

  const client = new Client({
    host: ensureString('DB_POSTGRESDB_HOST', process.env.DB_POSTGRESDB_HOST),
    port: Number.parseInt(String(process.env.DB_POSTGRESDB_PORT || '5432'), 10) || 5432,
    database: ensureString('DB_POSTGRESDB_DATABASE', process.env.DB_POSTGRESDB_DATABASE),
    user: ensureString('DB_POSTGRESDB_USER', process.env.DB_POSTGRESDB_USER),
    password: ensureString('DB_POSTGRESDB_PASSWORD', process.env.DB_POSTGRESDB_PASSWORD),
  });

  await client.connect();

  try {
    let lastSummary = null;
    while (Date.now() <= deadline) {
      const result = await client.query(
        `select
          ci.content_id,
          ci.slug,
          ci.status as content_status,
          r.render_status,
          coalesce(r.output_video_url, '') as output_video_url,
          coalesce(r.cover_image_url, '') as cover_image_url,
          coalesce(r.resolution, '') as resolution,
          coalesce(r.duration_seconds, 0) as duration_seconds,
          coalesce(r.render_log, '') as render_log
        from content_items ci
        join renders r on r.content_id = ci.content_id
        where ci.status in ('dispatching_render', 'render_queued', 'render_complete', 'render_failed')
        order by ci.updated_at desc
        limit 1`,
      );

      const row = result.rows[0];
      if (row) {
        lastSummary = {
          content_id: String(row.content_id || '').trim(),
          slug: String(row.slug || '').trim(),
          content_status: String(row.content_status || '').trim(),
          render_status: String(row.render_status || '').trim(),
          output_video_url: String(row.output_video_url || '').trim(),
          cover_image_url: String(row.cover_image_url || '').trim(),
          resolution: String(row.resolution || '').trim(),
          duration_seconds: Number(row.duration_seconds || 0),
          render_log: String(row.render_log || '').trim(),
        };

        if (
          lastSummary.content_status === 'render_complete'
          && lastSummary.render_status === 'success'
          && lastSummary.output_video_url
        ) {
          process.stdout.write(JSON.stringify(lastSummary));
          return;
        }

        if (lastSummary.content_status === 'render_failed' || lastSummary.render_status === 'failed') {
          fail(`Render failed for ${lastSummary.slug || lastSummary.content_id}: ${lastSummary.render_log || 'no render_log available'}`);
        }
      }

      await sleep(pollSeconds * 1000);
    }

    fail(`Timed out after ${waitSeconds}s waiting for render completion.${lastSummary ? ` Last status: ${lastSummary.content_status}/${lastSummary.render_status}` : ''}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
