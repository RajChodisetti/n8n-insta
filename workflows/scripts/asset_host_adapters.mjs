#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { assetHostAliases, providerNotImplemented, selectAssetHostProvider } from './adapter_config.mjs';

const DEFAULT_PUBLIC_BASE_URL = `http://localhost:${process.env.MINIO_API_HOST_PORT || '39000'}`;
const GOOGLE_CLOUD_STORAGE_DEFAULT_ENDPOINT = 'https://storage.googleapis.com';
const GOOGLE_CLOUD_STORAGE_DEFAULT_PUBLIC_BASE_URL = 'https://storage.googleapis.com';
const GOOGLE_CLOUD_STORAGE_DEFAULT_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';
const GOOGLE_CLOUD_STORAGE_DEFAULT_KEY_PATH = '/secrets/google/sa-key.json';
let cachedGoogleCloudStorageToken = null;

function fail(message) {
  throw new Error(message);
}

async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ensureString(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    fail(`${name} is required.`);
  }
  return normalized;
}

function toIsoBasic(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmac(key, data, encoding) {
  return crypto.createHmac('sha256', key).update(data).digest(encoding);
}

function encodeObjectKey(key) {
  return String(key || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizePublicBaseUrl(value) {
  const normalized = String(value || '').trim() || DEFAULT_PUBLIC_BASE_URL;
  try {
    return new URL(normalized).toString().replace(/\/$/, '');
  } catch (error) {
    fail(`REELS_STORAGE_PUBLIC_BASE_URL is invalid: ${error.message}`);
  }
}

function normalizeRequiredUrl(name, value) {
  try {
    return new URL(ensureString(name, value)).toString().replace(/\/$/, '');
  } catch (error) {
    fail(`${name} is invalid: ${error.message}`);
  }
}

function encodeQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    query.set(key, String(value));
  }
  return query.toString();
}

async function readJsonResponse(response) {
  const responseText = await response.text().catch(() => '');
  if (!responseText) {
    return {};
  }
  try {
    return JSON.parse(responseText);
  } catch {
    return { raw: responseText };
  }
}

async function fetchWithContext(url, options, failureContext) {
  try {
    return await fetch(url, options);
  } catch (error) {
    fail(`${failureContext}: ${error.message}`);
  }
}

function base64UrlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function readGoogleCloudStorageServiceAccount() {
  const keyPath = ensureString(
    'GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH',
    process.env.GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH || GOOGLE_CLOUD_STORAGE_DEFAULT_KEY_PATH,
  );
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(keyPath, 'utf8'));
  } catch (error) {
    fail(`Could not read Google Cloud Storage service-account key at ${keyPath}: ${error.message}`);
  }

  const clientEmail = ensureString('client_email', parsed.client_email);
  const privateKey = ensureString('private_key', parsed.private_key);
  const tokenUri = normalizeRequiredUrl('token_uri', parsed.token_uri || 'https://oauth2.googleapis.com/token');
  return { keyPath, clientEmail, privateKey, tokenUri };
}

