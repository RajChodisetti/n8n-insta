#!/usr/bin/env node
/**
 * Uploads all music files in workflows/assets/music/ to GCS and rewrites
 * library.json so the render worker fetches music from GCS instead of
 * local volume mounts.
 *
 * Usage: node scripts/upload_music_to_gcs.mjs
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MUSIC_DIR = path.join(REPO_ROOT, 'workflows', 'assets', 'music');
const LIBRARY_PATH = path.join(MUSIC_DIR, 'library.json');
const SA_KEY_PATH = path.join(REPO_ROOT, 'sa-key.json');

const GCS_ENDPOINT = 'https://storage.googleapis.com';
const GCS_PUBLIC_BASE = 'https://storage.googleapis.com';
const GCS_BUCKET = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'n8ninstastorage';
const GCS_PREFIX = 'assets/music';

const AUDIO_CONTENT_TYPES = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};

function log(msg) {
  process.stderr.write(`[upload_music_to_gcs] ${msg}\n`);
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGcsToken() {
  const sa = JSON.parse(await fs.readFile(SA_KEY_PATH, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), sa.private_key);
  const assertion = `${signingInput}.${base64UrlEncode(signature)}`;

  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`GCS token exchange failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function uploadToGcs(token, localPath, objectKey, contentType) {
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const url = `${GCS_ENDPOINT}/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${encodedKey}`;
  const binary = await fs.readFile(localPath);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'Content-Length': String(binary.length),
    },
    body: binary,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GCS upload failed for ${objectKey} (${res.status}): ${text}`);
  }
  return `${GCS_PUBLIC_BASE}/${GCS_BUCKET}/${objectKey}`;
}

async function main() {
  const library = JSON.parse(await fs.readFile(LIBRARY_PATH, 'utf8'));
  const audioFiles = (await fs.readdir(MUSIC_DIR))
    .filter((f) => f !== 'library.json' && f !== 'library.sample.json' && f !== 'README.md')
    .filter((f) => Object.keys(AUDIO_CONTENT_TYPES).some((ext) => f.endsWith(ext)));

  log(`Authenticating with GCS as service account from ${SA_KEY_PATH}`);
  const token = await getGcsToken();
  log(`Got GCS access token`);

  // Build a map: filename → GCS public URL
  const urlMap = {};
  for (const file of audioFiles) {
    const ext = path.extname(file).toLowerCase();
    const contentType = AUDIO_CONTENT_TYPES[ext] || 'audio/mpeg';
    const objectKey = `${GCS_PREFIX}/${file}`;
    const localPath = path.join(MUSIC_DIR, file);
    log(`Uploading ${file} → gs://${GCS_BUCKET}/${objectKey}`);
    const publicUrl = await uploadToGcs(token, localPath, objectKey, contentType);
    urlMap[file] = publicUrl;
    log(`  ✓ ${publicUrl}`);
  }

  // Rewrite library.json: replace relative_path with url, remove relative_path
  const updated = library.map((entry) => {
    const relativePath = String(entry.relative_path || entry.file || '').trim();
    const gcsUrl = relativePath ? urlMap[relativePath] : null;
    if (!gcsUrl) {
      log(`WARN: no uploaded file found for entry "${entry.id}" (relative_path="${relativePath}") — keeping as-is`);
      return entry;
    }
    const { relative_path, file, ...rest } = entry;
    return { ...rest, url: gcsUrl };
  });

  const backupPath = LIBRARY_PATH + '.bak';
  await fs.copyFile(LIBRARY_PATH, backupPath);
  await fs.writeFile(LIBRARY_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf8');

  log(`\nDone. ${audioFiles.length} files uploaded.`);
  log(`library.json rewritten (backup: library.json.bak)`);
  log(`\nGCS URLs:`);
  for (const [file, url] of Object.entries(urlMap)) {
    process.stdout.write(`  ${file}: ${url}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
});
