# 17 — Phase 2 Smarter Image Generation and Approval Flow

Status: `complete`

What was completed:

- replaced the simple image placeholder path in [wf_simple_post_image_asset.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_simple_post_image_asset.json) with an OpenAI-backed generated-image workflow that uses the title, hook, caption, and storyboard context
- added [workflows/scripts/generate_and_rehost_post_image.mjs](/Users/rajchodisetti/n8n-insta/workflows/scripts/generate_and_rehost_post_image.mjs) so generated JPEG assets can be rehosted and persisted as the live Instagram delivery asset
- added public asset-host support for generated-image delivery, with persisted host metadata in `assets.metadata_json`
- added the manual approval workflow [wf_content_approval.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_content_approval.json)
- added the combined helper [prepare_phase2_live_post_candidate.sh](/Users/rajchodisetti/n8n-insta/scripts/prepare_phase2_live_post_candidate.sh) to prepare one real candidate through research, storyboard, caption, hashtag, and image generation before manual review and live publish
- updated the live-post runbook in [19-phase2-manual-review-and-live-publish-runbook.md](/Users/rajchodisetti/n8n-insta/19-phase2-manual-review-and-live-publish-runbook.md)

Why it was tested:

- this was the first end-to-end manual review path on top of the upstream OpenAI content package
- the critical risks were generated-image delivery, public asset accessibility, approval-state transitions, and the handoff from `qa_approved` into the real Instagram publish workflow

How it was tested:

1. Prepared one real candidate with `bash scripts/prepare_phase2_live_post_candidate.sh`
2. Regenerated the post image through the updated asset workflow so the candidate used a public hosted JPEG URL
3. Verified the latest asset row had:
   - a provider ending in the selected host adapter id
   - a public hosted `storage_url`
   - a non-empty `rehost_provider`
4. Approved the candidate through `wf_content_approval`
5. Refreshed the expired Instagram Graph API token in `.env`, recreated `n8n`, and revalidated credentials with `bash scripts/check_instagram_permissions.sh`
6. Ran `wf_instagram_simple_post_publish`
7. Verified the final publish row:
   - `content_items.status = published`
   - `publishes.publish_status = published`
   - populated `instagram_container_id`
   - populated `instagram_media_id`
8. Verified the latest `workflow_runs` trail showed successful runs for:
   - `wf_simple_post_image_asset`
   - `wf_content_approval`
   - `wf_instagram_simple_post_publish`

Result:

- the combined `P2-04` and `P2-05` path passed with a real published Instagram post from candidate `tmp-phase2-live-20260420-233906`