function buildGoogleCloudStorageJwtAssertion(serviceAccount) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.clientEmail,
    scope: GOOGLE_CLOUD_STORAGE_DEFAULT_SCOPE,
    aud: serviceAccount.tokenUri,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), serviceAccount.privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function getGoogleCloudStorageAccessToken() {
  const serviceAccount = await readGoogleCloudStorageServiceAccount();
  const nowMs = Date.now();
  if (
    cachedGoogleCloudStorageToken
    && cachedGoogleCloudStorageToken.keyPath === serviceAccount.keyPath
    && cachedGoogleCloudStorageToken.expiresAtMs > nowMs + 60_000
  ) {
    return cachedGoogleCloudStorageToken.accessToken;
  }

  const assertion = buildGoogleCloudStorageJwtAssertion(serviceAccount);
  const maxAttempts = Math.max(
    1,
    Number.parseInt(String(process.env.GOOGLE_CLOUD_STORAGE_OAUTH_MAX_ATTEMPTS || '3'), 10) || 3,
  );
  const retryDelayMs = Math.max(
    250,
    Number.parseInt(String(process.env.GOOGLE_CLOUD_STORAGE_OAUTH_RETRY_DELAY_MS || '1000'), 10) || 1000,
  );
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
  let responseBody = null;
  let response = null;
  let lastFailureMessage = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(serviceAccount.tokenUri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
      });
    } catch (error) {
      lastFailureMessage = `Google Cloud Storage OAuth token request failed after ${attempt} attempt(s) (${serviceAccount.tokenUri}): ${error.message}`;
      if (attempt >= maxAttempts) {
        fail(lastFailureMessage);
      }
      await wait(retryDelayMs * attempt);
      continue;
    }

    responseBody = await readJsonResponse(response);
    if (response.ok && responseBody.access_token) {
      break;
    }

    lastFailureMessage = `Google Cloud Storage OAuth token exchange failed after ${attempt} attempt(s) (${response.status}): ${JSON.stringify(responseBody)}`;
    if (attempt >= maxAttempts || !retryableStatuses.has(Number(response.status || 0))) {
      fail(lastFailureMessage);
    }
    await wait(retryDelayMs * attempt);
  }

  if (!response?.ok || !responseBody?.access_token) {
    fail(lastFailureMessage || 'Google Cloud Storage OAuth token exchange failed without a usable access token.');
  }

  const expiresIn = Number(responseBody.expires_in || 3600);
  cachedGoogleCloudStorageToken = {
    keyPath: serviceAccount.keyPath,
    accessToken: String(responseBody.access_token),
    expiresAtMs: nowMs + Math.max(expiresIn - 60, 60) * 1000,
  };
  return cachedGoogleCloudStorageToken.accessToken;
}

export function buildPublicObjectUrl(baseUrl, bucket, objectKey) {
  const url = new URL(baseUrl);
  const encodedBucket = encodeURIComponent(bucket);
  const encodedKey = encodeObjectKey(objectKey);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/${encodedBucket}/${encodedKey}`.replace(/\/{2,}/g, '/');
  url.search = '';
  url.hash = '';
  return url.toString();
}

function buildSignedObjectStorageRequest({
  method,
  endpoint,
  bucket,
  objectKey,
  accessKeyId,
  secretAccessKey,
  region,
  body = '',
  contentType = '',
}) {
  const endpointUrl = new URL(endpoint);
  const encodedKey = encodeObjectKey(objectKey);
  const basePath = endpointUrl.pathname.replace(/\/$/, '');
  const canonicalUri = `${basePath}/${encodeURIComponent(bucket)}/${encodedKey}`.replace(/\/{2,}/g, '/');
  const requestUrl = new URL(endpoint);
  requestUrl.pathname = canonicalUri;
  requestUrl.search = '';
  requestUrl.hash = '';

  const now = new Date();
  const amzDate = toIsoBasic(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const headerLines = [
    `host:${endpointUrl.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ];
  const requestHeaders = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  if (Buffer.isBuffer(body) || typeof body === 'string') {
    requestHeaders['Content-Length'] = String(Buffer.byteLength(body));
    headerLines.unshift(`content-length:${requestHeaders['Content-Length']}`);
  }
  if (contentType) {
    requestHeaders['Content-Type'] = contentType;
    headerLines.splice(requestHeaders['Content-Length'] ? 1 : 0, 0, `content-type:${contentType}`);
  }

  const canonicalHeaders = headerLines.join('\n') + '\n';
  const signedHeaders = headerLines
    .map((line) => line.split(':', 1)[0])
    .join(';');
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(
    hmac(
      hmac(
        hmac(`AWS4${secretAccessKey}`, dateStamp),
        region,
      ),
      's3',
    ),
    'aws4_request',
  );
  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: requestUrl.toString(),
    headers: {
      Authorization: authorization,
      ...requestHeaders,
    },
  };
}

