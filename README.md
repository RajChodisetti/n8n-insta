# n8n-insta

Instagram-focused AI storytelling and Reel generation pipeline. The current repo has a code-first Studio/API and pipeline worker, Remotion rendering by default, Postgres-backed pipeline state, MinIO/GCS-style asset hosting, and n8n kept as a fallback orchestration path.

The normal local entrypoint is the Studio UI at `http://localhost:7780`.

## What This Runs

| Component | Purpose | Local URL |
| --- | --- | --- |
| Studio UI/API | Create ideas, choose reel type, edit settings/prompts, track pipeline runs, approve renders | `http://localhost:7780` |
| Pipeline worker | Claims queued runs from Postgres and executes stages while idle between jobs | internal only |
| Remotion renderer | Default render service for generated Reels | internal `http://remotion-renderer:8081` |
| Postgres | Content, pipeline run, step, event, asset, approval, and workflow state | host port from `infra/.env` |
| MinIO | Local object storage for generated assets | `http://localhost:42173` |
| n8n | Legacy/fallback workflow UI | `http://localhost:35678` |

## Prerequisites

- Docker Desktop or Docker Engine with Compose.
- Node.js `>=22` for local checks and non-Docker development.
- npm.
- Provider accounts/API keys only when running real generation. The UI and containers can start without most provider keys, but live pipeline stages fail when a required provider key is missing.

## Environment Files

This repo uses two env files:

| File | Template | Purpose |
| --- | --- | --- |
| `.env` | `.env.example` | Product/runtime provider settings, API keys, model choices, Instagram settings, render settings |
| `infra/.env` | `infra/.env.example` | Local Docker ports, Postgres/Redis/MinIO credentials, n8n settings, worker timing |

Create them locally:

```bash
cp .env.example .env
cp infra/.env.example infra/.env
```

Do not commit real env files, service account keys, local backups, logs, or `infra/state/`.

### Required For Local Stack Startup

In `infra/.env`, set local-only service values:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `MINIO_BUCKET`
- `N8N_ENCRYPTION_KEY`
- `N8N_BASIC_AUTH_USER`
- `N8N_BASIC_AUTH_PASSWORD`

The example file includes default high host ports:

- Studio UI defaults to host port `7780`; override `STUDIO_UI_HOST_PORT` through the Compose environment if needed.
- `N8N_HOST_PORT=35678`
- `POSTGRES_HOST_PORT=36432`
- `REDIS_HOST_PORT=36379`
- `MINIO_API_HOST_PORT=39000`
- `MINIO_CONSOLE_HOST_PORT=42173`

Important: keep `INSTAGRAM_GRAPH_API_TOKEN` only in repo-root `.env`. Do not put it in `infra/.env`, because a blank infra value can override the real token inside containers.

### Required For Real Reel Generation

The exact keys depend on reel type and provider selection.

