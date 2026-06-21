# 18 — Phase 3 Scene Asset Generation

Status: `complete`

What was completed:

- added [wf_asset_generation.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_asset_generation.json) to claim one `storyboard_complete` content item, generate one portrait scene frame per storyboard scene, persist those rows as `scene_image` assets, and move the content row to `assets_ready`
- added [generate_and_rehost_scene_assets.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_scene_assets.mjs) so each scene image is generated with OpenAI and rehosted through the configured asset-host adapter
- added [test_phase3_scene_asset_generation_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase3_scene_asset_generation_smoke.sh) to validate research, storyboard, and scene-asset generation as one path
- added portrait-scene image env defaults in [.env.example](/Users/rajchodisetti/n8n-insta/.env.example)

Why it was tested:

- this was the first actual asset stage for the Reel pipeline, so it needed confirmation that storyboard prompts now become persisted scene-level visuals
- the critical risks were queue claiming, multi-scene generation, per-scene asset persistence, and the `storyboard_complete -> assets_ready` transition

How it was tested:

1. Ran `bash scripts/test_phase3_scene_asset_generation_smoke.sh`
2. Verified the helper completed successfully and left the temporary content row at `content_items.status = assets_ready`
3. Verified at least 4 `scene_image` asset rows were written for the test content item
4. Verified the generated scene assets had non-empty `provider`, `storage_url`, and `mime_type` values
5. Verified the latest `workflow_runs` row for `wf_asset_generation` had `run_status = success`, `generation_model = gpt-image-1-mini`, a non-empty `rehost_provider`, and a `scene_asset_generation.scenes` array

Result:

- the scene asset generation path passed and was promoted out of the active testing tracker