function buildSignedUploadRequest({ endpoint, bucket, objectKey, contentType, body, accessKeyId, secretAccessKey, region }) {
  return buildSignedObjectStorageRequest({
    method: 'PUT',
    endpoint,
    bucket,
    objectKey,
    accessKeyId,
    secretAccessKey,
    region,
    body,
    contentType,
  });
}

async function uploadToObjectStorage(binaryBody, { objectKey, contentType }) {
  const endpoint = ensureString('REELS_STORAGE_ENDPOINT', process.env.REELS_STORAGE_ENDPOINT);
  const bucket = ensureString('REELS_STORAGE_BUCKET', process.env.REELS_STORAGE_BUCKET);
  const accessKeyId = ensureString(
    'storage access key',
    process.env.REELS_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || process.env.MINIO_ROOT_USER,
  );
  const secretAccessKey = ensureString(
    'storage secret key',
    process.env.REELS_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || process.env.MINIO_ROOT_PASSWORD,
  );
  const region = String(process.env.REELS_STORAGE_REGION || process.env.AWS_REGION || 'us-east-1').trim() || 'us-east-1';
  const upload = buildSignedUploadRequest({
    endpoint,
    bucket,
    objectKey,
    contentType,
    body: binaryBody,
    accessKeyId,
    secretAccessKey,
    region,
  });

  const response = await fetchWithContext(
    upload.url,
    {
      method: 'PUT',
      headers: upload.headers,
      body: binaryBody,
    },
    `Object-storage upload request failed for ${bucket}/${objectKey} (${endpoint})`,
  );
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    fail(`Object-storage upload failed (${response.status}): ${bodyText || 'unknown error'}`);
  }

  const publicBaseUrl = normalizePublicBaseUrl(process.env.REELS_STORAGE_PUBLIC_BASE_URL);
  return {
    mode: 'object_storage',
    bucket,
    endpoint,
    region,
    publicBaseUrl,
    objectKey,
    url: buildPublicObjectUrl(publicBaseUrl, bucket, objectKey),
    size: binaryBody.length,
  };
}

async function uploadToGoogleCloudStorage(binaryBody, { objectKey, contentType }) {
  const endpoint = normalizeRequiredUrl(
    'GOOGLE_CLOUD_STORAGE_ENDPOINT',
    process.env.GOOGLE_CLOUD_STORAGE_ENDPOINT || GOOGLE_CLOUD_STORAGE_DEFAULT_ENDPOINT,
  );
  const publicBaseUrl = normalizeRequiredUrl(
    'GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL',
    process.env.GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL || GOOGLE_CLOUD_STORAGE_DEFAULT_PUBLIC_BASE_URL,
  );
  const bucket = ensureString('GOOGLE_CLOUD_STORAGE_BUCKET', process.env.GOOGLE_CLOUD_STORAGE_BUCKET);
  const accessToken = await getGoogleCloudStorageAccessToken();
  const uploadUrl = new URL(`/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`, endpoint);
  uploadUrl.search = encodeQuery({
    uploadType: 'media',
    name: objectKey,
  });

  const response = await fetchWithContext(
    uploadUrl.toString(),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
        'Content-Length': String(binaryBody.length),
      },
      body: binaryBody,
    },
    `Google Cloud Storage upload request failed for ${bucket}/${objectKey} (${endpoint})`,
  );
  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    fail(`Google Cloud Storage upload failed (${response.status}): ${JSON.stringify(responseBody)}`);
  }

  return {
    mode: 'google_cloud_storage',
    bucket,
    endpoint,
    publicBaseUrl,
    objectKey,
    url: buildPublicObjectUrl(publicBaseUrl, bucket, objectKey),
    size: binaryBody.length,
    mediaLink: String(responseBody.mediaLink || ''),
    generation: String(responseBody.generation || ''),
  };
}

