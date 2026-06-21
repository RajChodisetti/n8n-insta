# 20 — Phase 3 Render Manifest Construction

Status: `complete`

What was completed:

- added [wf_render_manifest_construction.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_render_manifest_construction.json) to claim one `narration_ready` item, combine the storyboard seed, subtitles, scene assets, and narration audio into a canonical `render_manifest_json`, persist that data in `renders`, and move the content row to `render_manifest_ready`
- added [test_phase3_render_manifest_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase3_render_manifest_smoke.sh) to seed one temporary topic, run the upstream Phase 3 package, and validate the resulting `renders` row plus workflow-run logging
- added render output defaults in [.env.example](/Users/rajchodisetti/n8n-insta/.env.example) for resolution, FPS, format, and subtitle style

Why it was tested:

- this was the first render-prep stage for the Reel pipeline, so it needed confirmation that the generated visuals plus narration now become one canonical timeline payload
- the critical risks were queue claiming from `narration_ready`, manifest assembly, timing alignment, persisted render metadata, and the `narration_ready -> render_manifest_ready` transition

How it was tested:

1. Ran `bash scripts/test_phase3_render_manifest_smoke.sh`
2. Verified the helper completed successfully and left the temporary content row at `content_items.status = render_manifest_ready`
3. Verified a `renders` row was written with non-empty `resolution`, `aspect_ratio`, `duration_seconds`, and `cover_image_url`
4. Verified `render_manifest_json.scenes` and `render_manifest_json.timeline` both contained at least 4 entries
5. Verified the latest `workflow_runs` row for `wf_render_manifest_construction` had `run_status = success`, non-empty `render_manifest.scene_count`, and non-empty `render_manifest.cover_image_url`

Result:

- the render manifest construction path passed and was promoted out of the active testing tracker