| Area | Main env keys |
| --- | --- |
| Text/LLM stages | `OPENAI_API_KEY` or stage-specific OpenAI keys such as `TEXT_OPENAI_API_KEY`, `IDEA_INGEST_OPENAI_API_KEY`, `STORY_PACKAGE_OPENAI_API_KEY`, `DIRECTOR_OPENAI_API_KEY`, `CAPTION_OPENAI_API_KEY` |
| Text model selection | `TEXT_LLM_PROVIDER`, `TEXT_MODEL`, `IDEA_INGEST_MODEL`, `DIRECTOR_MODEL`, `RESEARCH_MODEL`, `STORY_PACKAGE_MODEL`, `STORYBOARD_MODEL`, `PROMPT_BUILDER_MODEL`, `CAPTION_MODEL` |
| Image generation | `IMAGE_GENERATION_PROVIDER`, `SCENE_IMAGE_PROVIDER`, `POST_IMAGE_PROVIDER`, `IMAGE_OPENAI_API_KEY`, `SCENE_IMAGE_OPENAI_API_KEY`, `POST_IMAGE_OPENAI_API_KEY`, `FAL_AI_API_KEY`, `SCENE_IMAGE_FAL_AI_API_KEY` |
| Video generation | `FAL_AI_API_KEY`, `SCENE_VIDEO_FAL_AI_API_KEY`, `WAN_VIDEO_MODEL`, `WAN_REFERENCE_VIDEO_MODEL`, `WAN_REFERENCE_VIDEO_FAL_AI_API_KEY` |
| Narration/TTS | `TTS_PROVIDER`, `NARRATION_PROVIDER`, `FISH_AUDIO_API_KEY`, `NARRATION_FISH_AUDIO_API_KEY`, `SMALLEST_AI_API_KEY`, `NARRATION_SMALLEST_AI_API_KEY`, `NARRATION_OPENAI_API_KEY` |
| Avatar video | `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `HEYGEN_VOICE_ID`, optional `HEYGEN_CALLBACK_URL`, `HEYGEN_AVATAR_CONSENT_RECORD_URI` |
| Asset hosting | `ASSET_HOST_PROVIDER`, `REELS_STORAGE_PUBLIC_BASE_URL`, `GOOGLE_CLOUD_STORAGE_BUCKET`, `GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH`, `GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL` |
| Instagram publish | `INSTAGRAM_GRAPH_API_TOKEN`, `INSTAGRAM_IG_USER_ID`, `INSTAGRAM_PUBLISH_ENABLED` |

Provider selection is adapter-first where implemented. For example:

```bash
TEXT_LLM_PROVIDER=openai
TEXT_MODEL=gpt-4.1-mini
STORY_PACKAGE_MODEL=gpt-4.1

SCENE_IMAGE_PROVIDER=fal_ai
SCENE_VIDEO_FAL_AI_API_KEY=...

NARRATION_PROVIDER=fish_audio
FISH_AUDIO_API_KEY=...
```

If a stage-specific key is blank, the code falls back to the broader provider key where supported. If no usable key exists, that stage should fail with a visible error instead of silently using another account.

## Reel Types

Studio and the API support:

| Reel type | Pipeline behavior |
| --- | --- |
| `image` | Story package, still image asset generation, narration, Remotion manifest, Remotion render, captions/hashtags, final QA approval gate |
| `video` | Story package, Fal/Wan scene video asset generation, narration, Remotion manifest, Remotion render, captions/hashtags, final QA approval gate |
| `avatar` | Story package, avatar consent gate, HeyGen avatar video generation, Remotion manifest, Remotion render, captions/hashtags, final QA approval gate |

`DEFAULT_REEL_TYPE=video` keeps backward compatibility. Avatar runs require HeyGen env plus valid consent/account policy metadata before provider calls.

## Install And Check

```bash
cd /Users/rajchodisetti/n8n-insta
npm install
npm run check
```

`npm run check` is a syntax and contract check. It is not a full linter or typechecker.

## Run The Full Local Stack

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
```

Open:

- Studio UI: `http://localhost:7780`
- n8n fallback UI: `http://localhost:35678`
- MinIO console: `http://localhost:42173`

Health checks:

```bash
curl http://localhost:7780/api/health
curl http://localhost:7780/api/workflows
curl http://localhost:7780/api/pipeline-runs
```

Service logs:

```bash
docker logs -f n8n-insta-studio-api
docker logs -f n8n-insta-pipeline-worker
docker logs -f n8n-insta-remotion-renderer
docker logs -f n8n-insta-postgres
```

Stop the stack:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down
```

## Use The Studio UI

1. Open `http://localhost:7780`.
2. In **Create**, use **Fast Path**.
3. Enter an idea.
4. Choose **Image Reel**, **Video Reel**, or **Avatar Video**.
5. Optionally upload a character reference image if the UI asks for it.
6. Start the run.
7. Watch **Pipeline -> Recent Items**.
8. Inspect cost/status with the row actions.
9. When the run reaches `awaiting_approval` and the render is successful, click **Approve** only after reviewing the output.