async function deleteFromObjectStorage(options = {}) {
  const objectKey = ensureString('objectKey', options.objectKey);
  const endpoint = ensureString('REELS_STORAGE_ENDPOINT', options.endpoint || process.env.REELS_STORAGE_ENDPOINT);
  const bucket = ensureString('REELS_STORAGE_BUCKET', options.bucket || process.env.REELS_STORAGE_BUCKET);
  const accessKeyId = ensureString(
    'storage access key',
    options.accessKeyId
      || process.env.REELS_STORAGE_ACCESS_KEY_ID
      || process.env.AWS_ACCESS_KEY_ID
      || process.env.MINIO_ROOT_USER,
  );
  const secretAccessKey = ensureString(
    'storage secret key',
    options.secretAccessKey
      || process.env.REELS_STORAGE_SECRET_ACCESS_KEY
      || process.env.AWS_SECRET_ACCESS_KEY
      || process.env.MINIO_ROOT_PASSWORD,
  );
  const region = String(
    options.region
      || process.env.REELS_STORAGE_REGION
      || process.env.AWS_REGION
      || 'us-east-1',
  ).trim() || 'us-east-1';

  const request = buildSignedObjectStorageRequest({
    method: 'DELETE',
    endpoint,
    bucket,
    objectKey,
    accessKeyId,
    secretAccessKey,
    region,
  });
  const response = await fetchWithContext(
    request.url,
    {
      method: 'DELETE',
      headers: request.headers,
    },
    `Object-storage delete request failed for ${bucket}/${objectKey} (${endpoint})`,
  );

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    fail(`Object-storage delete failed (${response.status}): ${bodyText || 'unknown error'}`);
  }

  return {
    mode: 'object_storage',
    bucket,
    endpoint,
    region,
    objectKey,
    deleted: true,
    missing: false,
  };
}

async function deleteFromGoogleCloudStorage(options = {}) {
  const objectKey = ensureString('objectKey', options.objectKey);
  const endpoint = normalizeRequiredUrl(
    'GOOGLE_CLOUD_STORAGE_ENDPOINT',
    options.endpoint || process.env.GOOGLE_CLOUD_STORAGE_ENDPOINT || GOOGLE_CLOUD_STORAGE_DEFAULT_ENDPOINT,
  );
  const bucket = ensureString('GOOGLE_CLOUD_STORAGE_BUCKET', options.bucket || process.env.GOOGLE_CLOUD_STORAGE_BUCKET);
  const accessToken = await getGoogleCloudStorageAccessToken();
  const objectUrl = new URL(`/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectKey)}`, endpoint);

  const response = await fetchWithContext(
    objectUrl.toString(),
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    `Google Cloud Storage delete request failed for ${bucket}/${objectKey} (${endpoint})`,
  );

  if (response.status === 404) {
    return {
      mode: 'google_cloud_storage',
      bucket,
      endpoint,
      objectKey,
      deleted: false,
      missing: true,
    };
  }

  if (!response.ok) {
    const responseBody = await readJsonResponse(response);
    fail(`Google Cloud Storage delete failed (${response.status}): ${JSON.stringify(responseBody)}`);
  }

  return {
    mode: 'google_cloud_storage',
    bucket,
    endpoint,
    objectKey,
    deleted: true,
    missing: false,
  };
}

export async function uploadBinaryAsset(component, binaryBody, options) {
  const provider = assetHostAliases(options?.hostProvider || selectAssetHostProvider(component));
  if (provider === 'google_cloud_storage') {
    return uploadToGoogleCloudStorage(binaryBody, options);
  }
  if (provider === 'object_storage') {
    return uploadToObjectStorage(binaryBody, options);
  }

  providerNotImplemented('asset host', provider, component);
}

export async function deleteHostedObject(component, options = {}) {
  const provider = assetHostAliases(options.hostProvider || selectAssetHostProvider(component));
  if (provider === 'google_cloud_storage') {
    return deleteFromGoogleCloudStorage(options);
  }
  if (provider === 'object_storage') {
    return deleteFromObjectStorage(options);
  }

  providerNotImplemented('asset host', provider, component);
}
