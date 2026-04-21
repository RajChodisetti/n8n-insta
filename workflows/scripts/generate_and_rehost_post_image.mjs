#!/usr/bin/env node

import crypto from 'node:crypto';

const DEFAULT_PUBLIC_BASE_URL = `http://localhost:${process.env.MINIO_API_HOST_PORT || '39000'}`;

function fail(message) {
  throw new Error(message);
}

function decodePayload() {
  const encoded = String(process.argv[2] || '').trim();
  if (!encoded) {
    fail('Missing base64 payload argument.');
  }

  try {
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    fail(`Could not decode workflow payload: ${error.message}`);
  }
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

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/%2F/gi, '/');
}

function encodeObjectKey(key) {
  return key
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function ensureString(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    fail(`${name} is required.`);
  }
  return normalized;
}

function isGptImageModel(model) {
  return /^(gpt-image-|chatgpt-image-)/i.test(model);
}

function normalizePublicBaseUrl(value) {
  const normalized = String(value || '').trim() || DEFAULT_PUBLIC_BASE_URL;
  try {
    return new URL(normalized).toString().replace(/\/$/, '');
  } catch (error) {
    fail(`REELS_STORAGE_PUBLIC_BASE_URL is invalid: ${error.message}`);
  }
}

function buildPublicObjectUrl(baseUrl, bucket, objectKey) {
  const url = new URL(baseUrl);
  const encodedBucket = encodeURIComponent(bucket);
  const encodedKey = encodeObjectKey(objectKey);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/${encodedBucket}/${encodedKey}`.replace(/\/{2,}/g, '/');
  url.search = '';
  url.hash = '';
  return url.toString();
}

function parseDimensions(size) {
  const match = String(size || '').trim().match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!match) {
    return { width: 1024, height: 1024 };
  }

  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
  };
}

function objectKeyFor(contentId, title) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const prefix = String(process.env.REELS_STORAGE_KEY_PREFIX || 'generated/instagram-posts').trim().replace(/^\/+|\/+$/g, '');
  const slug = String(title || 'story')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'story';
  return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${contentId}-${slug}.jpg`;
}

function fileNameFromObjectKey(objectKey) {
  const parts = String(objectKey || '').split('/');
  return parts[parts.length - 1] || 'post-image.jpg';
}

async function callOpenAiForJpeg(payload) {
  const apiKey = String(process.env.OPENAI_API_KEY || process.env.LLL_API_KEY || '').trim();
  if (!apiKey) {
    fail('Set OPENAI_API_KEY in the repo-root .env before running wf_simple_post_image_asset. For backward compatibility, LLL_API_KEY is also accepted.');
  }

  const request = payload.openai_image_request ?? {};
  const model = ensureString('openai_image_request.model', request.model);
  if (!isGptImageModel(model)) {
    fail(`Automatic image rehosting requires a GPT image model that can return JPEG output. Set OPENAI_IMAGE_MODEL to gpt-image-1, gpt-image-1-mini, or gpt-image-1.5. Received: ${model}`);
  }

  const body = {
    model,
    prompt: ensureString('image_prompt', payload.image_prompt),
    size: ensureString('openai_image_request.size', request.size),
    quality: ensureString('openai_image_request.quality', request.quality),
    output_format: 'jpeg',
    output_compression: Number.isFinite(Number(request.output_compression))
      ? Math.max(0, Math.min(100, Math.round(Number(request.output_compression))))
      : 92,
    n: 1,
  };

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok || responseBody.error) {
    fail(`OpenAI image generation failed (${response.status || 'no status'}): ${responseBody?.error?.message ?? 'unknown error'}`);
  }

  const imageData = Array.isArray(responseBody?.data) ? responseBody.data[0] ?? {} : {};
  const b64Json = String(imageData?.b64_json || '').trim();
  if (!b64Json) {
    fail('OpenAI image generation returned no b64_json payload.');
  }

  return {
    request: body,
    revisedPrompt: String(imageData?.revised_prompt || '').trim() || null,
    imageBuffer: Buffer.from(b64Json, 'base64'),
  };
}

