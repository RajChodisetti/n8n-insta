# 19 — Phase 3 Narration Generation

Status: `complete`

What was completed:

- added [wf_narration_generation.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_narration_generation.json) to claim one `assets_ready` item, generate narration audio from the script, persist the resulting `narration_audio` asset, and move the content row to `narration_ready`
- added [generate_and_rehost_narration_audio.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_narration_audio.mjs) to call the OpenAI speech endpoint, rehost the resulting MP3 through ImageKit or the object-storage fallback, and return a persisted narration payload
- added [test_phase3_narration_generation_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase3_narration_generation_smoke.sh) to seed one temporary topic, run research, storyboard, scene-asset generation, and narration generation inline, then validate the resulting narration asset plus workflow-run logging
- added narration env defaults in [.env.example](/Users/rajchodisetti/n8n-insta/.env.example) for model, voice, and instruction control

Why it was tested:

- this was the first audio stage for the Reel pipeline, so it needed confirmation that a generated scene package now becomes a persisted narration track
- the critical risks were queue claiming from `assets_ready`, OpenAI TTS execution, audio rehosting, `narration_audio` persistence, and the `assets_ready -> narration_ready` transition

How it was tested:

1. Ran `bash scripts/test_phase3_narration_generation_smoke.sh`
2. Verified the helper completed successfully and left the temporary content row at `content_items.status = narration_ready`
3. Verified a `narration_audio` asset row was written with non-empty `provider`, `storage_url`, `mime_type`, `duration_seconds`, and `metadata_json.voice`
4. Verified the latest `workflow_runs` row for `wf_narration_generation` had `run_status = success`, `generation_model = gpt-4o-mini-tts`, and `voice = onyx`
5. Confirmed manual user validation reported the narration quality was good

Result:

- the narration generation path passed and was promoted out of the active testing tracker