Publishing is intentionally separate and approval-gated. Do not enable or run live Instagram publish unless the selected render, target account, and token are verified.

## API Shortcuts

Create a code-first pipeline run from Studio/API:

```bash
curl -X POST http://localhost:7780/api/pipeline-runs \
  -H 'Content-Type: application/json' \
  -d '{"content_id":"CONTENT_ID","requested_action":"generate_reel","reel_type":"video","requested_by":"local"}'
```

Check a run:

```bash
curl http://localhost:7780/api/pipeline-runs/PIPELINE_RUN_ID
```

Inject an abstract idea:

```bash
curl -X POST http://localhost:7780/webhooks/abstract-idea \
  -H 'Content-Type: application/json' \
  -d '{"abstract_idea":"A concise idea for a short educational Reel","reel_type":"video"}'
```

## Rendering Defaults

Remotion is the default renderer:

```bash
RENDER_PROVIDER=remotion
RENDER_WORKER_SYNC_URL=http://remotion-renderer:8081/render-sync
FFMPEG_RENDER_FALLBACK_ENABLED=false
REMOTION_RENDER_STUB=false
```

Set `REMOTION_RENDER_STUB=true` only for offline/smoke checks where you do not want a real render. The FFmpeg render worker remains in the repo as a rollback fallback.

## Validation Commands

General checks:

```bash
npm run check
docker compose --env-file infra/.env -f infra/docker-compose.yml config --quiet
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "\\dt"
```

Offline contract regression:

```bash
node scripts/validate_ai_video_contract_regressions.mjs
```

Targeted smoke scripts exist under `scripts/test_phase*.sh`. Many smoke scripts require the Docker stack, mutate local DB rows, and may call paid provider APIs depending on env. Run them intentionally.

## Commands Not To Run Casually

These can mutate live/local state, refresh tokens, upload assets, call paid APIs, or publish:

```bash
bash scripts/prepare_phase2_live_post_candidate.sh
bash scripts/prepare_phase3_live_reel_candidate.sh
bash scripts/exchange_instagram_long_lived_token.sh
bash scripts/auto_refresh_instagram_token.sh
bash scripts/check_instagram_permissions.sh
node scripts/upload_music_to_gcs.mjs
```

## Troubleshooting

If the UI does not load:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
docker logs n8n-insta-studio-api --tail 100
```

If runs stay queued:

```bash
docker logs n8n-insta-pipeline-worker --tail 150
curl http://localhost:7780/api/pipeline-runs
```

If rendering fails:

```bash
docker logs n8n-insta-remotion-renderer --tail 150
curl http://localhost:7780/api/health
```

If schema changes do not appear, remember that existing `infra/state/postgres` data means Docker init SQL may not re-run automatically. Do not manually edit `infra/state/` as source.

## Documentation

- [Agent context](AGENTS.md)
- [Documentation index](docs/README.md)
- [AI context system](docs/ai-context/README.md)
- [Commands and validation](docs/ai-context/commands-and-validation.md)
- [Studio UI runbook](docs/runbooks/studio-ui.md)
- [AI video integration prerequisites](docs/runbooks/ai-video-integration-prerequisites.md)
- [Prompt/model/voice tuning](docs/runbooks/prompt-model-and-voice-tuning.md)
- [Provider strategy](docs/integrations/provider-strategy.md)

## Safety Notes

- Do not commit `.env`, `infra/.env`, `.env.bak.*`, `sa-key.json`, `infra/state/`, logs, caches, or generated runtime files.
- Do not expose secret values in docs, UI text, logs, screenshots, or chat.
- Do not use a real person’s likeness or voice without consent metadata.
- Do not run live publish without explicit approval and verified Instagram account matching.
- Do not delete n8n workflow exports until code-first parity is proven and documented.
