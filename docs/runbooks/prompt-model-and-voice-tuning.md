# 23 — Prompt, Model, Voice, and Adapter Tuning Runbook

Use this runbook when you want to test changes to:

- prompt wording
- provider selection
- model selection
- narration voice selection

This is the practical tuning guide for the current repo. The inventory of all prompt files and model call counts is in [21 — Prompt Reference and Model Call Map](/Users/rajchodisetti/n8n-insta/docs/prompts/prompt-reference-and-model-call-map.md).
The adapter architecture and extension points are documented in [24 — Adapter Architecture and Provider Switching](/Users/rajchodisetti/n8n-insta/docs/architecture/adapter-architecture-and-provider-switching.md).

## What Changes Require What

Prompt file edits:

- edit files under [prompts/](/Users/rajchodisetti/n8n-insta/prompts/README.md)
- no container recreate is needed
- the next workflow run reads the updated prompt file directly from `/prompts`
- the Studio UI `Prompt Editor` writes those same files, so prompt saves in the browser are live on the next run
- the Studio UI `Prompt Builder` can preview a runtime rewrite for a selected Markdown prompt while preserving its existing placeholders and locked rules
- enabling the runtime prompt builder writes `prompts/.runtime-prompt-builder.json`, which changes live workflow prompt wording at execution time without modifying the saved prompt templates
- abstract idea ingest also generates a per-content prompt profile through `prompts/idea_prompt_profile/*`; that profile changes downstream placeholder values at runtime without editing prompt templates

Provider, model, or voice env changes:

- edit the repo-root `.env`
- recreate `n8n` so the new env values are loaded
- command:
  `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n`

Render worker recreate:

- not required for prompt, text-model, image-model, or TTS-voice changes
- only recreate `render-worker` if you changed render-worker code or render-worker env behavior

## Current Tuning Knobs

### Prompt Files

Research and script:

- [prompts/research_and_script/system.md](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/system.md)
- [prompts/research_and_script/user.md](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/user.md)
- [prompts/research_and_script/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/response-schema.json)

Storyboard:

- [prompts/storyboard_and_prompts/system.md](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/system.md)
- [prompts/storyboard_and_prompts/user.md](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/user.md)
- [prompts/storyboard_and_prompts/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/response-schema.json)

Caption and hashtags:

- [prompts/caption_and_hashtags/system.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/system.md)
- [prompts/caption_and_hashtags/user.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/user.md)
- [prompts/caption_and_hashtags/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/response-schema.json)

Scene image generation:

- [prompts/scene_asset_generation/prompt.md](/Users/rajchodisetti/n8n-insta/prompts/scene_asset_generation/prompt.md)

Narration generation:

- [prompts/narration_generation/instructions.md](/Users/rajchodisetti/n8n-insta/prompts/narration_generation/instructions.md)

Simple post image generation:

- [prompts/post_image_generation/prompt.md](/Users/rajchodisetti/n8n-insta/prompts/post_image_generation/prompt.md)

Studio prompt builder helper:

- [prompts/prompt_builder/system.md](/Users/rajchodisetti/n8n-insta/prompts/prompt_builder/system.md)
- [prompts/prompt_builder/user.md](/Users/rajchodisetti/n8n-insta/prompts/prompt_builder/user.md)
- [prompts/prompt_builder/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/prompt_builder/response-schema.json)

Abstract-idea prompt profile builder:

- [prompts/idea_prompt_profile/system.md](/Users/rajchodisetti/n8n-insta/prompts/idea_prompt_profile/system.md)
- [prompts/idea_prompt_profile/user.md](/Users/rajchodisetti/n8n-insta/prompts/idea_prompt_profile/user.md)
- [prompts/idea_prompt_profile/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/idea_prompt_profile/response-schema.json)

## Current Provider, Model, and Voice Env Vars

Provider selectors:

