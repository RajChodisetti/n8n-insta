# 27 — Google Cloud Storage Asset-Host Runbook

This runbook covers the GCS-backed asset-host path used by the pipeline for:

- scene images
- narration audio
- post images
- rendered Reel MP4 output

The implementation uses a dedicated `google_cloud_storage` asset-host adapter and uploads objects through the Google Cloud Storage JSON API using a mounted service-account JSON key.

## What This Adapter Expects

The adapter uses:

- a public GCS bucket for delivery
- a mounted Google Cloud service-account JSON key
- direct public object URLs in the form:
  `https://storage.googleapis.com/<bucket>/<object-key>`

Why this path:

- Meta can fetch a normal public object URL more reliably than Google Drive sharing links
- the same upload model works for JPG, MP3, and MP4 artifacts
- the runtime mints short-lived OAuth access tokens directly from the service-account key

## Required `.env` Values

```env
ASSET_HOST_PROVIDER=google_cloud_storage
SCENE_IMAGE_HOST_PROVIDER=google_cloud_storage
POST_IMAGE_HOST_PROVIDER=google_cloud_storage
NARRATION_HOST_PROVIDER=google_cloud_storage
RENDER_OUTPUT_HOST_PROVIDER=google_cloud_storage

GOOGLE_CLOUD_STORAGE_BUCKET=
GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH=/secrets/google/sa-key.json
GOOGLE_CLOUD_STORAGE_ENDPOINT=https://storage.googleapis.com
GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL=https://storage.googleapis.com
```

Notes:

- `GOOGLE_CLOUD_STORAGE_BUCKET` should be the bucket name only
- `GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH` should point at the mounted key inside the container
- `GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL` should usually remain `https://storage.googleapis.com`
- the bucket or relevant object path must be publicly readable if Meta needs to ingest the asset

## Google Cloud Setup

1. Create or select a GCP project.
2. Create a Cloud Storage bucket intended for public media delivery.
3. Enable public object access in the way your project policy allows.
4. Create or select a service account with bucket write access.
5. Download the service-account JSON key and save it in the repo root as `sa-key.json`.
6. Put the bucket name into `.env` as:
   - `GOOGLE_CLOUD_STORAGE_BUCKET`
7. Keep the default mounted key path:
   - `GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH=/secrets/google/sa-key.json`

Official references:

- public object access:
  https://docs.cloud.google.com/storage/docs/access-public-data
- signed URLs:
  https://docs.cloud.google.com/storage/docs/access-control/signed-urls
- service accounts:
  https://cloud.google.com/iam/docs/service-account-overview
- Cloud Storage JSON API:
  https://cloud.google.com/storage/docs/json_api

## Restart Runtime

After changing `.env`, recreate:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build --force-recreate n8n render-worker studio-ui
```

## First Validation

Start with scene-image upload:

```bash
bash scripts/test_phase3_scene_asset_generation_smoke.sh
```

If you want to keep the generated fixture rows for inspection:

```bash
KEEP_FIXTURES=true bash scripts/test_phase3_scene_asset_generation_smoke.sh
```

Then verify the latest scene-image rows:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select a.provider, a.storage_url, a.metadata_json->'google_cloud_storage'->>'bucket' as bucket, a.metadata_json->'google_cloud_storage'->>'object_key' as object_key from assets a where a.asset_role = 'scene_image' order by a.created_at desc limit 3;"
```

Expected:

- `provider` ends with `_google_cloud_storage`
- `storage_url` starts with `https://storage.googleapis.com/`
- `metadata_json.google_cloud_storage.bucket` is present
- `metadata_json.google_cloud_storage.object_key` is present

## Full Pipeline Use

Once scene-image upload works, the same adapter path will also handle:

- narration MP3 upload
- single-post JPEG upload
- final Reel MP4 upload

You can then run the one-click workflow:

```bash
docker exec n8n-insta node /workflows/scripts/run_resume_aware_reel_pipeline.mjs --plan-only
```

or launch:

- `wf_end_to_end_reel_generate_and_publish`

from the Studio UI or n8n.

## Failure Modes

Typical configuration failures:

- missing `GOOGLE_CLOUD_STORAGE_BUCKET`
- missing or unreadable service-account key file
- bucket/object URL is not publicly reachable
- bucket policy blocks anonymous reads even though upload succeeds

The adapter now fails explicitly with provider-specific errors such as:

- `Google Cloud Storage upload request failed ...`
- `Google Cloud Storage upload failed (...)`

## Rollback

If you need to fall back temporarily to the generic object-storage adapter:

```env
ASSET_HOST_PROVIDER=object_storage
SCENE_IMAGE_HOST_PROVIDER=object_storage
POST_IMAGE_HOST_PROVIDER=object_storage
NARRATION_HOST_PROVIDER=object_storage
RENDER_OUTPUT_HOST_PROVIDER=object_storage
```

Then recreate runtime again.