function buildSignedUploadRequest({ endpoint, bucket, objectKey, contentType, body, accessKeyId, secretAccessKey, region }) {
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
  const canonicalHeaders = [
    `content-length:${body.length}`,
    `content-type:${contentType}`,
    `host:${endpointUrl.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
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
      'Content-Length': String(body.length),
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  };
}

async function uploadToObjectStorage(imageBuffer, objectKey) {
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
    contentType: 'image/jpeg',
    body: imageBuffer,
    accessKeyId,
    secretAccessKey,
    region,
  });

  const response = await fetch(upload.url, {
    method: 'PUT',
    headers: upload.headers,
    body: imageBuffer,
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    fail(`Object-storage upload failed (${response.status}): ${bodyText || 'unknown error'}`);
  }

  return {
    mode: 'object_storage',
    bucket,
    endpoint,
    region,
    publicBaseUrl: normalizePublicBaseUrl(process.env.REELS_STORAGE_PUBLIC_BASE_URL),
    objectKey,
  };
}

async function uploadToImageKit(imageBuffer, objectKey) {
  const privateKey = ensureString('IMAGEKIT_PRIVATE_KEY', process.env.IMAGEKIT_PRIVATE_KEY);
  const urlEndpoint = ensureString('IMAGEKIT_URL_ENDPOINT', process.env.IMAGEKIT_URL_ENDPOINT).replace(/\/$/, '');
  const uploadPath = String(process.env.IMAGEKIT_UPLOAD_PATH || '').trim().replace(/\/$/, '');
  const fileName = fileNameFromObjectKey(objectKey);
  const form = new FormData();
  form.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), fileName);
  form.append('fileName', fileName);
  form.append('useUniqueFileName', 'true');
  if (uploadPath) {
    form.append('folder', uploadPath);
  }

  const auth = Buffer.from(`${privateKey}:`, 'utf8').toString('base64');
  const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
    },
    body: form,
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`ImageKit upload failed (${response.status}): ${responseBody?.message || responseBody?.help || 'unknown error'}`);
  }

  const deliveredUrl = ensureString('ImageKit response url', responseBody.url);
  return {
    mode: 'imagekit',
    endpoint: 'https://upload.imagekit.io/api/v1/files/upload',
    publicBaseUrl: urlEndpoint,
    folder: uploadPath || null,
    objectKey: String(responseBody.filePath || '').trim() || objectKey,
    fileId: String(responseBody.fileId || '').trim() || null,
    filePath: String(responseBody.filePath || '').trim() || null,
    fileName: String(responseBody.name || fileName).trim(),
    url: deliveredUrl,
    thumbnailUrl: String(responseBody.thumbnailUrl || '').trim() || null,
    size: Number(responseBody.size || imageBuffer.length) || imageBuffer.length,
  };
}

async function uploadImageBuffer(imageBuffer, objectKey) {
  const provider = String(process.env.IMAGE_HOST_PROVIDER || '').trim().toLowerCase();
  if (provider === 'imagekit') {
    return uploadToImageKit(imageBuffer, objectKey);
  }

  if (provider && provider !== 'minio' && provider !== 'object_storage') {
    fail(`Unsupported IMAGE_HOST_PROVIDER: ${provider}`);
  }

  return uploadToObjectStorage(imageBuffer, objectKey);
}

async function main() {
  const payload = decodePayload();
  const contentId = ensureString('content_id', payload.content_id);
  const title = ensureString('title', payload.title);
  const openAiResult = await callOpenAiForJpeg(payload);
  const objectKey = objectKeyFor(contentId, title);
  const storage = await uploadImageBuffer(openAiResult.imageBuffer, objectKey);
  const storageUrl = storage.mode === 'imagekit'
    ? storage.url
    : buildPublicObjectUrl(storage.publicBaseUrl, storage.bucket, storage.objectKey || objectKey);
  const dimensions = parseDimensions(openAiResult.request.size);
  const imageSha256 = sha256Hex(openAiResult.imageBuffer);
  const providerSuffix = storage.mode === 'imagekit' ? 'imagekit' : 'object_storage';
  const provider = `openai_${String(openAiResult.request.model).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_rehosted_jpeg_${providerSuffix}`;
  const assetValidationNote = storage.mode === 'imagekit'
    ? 'Generated the creative with OpenAI, uploaded the JPEG to ImageKit, and persisted the ImageKit delivery URL as the Instagram publish asset.'
    : 'Generated the creative with OpenAI, rehosted the JPEG to object storage, and persisted that rehosted URL as the Instagram delivery asset.';
  const assetMetadataJson = {
    provider: 'openai',
    generation_model: String(openAiResult.request.model),
    quality: String(openAiResult.request.quality),
    size: String(openAiResult.request.size),
    style: null,
    image_prompt: String(payload.image_prompt || ''),
    revised_prompt: openAiResult.revisedPrompt,
    generated_url: storageUrl,
    delivery_url: storageUrl,
    output_format: 'jpeg',
    output_compression: Number(openAiResult.request.output_compression),
    asset_validation_note: assetValidationNote,
    override_used: false,
    source_type: 'openai_b64_rehosted',
    generated_at: new Date().toISOString(),
    image_sha256: imageSha256,
    rehost_provider: storage.mode,
  };
  if (storage.mode === 'imagekit') {
    assetMetadataJson.imagekit = {
      url_endpoint: storage.publicBaseUrl,
      upload_endpoint: storage.endpoint,
      folder: storage.folder,
      file_id: storage.fileId,
      file_path: storage.filePath,
      file_name: storage.fileName,
      thumbnail_url: storage.thumbnailUrl,
      size: storage.size,
    };
  } else {
    assetMetadataJson.storage_bucket = storage.bucket;
    assetMetadataJson.storage_endpoint = storage.endpoint;
    assetMetadataJson.storage_public_base_url = storage.publicBaseUrl;
    assetMetadataJson.storage_region = storage.region;
    assetMetadataJson.storage_object_key = storage.objectKey || objectKey;
  }

  process.stdout.write(JSON.stringify({
    content_id: contentId,
    title,
    caption_final: String(payload.caption_final ?? '').trim(),
    hashtags_final: String(payload.hashtags_final ?? '').trim(),
    asset_role: String(payload.asset_role || 'post_image').trim() || 'post_image',
    provider,
    source_url: storageUrl,
    storage_url: storageUrl,
    mime_type: 'image/jpeg',
    width: dimensions.width,
    height: dimensions.height,
    status_after_asset: 'approval_pending',
    asset_validation_note: assetValidationNote,
    workflow_name: String(payload.workflow_name || 'wf_simple_post_image_asset').trim() || 'wf_simple_post_image_asset',
    run_started_at: String(payload.run_started_at || new Date().toISOString()).trim() || new Date().toISOString(),
    generation_model: String(openAiResult.request.model),
    asset_metadata_json: assetMetadataJson,
  }));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
