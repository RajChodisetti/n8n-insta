# 19 — Phase 2 Manual Review and Live Publish Runbook

Use this runbook to validate the combined Phase 2 path:

- OpenAI script generation
- OpenAI storyboard generation
- OpenAI caption and hashtag generation
- OpenAI post-image generation
- manual approval
- live Instagram publish

## Preconditions

- local stack is running:
  - `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d`
- the repo-root `.env` contains:
  - `OPENAI_API_KEY=...`
  - `INSTAGRAM_GRAPH_API_TOKEN=...`
  - `INSTAGRAM_PUBLISH_ENABLED=true`
- the repo-root `.env` also contains:
  - `IMAGE_HOST_PROVIDER=imagekit`
  - `IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/...`
  - `IMAGEKIT_PRIVATE_KEY=...`
- the current recommended live-post path uses ImageKit so Meta fetches a public hosted JPEG instead of your local MinIO URL
- recreate `n8n` after any `.env` changes:
  - `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n`
- if you are still using the fallback object-storage path instead of ImageKit, `REELS_STORAGE_PUBLIC_BASE_URL` must point at a public host or tunnel that serves the MinIO/S3 bucket objects to Meta

## Combined preparation

1. Prepare one real candidate through the upstream workflows:
   - `bash scripts/prepare_phase2_live_post_candidate.sh`
2. Inspect the prepared candidate:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status, p.publish_status, a.provider, a.storage_url, a.mime_type from content_items ci join publishes p on p.content_id = ci.content_id join assets a on a.content_id = ci.content_id and a.asset_role = 'post_image' where ci.slug like 'tmp-phase2-live-%' order by ci.created_at desc limit 1;"`
3. Inspect the generated asset metadata:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select a.provider, a.storage_url, a.metadata_json->>'generated_url' as generated_url, a.metadata_json->>'asset_validation_note' as asset_validation_note from assets a join content_items ci on ci.content_id = a.content_id where ci.slug like 'tmp-phase2-live-%' and a.asset_role = 'post_image' order by a.created_at desc limit 1;"`
4. Confirm the delivery URL is public before live publish:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select a.storage_url, a.metadata_json->'imagekit'->>'file_id' as imagekit_file_id, a.metadata_json->>'rehost_provider' as rehost_provider from assets a join content_items ci on ci.content_id = a.content_id where ci.slug like 'tmp-phase2-live-%' and a.asset_role = 'post_image' order by a.created_at desc limit 1;"`
5. If you changed ImageKit env values after the last asset run, rerun only the asset workflow before approval:
   - `docker exec -e N8N_RUNNERS_ENABLED=false n8n-insta n8n execute --id='uxtHJfrUJD5r5e2x' --rawOutput`

## Manual approval

1. Open `wf_content_approval` in n8n.
2. Run from `Manual Trigger`.
3. Before running, review the output of `Fetch Next Approval Candidate`.
4. Leave `Manual Approval Decision` set to `approve` for the live publish path.
   - If you want to test rejection, change `approval_decision` to `reject` and rerun the image workflow later.
5. Verify the approval state:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status, ci.approved_at, s.approved_by_human from content_items ci join scripts s on s.content_id = ci.content_id where ci.slug like 'tmp-phase2-live-%' order by ci.created_at desc limit 1;"`

## Live publish

1. Open `wf_instagram_simple_post_publish` in n8n.
2. Run from `Manual Trigger`.
3. Verify the publish result:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select ci.slug, ci.status as content_status, p.publish_status, p.instagram_media_id, p.instagram_container_id, p.published_at from content_items ci join publishes p on p.content_id = ci.content_id where ci.slug like 'tmp-phase2-live-%' order by ci.created_at desc limit 1;"`
4. Verify the workflow log trail:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select workflow_name, run_status, error_message, started_at from workflow_runs where content_id in (select content_id from content_items where slug like 'tmp-phase2-live-%') order by started_at desc limit 10;"`

## Pass condition

- the prepared candidate reaches `approval_pending`
- approval moves the same row to `qa_approved`
- the live publish workflow ends with:
  - `publishes.publish_status = published`
  - populated `instagram_container_id`
  - populated `instagram_media_id`
  - `content_items.status = published`

## Cleanup

- if you used a temporary live-test row and do not want to keep it:
  - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "delete from content_items where slug like 'tmp-phase2-live-%';"`
