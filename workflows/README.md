# n8n Workflow Exports

This folder stores versioned n8n workflow JSON exports for the Instagram Reel pipeline.

Current seed exports:

- `wf_manual_topic_ingest.json`
- `wf_research_and_script.json`
- `wf_storyboard_and_prompts.json`
- `wf_asset_generation.json`
- `wf_narration_generation.json`
- `wf_render_manifest_construction.json`
- `wf_render_worker_dispatch.json`
- `wf_render_status_callback.json`
- `wf_render_sync_completion.json`
- `wf_end_to_end_reel_generate_and_publish.json`
- `wf_instagram_reel_publish.json`
- `wf_instagram_metrics_collection.json`
- `wf_caption_and_hashtags.json`
- `wf_simple_post_image_asset.json`
- `wf_content_approval.json`
- `wf_instagram_publish_readiness.json`
- `wf_instagram_simple_post_publish.json`

The intent is to keep workflow logic in git even while credentials stay inside n8n.

Prompt-backed workflow notes:

- `wf_research_and_script`, `wf_storyboard_and_prompts`, and `wf_caption_and_hashtags` load prompt files through [build_prompt_request.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/build_prompt_request.mjs) and execute the selected text provider through [invoke_structured_text_adapter.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/invoke_structured_text_adapter.mjs)
- `wf_caption_and_hashtags` now uses one structured text call for both final caption and final hashtags
- `wf_asset_generation`, `wf_narration_generation`, and `wf_simple_post_image_asset` load prompt files through their helper scripts plus [prompt_utils.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/prompt_utils.mjs)
- image, narration, and hosting choices are now routed through [image_generation_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/image_generation_adapters.mjs), [tts_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/tts_adapters.mjs), [asset_host_adapters.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/asset_host_adapters.mjs), and [adapter_config.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/adapter_config.mjs)
- current asset-host implementations are `google_cloud_storage` and `object_storage`
- `wf_end_to_end_reel_generate_and_publish` is the one-click wrapper that activates the render callback, resumes from the single unfinished Reel checkpoint when possible, waits for render completion when needed, then publishes the Reel

Operational references:

- [21-prompt-reference-and-model-call-map.md](/Users/rajchodisetti/n8n-insta/21-prompt-reference-and-model-call-map.md)
- [22-one-click-reel-generate-and-publish-runbook.md](/Users/rajchodisetti/n8n-insta/22-one-click-reel-generate-and-publish-runbook.md)
- [24-adapter-architecture-and-provider-switching.md](/Users/rajchodisetti/n8n-insta/24-adapter-architecture-and-provider-switching.md)
- [27-google-cloud-storage-asset-host-runbook.md](/Users/rajchodisetti/n8n-insta/27-google-cloud-storage-asset-host-runbook.md)
- [25-studio-ui-runbook.md](/Users/rajchodisetti/n8n-insta/25-studio-ui-runbook.md)

Studio UI:

- the local browser control panel lives under [studio-ui/](/Users/rajchodisetti/n8n-insta/studio-ui/server.mjs)
- it can inject topics, edit prompt files, edit curated `.env` settings, run workflow exports, and inspect recent content rows
- env-backed setting changes require recreating `n8n`, `render-worker`, and `studio-ui`