- `TEXT_LLM_PROVIDER`
- `PROMPT_BUILDER_LLM_PROVIDER`
- `RESEARCH_LLM_PROVIDER`
- `STORYBOARD_LLM_PROVIDER`
- `CAPTION_LLM_PROVIDER`
- `IMAGE_GENERATION_PROVIDER`
- `SCENE_IMAGE_PROVIDER`
- `POST_IMAGE_PROVIDER`
- `TTS_PROVIDER`
- `NARRATION_PROVIDER`
- `ASSET_HOST_PROVIDER`
- `SCENE_IMAGE_HOST_PROVIDER`
- `POST_IMAGE_HOST_PROVIDER`
- `NARRATION_HOST_PROVIDER`
- `RENDER_OUTPUT_HOST_PROVIDER`
- `RENDER_PROVIDER`

Generic text model selectors:

- `TEXT_MODEL`
- `PROMPT_BUILDER_MODEL`
- `RESEARCH_MODEL`
- `STORYBOARD_MODEL`
- `CAPTION_MODEL`

Legacy OpenAI text fallbacks:

- `OPENAI_TEXT_MODEL`
- `OPENAI_RESEARCH_MODEL`
- `OPENAI_STORYBOARD_MODEL`
- `OPENAI_CAPTION_MODEL`

Generic image model settings:

- `IMAGE_MODEL`
- `IMAGE_SIZE`
- `IMAGE_QUALITY`
- `IMAGE_COMPRESSION`
- `IMAGE_STYLE`
- `SCENE_IMAGE_MODEL`
- `SCENE_IMAGE_SIZE`
- `SCENE_IMAGE_QUALITY`
- `SCENE_IMAGE_COMPRESSION`
- `POST_IMAGE_MODEL`
- `POST_IMAGE_SIZE`
- `POST_IMAGE_QUALITY`
- `POST_IMAGE_COMPRESSION`
- `POST_IMAGE_STYLE`

Legacy OpenAI image fallbacks:

- `OPENAI_IMAGE_MODEL`
- `OPENAI_IMAGE_SIZE`
- `OPENAI_IMAGE_QUALITY`
- `OPENAI_IMAGE_COMPRESSION`
- `OPENAI_IMAGE_STYLE`
- `OPENAI_SCENE_IMAGE_MODEL`
- `OPENAI_SCENE_IMAGE_SIZE`
- `OPENAI_SCENE_IMAGE_QUALITY`
- `OPENAI_SCENE_IMAGE_COMPRESSION`

Generic narration settings:

- `TTS_MODEL`
- `NARRATION_MODEL`
- `TTS_VOICE`
- `NARRATION_VOICE`
- `TTS_INSTRUCTIONS`
- `NARRATION_INSTRUCTIONS`
- `CONTENT_LANGUAGE`
- `NARRATION_LANGUAGE`
- `NARRATION_TIMING_GUIDANCE`

Legacy OpenAI narration fallbacks:

- `OPENAI_TTS_MODEL`
- `OPENAI_TTS_VOICE`
- `OPENAI_TTS_INSTRUCTIONS`

Current documented voice choices already used in the repo:

- `onyx` as the primary narrator voice
- `echo` as the documented backup voice

Note:

- the workflow code will accept other OpenAI-supported voices if the upstream API accepts them, but the repo’s current documented baseline is `onyx`, with `echo` as the fallback
- narration prompt changes now always participate in the final TTS instructions bundle; env instruction fields are appended after the file-backed prompt instead of replacing it

## Safe Testing Rule

Change one variable at a time.

Good:

- prompt only
- model only
- voice only

Avoid:

- changing prompt text, model, and voice together on the same run

If you do that, you will not know which change caused the quality difference.

## Recommended Test Matrix

### Research and storyboard prompt tuning

Use when changing:

