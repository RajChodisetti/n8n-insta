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
- `prompts/workflow/model_provider_router.md` is a planning-only contract; active provider selection still comes from the adapter files above
- `wf_end_to_end_reel_generate_and_publish` is the one-click wrapper that activates the render callback, resumes from the single unfinished Reel checkpoint when possible, waits for render completion when needed, then publishes the Reel
- `wf_instagram_reel_publish` now requires a matching `publish_approvals` row for the exact `renders.render_id` before it can claim a rendered Reel for publish; if a `content_account_contexts` snapshot names a publish account, that account must match the approval account
- `wf_instagram_simple_post_publish` now requires `qa_approved`; it no longer publishes simple posts directly from `assets_ready`
- `prompts/workflow/render_manifest_v2.md` is a renderer-neutral contract only; active render manifest construction and dispatch still use the current n8n workflow exports and local FFmpeg worker request shape
- `prompts/workflow/remotion_edit_plan.md` is a contract-only planning asset; no Remotion app, dependency, Studio command, workflow export, or FFmpeg replacement is active
- `prompts/workflow/avatar_video_selector.md` is active in the code-first avatar plan; it selects HeyGen avatar generation or video fallback, while provider calls still require runtime consent/config revalidation and publish remains approval-gated

Operational references:

- [docs/prompts/prompt-reference-and-model-call-map.md](/Users/rajchodisetti/n8n-insta/docs/prompts/prompt-reference-and-model-call-map.md)
- [docs/runbooks/one-click-reel-generate-and-publish.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/one-click-reel-generate-and-publish.md)
- [docs/architecture/adapter-architecture-and-provider-switching.md](/Users/rajchodisetti/n8n-insta/docs/architecture/adapter-architecture-and-provider-switching.md)
- [docs/runbooks/google-cloud-storage-asset-host.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/google-cloud-storage-asset-host.md)
- [docs/runbooks/studio-ui.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/studio-ui.md)

Studio UI:

- the local browser control panel lives under [studio-ui/](/Users/rajchodisetti/n8n-insta/studio-ui/server.mjs)
- it can inject topics, edit prompt files, edit curated `.env` settings, run workflow exports, and inspect recent content rows
- it writes client/account context snapshots for new topic rows
- it can record explicit selected-render approval records used by the Reel publish gate
- env-backed setting changes require recreating `n8n`, `render-worker`, and `studio-ui`
