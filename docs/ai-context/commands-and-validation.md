# Commands and Validation

Last reviewed: 2026-06-21 at git commit `0d0515b`.

Commands below come from `package.json`, README/runbooks, Docker files, and scripts present in the repo. No Makefile, pyproject, or CI workflow was found.

## Install/setup

```bash
cp infra/.env.example infra/.env
npm install
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

The FFmpeg fallback render worker image installs Python dependencies from `infra/render-worker/requirements.txt` during Docker build. The default Remotion renderer uses root `package.json` dependencies and `infra/remotion-renderer/Dockerfile`.

## Dev/start

```bash
bash scripts/start.sh
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis minio minio-bootstrap remotion-renderer studio-ui pipeline-worker
```

Default local URLs from docs:

- n8n: `http://localhost:35678`
- Studio UI: `http://localhost:7780`
- MinIO console: `http://localhost:42173`

## Build/recreate

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build --force-recreate studio-ui pipeline-worker remotion-renderer
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate studio-ui pipeline-worker remotion-renderer
```

Use recreate commands after `.env` changes that affect `studio-ui`, `pipeline-worker`, `remotion-renderer`, `render-worker`, or legacy `n8n`.

## Smoke tests

These require a running local stack and may call configured provider APIs.

```bash
bash scripts/test_mvp08_smoke.sh
bash scripts/test_phase2_topic_to_storyboard_smoke.sh
bash scripts/test_phase2_caption_iteration_smoke.sh
bash scripts/test_phase2_hashtag_ranking_smoke.sh
bash scripts/test_phase3_scene_asset_generation_smoke.sh
bash scripts/test_phase3_narration_generation_smoke.sh
bash scripts/test_phase3_render_manifest_smoke.sh
bash scripts/test_phase3_render_worker_dispatch_smoke.sh
bash scripts/test_phase3_render_status_callback_smoke.sh
bash scripts/test_phase4_metrics_collection_smoke.sh
```

Most smoke scripts:

- require clear queue rows before running
- import/sync n8n workflow exports
- require the n8n Postgres credential name, default `Postgres account`
- seed temporary content rows
- clean fixtures unless `KEEP_FIXTURES=true`

## Targeted validation by area

| Area | Command |
| --- | --- |
| Infra up | `docker compose --env-file infra/.env -f infra/docker-compose.yml ps` |
| Node syntax/import check | `npm run check && node -e "await import('./pipeline/db.mjs'); await import('./pipeline/schema.mjs'); await import('./pipeline/runs.mjs'); await import('./pipeline/stages.mjs'); console.log('pipeline imports ok')"` |
| Remotion bundle check | `node -e "import { bundle } from '@remotion/bundler'; const serveUrl = await bundle({entryPoint: 'infra/remotion-renderer/src/index.jsx', webpackOverride: (config) => ({...config, optimization: {...(config.optimization || {}), concatenateModules: false}})}); console.log(serveUrl ? 'remotion bundle ok' : 'remotion bundle missing');"` |
| Compose config | `docker compose --env-file infra/.env -f infra/docker-compose.yml config --quiet` |
| DB tables | `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "\\dt"` |
| Research/storyboard | `bash scripts/test_phase2_topic_to_storyboard_smoke.sh` |
| Caption/hashtags | `bash scripts/test_phase2_caption_iteration_smoke.sh` |
| Scene assets | `bash scripts/test_phase3_scene_asset_generation_smoke.sh` |
| Narration | `bash scripts/test_phase3_narration_generation_smoke.sh` |
| Render manifest | `bash scripts/test_phase3_render_manifest_smoke.sh` |
| Render dispatch | `bash scripts/test_phase3_render_worker_dispatch_smoke.sh` |
| Render callback | `bash scripts/test_phase3_render_status_callback_smoke.sh` |
| Metrics | `bash scripts/test_phase4_metrics_collection_smoke.sh` |
| Instagram token/account | `bash scripts/check_instagram_permissions.sh` |
| Context manifest | `jq empty docs/ai-context/context-manifest.json` |
| AI video fixtures | `find fixtures/ai-video -name '*.json' -print0 \| xargs -0 -n1 jq empty` |
| AI video contract regression suite | `node scripts/validate_ai_video_contract_regressions.mjs` |
| Prompt rule registry | `jq empty prompts/rules/rule_registry.json` |
| Style pack registry | `jq empty prompts/style_packs/style_pack_registry.json && jq empty prompts/schemas/style_pack.schema.json` |
| Story package v2 contract | `jq empty prompts/schemas/story_package.schema.json && find prompts/examples -name '*.json' -print0 \| xargs -0 -n1 jq empty` |
| Story package v2 prompt build | `node workflows/scripts/build_prompt_request.mjs story_package_generation_v2 "$PAYLOAD_BASE64" > /tmp/story-package-v2-request.json` |
| Story package v2 compatibility helper | `node --check workflows/scripts/story_package_v2_compat.mjs` |
| Director contract schema | `jq empty prompts/schemas/director_contract.schema.json` |
| Director contract fixture | `node scripts/validate_director_contract_fixture.mjs fixtures/ai-video/founder_explainer/expected_director_contract.json` |
| Director invalid style fixture | `node scripts/validate_director_contract_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_director_contract_bad_style_pack.json` |
| Storyboard shot-plan schema | `jq empty prompts/schemas/storyboard.schema.json` |
| Storyboard shot-plan fixture | `node scripts/validate_storyboard_fixture.mjs fixtures/ai-video/founder_explainer/expected_storyboard_and_shot_plan.json` |
| Visual prompt schema | `jq empty prompts/schemas/visual_prompt.schema.json` |
| Visual prompt fixture | `node scripts/validate_visual_prompt_fixture.mjs fixtures/ai-video/founder_explainer/expected_visual_prompt_builder.json` |
| Visual prompt vague fixture | `node scripts/validate_visual_prompt_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_vague.json` |
| Visual prompt missing negative prompt fixture | `node scripts/validate_visual_prompt_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_visual_prompt_builder_missing_negative_prompt.json` |
| Voice performance schema | `jq empty prompts/schemas/voice_performance.schema.json` |
| Voice performance fixture | `node scripts/validate_voice_performance_fixture.mjs fixtures/ai-video/founder_explainer/expected_voice_performance_script.json` |
| Voice performance mutated-text fixture | `node scripts/validate_voice_performance_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_voice_performance_script_mutated_text.json` |
| Music/SFX plan schema | `jq empty prompts/schemas/music_sfx_plan.schema.json` |
| Music asset schema | `jq empty prompts/schemas/music_asset.schema.json` |
| SFX asset schema | `jq empty prompts/schemas/sfx_asset.schema.json` |
| Music/SFX plan fixture | `node scripts/validate_music_sfx_fixture.mjs fixtures/ai-video/founder_explainer/expected_music_sfx_plan.json` |
| Music/SFX unknown-license fixture | `node scripts/validate_music_sfx_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_music_sfx_plan_unknown_license.json` |
| Music catalog license metadata | `node scripts/validate_music_library.mjs workflows/assets/music/library.json` |
| Final QA schema | `jq empty prompts/schemas/qa_result.schema.json` |
| Final QA approved fixture | `node scripts/validate_final_qa_fixture.mjs --expect-approved fixtures/ai-video/founder_explainer/expected_final_qa_result_pass.json` |
| Final QA failed license fixture | `node scripts/validate_final_qa_fixture.mjs --expect-blocked fixtures/ai-video/founder_explainer/failed_final_qa_license.json` |
| Final QA failed avatar consent fixture | `node scripts/validate_final_qa_fixture.mjs --expect-blocked fixtures/ai-video/founder_explainer/failed_final_qa_avatar_consent.json` |
| Final QA failed caption/export fixture | `node scripts/validate_final_qa_fixture.mjs --expect-blocked fixtures/ai-video/founder_explainer/failed_final_qa_caption_export.json` |
| Approval schema | `jq empty prompts/schemas/approval.schema.json` |
| Approval approved Reel fixture | `node scripts/validate_approval_fixture.mjs --expected-platform-account-id 17841400000000000 fixtures/ai-video/founder_explainer/expected_publish_approval_reel.json` |
| Approval publish-ready Reel fixture | `node scripts/validate_approval_fixture.mjs --expect-publish-ready --expected-platform-account-id 17841400000000000 fixtures/ai-video/founder_explainer/expected_publish_approval_reel.json` |
| Approval missing selected video fixture | `node scripts/validate_approval_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_publish_approval_missing_selected_video.json` |
| Approval account mismatch fixture | `node scripts/validate_approval_fixture.mjs --expect-fail --expected-platform-account-id 17841400000000000 fixtures/ai-video/founder_explainer/invalid_publish_approval_account_mismatch.json` |
| Approval unapproved render fixture | `node scripts/validate_approval_fixture.mjs --expect-fail --expect-publish-ready fixtures/ai-video/founder_explainer/invalid_publish_approval_unapproved_render.json` |
| Client/account context schema | `jq empty prompts/schemas/client_account_context.schema.json` |
| Client/account context fixture | `node scripts/validate_client_account_context_fixture.mjs fixtures/ai-video/founder_explainer/expected_client_account_context.json` |
| Client/account safety override fixture | `node scripts/validate_client_account_context_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_client_account_context_safety_override.json` |
| Client/account style conflict fixture | `node scripts/validate_client_account_context_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_client_account_context_style_conflict.json` |
| Model provider route schema | `jq empty prompts/schemas/model_route.schema.json` |
| Model provider route fixture | `node scripts/validate_model_route_fixture.mjs fixtures/ai-video/founder_explainer/expected_model_provider_route.json` |
| Model provider runtime-change fixture | `node scripts/validate_model_route_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_model_provider_route_runtime_change.json` |
| Model provider boundary-mismatch fixture | `node scripts/validate_model_route_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_model_provider_route_boundary_mismatch.json` |
| Render manifest v2 schema | `jq empty prompts/schemas/render_manifest_v2.schema.json` |
| Render manifest v2 fixture | `node scripts/validate_render_manifest_v2_fixture.mjs fixtures/ai-video/founder_explainer/expected_render_manifest_v2.json` |
| Render manifest v2 renderer-replacement fixture | `node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_renderer_replacement.json` |
| Render manifest v2 timeline-gap fixture | `node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_timeline_gap.json` |
| Remotion edit-plan schema | `jq empty prompts/schemas/remotion_edit_plan.schema.json` |
| Remotion edit-plan fixture | `node scripts/validate_remotion_edit_plan_fixture.mjs fixtures/ai-video/founder_explainer/expected_remotion_edit_plan.json` |
| Remotion edit-plan runtime-install fixture | `node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_runtime_install.json` |
| Remotion edit-plan frame-gap fixture | `node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_frame_gap.json` |
| Avatar decision schemas | `jq empty prompts/schemas/avatar_decision.schema.json prompts/schemas/presenter_profile.schema.json` |
| Avatar decision fixture | `node scripts/validate_avatar_decision_fixture.mjs fixtures/ai-video/avatar_sales_outreach/expected_avatar_decision.json` |
| Avatar decision missing-consent fixture | `node scripts/validate_avatar_decision_fixture.mjs --expect-fail fixtures/ai-video/avatar_sales_outreach/invalid_avatar_decision_missing_consent.json` |
| Publish gate workflow checks | `node scripts/validate_publish_gate_workflow.mjs` |

## Lint/typecheck/format

No dedicated lint, typecheck, or format command was discovered. `npm run check` is a syntax check, not a linter or typecheck.

## Commands not to run casually

These can call paid APIs, mutate live/local state, publish, refresh tokens, or upload assets:

```bash
bash scripts/prepare_phase2_live_post_candidate.sh
bash scripts/prepare_phase3_live_reel_candidate.sh
bash scripts/exchange_instagram_long_lived_token.sh
bash scripts/auto_refresh_instagram_token.sh
bash scripts/check_instagram_permissions.sh
node scripts/upload_music_to_gcs.mjs
docker exec n8n-insta node /workflows/scripts/run_resume_aware_reel_pipeline.mjs --plan-only
```

Run live publish or token commands only when the user explicitly requests them.

## Environment variables

Do not expose values. Key groups discovered from examples and code:

- AI/model: `OPENAI_API_KEY`, `LLL_API_KEY`, `TEXT_OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TEXT_ANTHROPIC_API_KEY`, `TEXT_LLM_PROVIDER`, `CAPTION_LLM_PROVIDER`, `FINAL_QA_LLM_PROVIDER`, `TEXT_MODEL`, `OPENAI_TEXT_MODEL`, `TEXT_ANTHROPIC_MODEL`, `ANTHROPIC_TEXT_MODEL`, `ANTHROPIC_MODEL`, `CAPTION_MODEL`, `CAPTION_ANTHROPIC_MODEL`, `FINAL_QA_MODEL`, `FINAL_QA_ANTHROPIC_MODEL`, `ANTHROPIC_VERSION`, `ANTHROPIC_MAX_TOKENS`, `STORY_PACKAGE_GENERATION_STAGE`, `STORY_PACKAGE_STAGE`
- Image/video: `IMAGE_GENERATION_PROVIDER`, `SCENE_IMAGE_PROVIDER`, `POST_IMAGE_PROVIDER`, `IMAGE_OPENAI_API_KEY`, `SCENE_IMAGE_OPENAI_API_KEY`, `IMAGE_FAL_AI_API_KEY`, `SCENE_IMAGE_FAL_AI_API_KEY`, `SCENE_VIDEO_FAL_AI_API_KEY`, `FAL_AI_API_KEY`, `VEO_VIDEO_MODEL`, `VEO_REFERENCE_VIDEO_MODEL`, `VEO_VIDEO_RESOLUTION`, `VEO_VIDEO_DURATION_SECONDS`, `VEO_GENERATE_AUDIO`, `VEO_AUTO_FIX`, `VEO_SAFETY_TOLERANCE`, plus legacy `WAN_*`/`SEEDDANCE_*` fallbacks
- TTS: `NARRATION_PROVIDER`, `TTS_PROVIDER`, `OPENAI_TTS_MODEL`, `NARRATION_OPENAI_API_KEY`, `TTS_OPENAI_API_KEY`, `FISH_AUDIO_API_KEY`, `NARRATION_FISH_AUDIO_API_KEY`, `SMALLEST_AI_API_KEY`, `NARRATION_SMALLEST_AI_API_KEY`
- Hosting: `ASSET_HOST_PROVIDER`, `REELS_STORAGE_*`, `GOOGLE_CLOUD_STORAGE_*`
- Reel selection/render: `DEFAULT_REEL_TYPE`, `RENDER_PROVIDER`, `RENDER_WORKER_MODE`, `RENDER_WORKER_URL`, `RENDER_WORKER_SYNC_URL`, `RENDER_CALLBACK_URL`, `REMOTION_RENDER_STUB`, `FFMPEG_RENDER_FALLBACK_ENABLED`
- Avatar/HeyGen: `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `HEYGEN_VOICE_ID`, `HEYGEN_CALLBACK_URL`, `HEYGEN_POLL_INTERVAL_SECONDS`, `HEYGEN_TIMEOUT_SECONDS`, `STUDIO_AVATAR_ALLOWED`, `STUDIO_AVATAR_CONSENT_STATUS`, `HEYGEN_AVATAR_CONSENT_RECORD_URI`
- Video fallback control: `ALLOW_VIDEO_TO_IMAGE_FALLBACK=false` keeps video reels from silently degrading into still images when provider video generation fails.
- Instagram: `INSTAGRAM_GRAPH_API_TOKEN`, `GRAPH_API_VERSION`, `INSTAGRAM_PUBLISH_ENABLED`, `INSTAGRAM_INSIGHTS_COLLECTION_MODE`
- Infra: `POSTGRES_*`, `REDIS_*`, `MINIO_*`, `N8N_*`, `WEBHOOK_URL`
- Studio UI: `STUDIO_UI_HOST_PORT`, `STUDIO_UI_PORT`, `STUDIO_TOPIC_TARGET_DURATION_*`

Infra README specifically warns to keep `INSTAGRAM_GRAPH_API_TOKEN` in repo-root `.env`, not `infra/.env`.