- `prompts/research_and_script/*`
- `prompts/storyboard_and_prompts/*`
- `RESEARCH_LLM_PROVIDER`
- `STORYBOARD_LLM_PROVIDER`
- `RESEARCH_MODEL`
- `STORYBOARD_MODEL`
- `TEXT_MODEL`
- legacy `OPENAI_RESEARCH_MODEL`
- legacy `OPENAI_STORYBOARD_MODEL`
- legacy `OPENAI_TEXT_MODEL`

Run:

```bash
bash scripts/test_phase2_topic_to_storyboard_smoke.sh
```

Verify:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select workflow_name, run_status, details_json->>'generation_model' as generation_model, started_at from workflow_runs where workflow_name in ('wf_research_and_script','wf_storyboard_and_prompts') order by started_at desc limit 6;"
```

Pass signal:

- smoke test exits successfully
- latest research and storyboard runs are `success`
- output still reaches `storyboard_complete`

### Caption and hashtag prompt tuning

Use when changing:

- `prompts/caption_and_hashtags/*`
- `CAPTION_LLM_PROVIDER`
- `CAPTION_MODEL`
- `TEXT_MODEL`
- legacy `OPENAI_CAPTION_MODEL`
- legacy `OPENAI_TEXT_MODEL`

Run:

```bash
bash scripts/test_phase2_caption_iteration_smoke.sh
```

Verify:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select workflow_name, run_status, details_json->>'generation_model' as generation_model, details_json->>'selection_rationale' as selection_rationale, started_at from workflow_runs where workflow_name = 'wf_caption_and_hashtags' order by started_at desc limit 3;"
```

Pass signal:

- caption smoke exits successfully
- `caption_final` and `hashtags_final` are still populated

### Scene image prompt or scene image model tuning

Use when changing:

- `prompts/scene_asset_generation/prompt.md`
- `SCENE_IMAGE_PROVIDER`
- `SCENE_IMAGE_MODEL`
- `SCENE_IMAGE_SIZE`
- `SCENE_IMAGE_QUALITY`
- `SCENE_IMAGE_COMPRESSION`
- `IMAGE_MODEL` as the fallback when `SCENE_IMAGE_MODEL` is empty
- legacy `OPENAI_SCENE_IMAGE_MODEL`
- legacy `OPENAI_SCENE_IMAGE_SIZE`
- legacy `OPENAI_SCENE_IMAGE_QUALITY`
- legacy `OPENAI_SCENE_IMAGE_COMPRESSION`
- legacy `OPENAI_IMAGE_MODEL`

Run:

```bash
bash scripts/test_phase3_scene_asset_generation_smoke.sh
```

Inspect assets directly:

```bash
KEEP_FIXTURES=true bash scripts/test_phase3_scene_asset_generation_smoke.sh
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, a.provider, a.storage_url, a.mime_type, a.metadata_json->>'scene_number' as scene_number from content_items ci join assets a on a.content_id = ci.content_id and a.asset_role = 'scene_image' where ci.slug like 'tmp-phase3-scene-assets-%' order by ci.created_at desc, a.created_at asc limit 8;"
```

Pass signal:

- smoke test exits successfully
- `scene_image` assets are written
- the rendered prompt still produces usable vertical scene frames

### Narration instruction, TTS model, or voice tuning

Use when changing:

- `prompts/narration_generation/instructions.md`
- `NARRATION_PROVIDER`
- `NARRATION_MODEL`
- `NARRATION_VOICE`
- `NARRATION_INSTRUCTIONS`
- `TTS_MODEL`
- `TTS_VOICE`
- `TTS_INSTRUCTIONS`
- legacy `OPENAI_TTS_MODEL`
- legacy `OPENAI_TTS_VOICE`
- legacy `OPENAI_TTS_INSTRUCTIONS`

Run:

```bash
bash scripts/test_phase3_narration_generation_smoke.sh
```

Inspect the output:

```bash
KEEP_FIXTURES=true bash scripts/test_phase3_narration_generation_smoke.sh
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status, a.provider, a.storage_url, a.mime_type, a.duration_seconds, a.metadata_json->>'voice' as voice from content_items ci join assets a on a.content_id = ci.content_id and a.asset_role = 'narration_audio' where ci.slug like 'tmp-phase3-narration-%' order by ci.created_at desc limit 1;"
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select workflow_name, run_status, details_json->>'generation_model' as generation_model, details_json->>'voice' as voice from workflow_runs where workflow_name = 'wf_narration_generation' order by started_at desc limit 3;"
```

Pass signal:

- smoke test exits successfully
- `voice` in the DB matches the voice you set
- the audio sounds usable, not just technically valid

### Simple post image prompt or image model tuning

Use when changing:

- `prompts/post_image_generation/prompt.md`
- `POST_IMAGE_PROVIDER`
- `POST_IMAGE_MODEL`
- `POST_IMAGE_SIZE`
- `POST_IMAGE_QUALITY`
- `POST_IMAGE_COMPRESSION`
- `POST_IMAGE_STYLE`
- `IMAGE_MODEL`
- `IMAGE_SIZE`
- `IMAGE_QUALITY`
- `IMAGE_COMPRESSION`
- `IMAGE_STYLE`
- legacy `OPENAI_IMAGE_MODEL`
- legacy `OPENAI_IMAGE_SIZE`
- legacy `OPENAI_IMAGE_QUALITY`
- legacy `OPENAI_IMAGE_COMPRESSION`
- legacy `OPENAI_IMAGE_STYLE`

Run:

```bash
RESET_EXISTING=true bash scripts/prepare_phase2_live_post_candidate.sh
```

Verify:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status, p.publish_status, a.provider, a.storage_url, a.mime_type from content_items ci join publishes p on p.content_id = ci.content_id join assets a on a.content_id = ci.content_id and a.asset_role = 'post_image' where ci.slug like 'tmp-phase2-live-%' order by ci.created_at desc limit 1;"
```

Pass signal:

- the candidate reaches `approval_pending`
- the asset is a public `image/jpeg`
- the generated image matches the updated prompt direction

## Step-by-Step Procedure

### Prompt-only test

1. Edit one prompt file under `prompts/`.
2. Do not change `.env`.
3. Run the matching smoke test from the matrix above.
4. Review the output in DB and, if relevant, review the generated asset or audio.
5. Keep the change only if the output quality is better without breaking schema or workflow state transitions.

### Model-only test

1. Edit one model env var in `.env`.
2. Recreate `n8n`:
   `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n`
3. Run the matching smoke test.
4. Compare the new output against the previous baseline.

### Voice-only test

1. Change only `OPENAI_TTS_VOICE` in `.env`.
2. Recreate `n8n`.
3. Run:
   `bash scripts/test_phase3_narration_generation_smoke.sh`
4. Listen to the generated audio and check the `voice` field in Postgres.

## Suggested Test Order

If you want the lowest-risk sequence:

1. tune prompt wording first
2. tune model choice second
3. tune narration voice third
4. only after those pass, run the live combined flow

Live combined flow:

- [22 — One-Click Reel Generate and Publish Runbook](/Users/rajchodisetti/n8n-insta/docs/runbooks/one-click-reel-generate-and-publish.md)

## Rollback

Prompt rollback:

- revert the changed prompt file in git

Model or voice rollback:

- restore the previous `.env` value
- recreate `n8n`

Cleanup temporary rows:

```bash
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "delete from content_items where slug like 'tmp-phase2-%' or slug like 'tmp-phase3-%' or slug like 'tmp-one-click-reel-%';"
```

## Practical Notes

- prompt changes are picked up immediately because the prompt directory is mounted into the running `n8n` container
- env-driven model and voice changes are not picked up until `n8n` is recreated
- if you want to inspect generated rows after a smoke test, use `KEEP_FIXTURES=true`
- for comparisons, keep a simple change log with:
  - file or env var changed
  - previous value
  - new value
  - smoke test used
  - quality result
