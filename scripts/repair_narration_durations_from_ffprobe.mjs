#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message) {
  throw new Error(message);
}

function ensureContentId(value) {
  const normalized = String(value || '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    fail('Usage: node scripts/repair_narration_durations_from_ffprobe.mjs <content_id>');
  }
  return normalized;
}

function envString(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    fail(`${name} is required.`);
  }
  return value;
}

function probeDurationSeconds(url) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      url,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) {
    fail(`ffprobe failed for ${url}: ${String(result.stderr || '').trim()}`);
  }
  const duration = Number.parseFloat(String(result.stdout || '').trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    fail(`ffprobe returned invalid duration for ${url}: ${String(result.stdout || '').trim()}`);
  }
  return Number(duration.toFixed(3));
}

async function main() {
  const contentId = ensureContentId(process.argv[2]);
  const client = new Client({
    host: envString('DB_POSTGRESDB_HOST'),
    port: Number.parseInt(String(process.env.DB_POSTGRESDB_PORT || '5432'), 10) || 5432,
    database: envString('DB_POSTGRESDB_DATABASE'),
    user: envString('DB_POSTGRESDB_USER'),
    password: envString('DB_POSTGRESDB_PASSWORD'),
  });
  await client.connect();
  try {
    const result = await client.query(
      `select asset_id, scene_number, duration_seconds, storage_url, metadata_json
      from assets
      where content_id = $1
        and asset_role = 'scene_narration'
        and status = 'ready'
      order by scene_number`,
      [contentId],
    );
    for (const row of result.rows) {
      const previousDurationSeconds = Number(row.duration_seconds || 0);
      const actualDurationSeconds = probeDurationSeconds(String(row.storage_url || '').trim());
      const metadata = row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
      metadata.previous_duration_seconds = previousDurationSeconds;
      metadata.actual_duration_seconds = actualDurationSeconds;
      metadata.duration_source = 'ffprobe_repair';
      await client.query(
        `update assets
        set duration_seconds = $2,
            metadata_json = $3::jsonb
        where asset_id = $1`,
        [row.asset_id, actualDurationSeconds, JSON.stringify(metadata)],
      );
      process.stdout.write(`${row.scene_number}\t${previousDurationSeconds}\t${actualDurationSeconds}\n`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
