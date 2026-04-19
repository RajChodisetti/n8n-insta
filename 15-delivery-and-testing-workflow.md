# 15 — Delivery and Testing Workflow

This document defines how backlog items move from implementation to completion.

## Status model

Use one of these states for each backlog item:

- `backlog`
- `implemented_awaiting_test`
- `complete`

## Required process for every item

When an item is implemented, record all of the following:

- what was completed
- where the changes live
- how to test it
- what outcome should be considered a pass

Then use this handoff flow:

1. I implement the backlog item.
2. I document the test steps for you.
3. You run the tests and report the result.
4. If the test passes, I move the item to `complete`.
5. After moving it to `complete`, I ask you to raise a PR.

## Completed items

### 1. Local infra scaffold

Status: `complete`

What was completed:

- Docker Compose stack for `n8n`, `postgres`, `redis`, and `minio`
- non-default host ports to reduce collision risk
- persistent local volumes under `infra/state/`
- MinIO bucket bootstrap

Changed files:

- [infra/docker-compose.yml](/Users/rajchodisetti/n8n-insta/infra/docker-compose.yml)
- [infra/.env.example](/Users/rajchodisetti/n8n-insta/infra/.env.example)
- [infra/README.md](/Users/rajchodisetti/n8n-insta/infra/README.md)

How to test:

1. Run `cp infra/.env.example infra/.env` if `infra/.env` does not exist yet.
2. Run `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d`.
3. Run `docker compose --env-file infra/.env -f infra/docker-compose.yml ps`.
4. Open `http://localhost:35678`.
5. Open `http://localhost:42173`.

What to verify:

- `n8n`, `postgres`, `redis`, and `minio` are up
- `postgres` and `redis` show `healthy`
- n8n opens in the browser on port `35678`
- MinIO console opens in the browser on port `42173`
- there is no host-port collision during startup

Pass condition:

- all containers start successfully and both UIs are reachable

Test result:

- passed by local validation
- stack started successfully
- n8n and MinIO UI were reachable

### 2. Initial PostgreSQL schema

Status: `complete`

What was completed:

- initial tables for content lifecycle, assets, renders, publishing, insights, and workflow runs
- automatic schema bootstrap during first Postgres startup

Changed files:

- [infra/postgres/init/001_init.sql](/Users/rajchodisetti/n8n-insta/infra/postgres/init/001_init.sql)

How to test:

1. Ensure the stack is running.
2. Run `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "\\dt"`.
3. Confirm the custom tables exist.

What to verify:

- `content_items`
- `content_sources`
- `scripts`
- `storyboards`
- `assets`
- `renders`
- `publishes`
- `insight_snapshots`
- `performance_reviews`
- `workflow_runs`

Pass condition:

- the expected custom tables are listed by Postgres

Test result:

- passed by local validation
- expected custom tables are present in Postgres

### 3. Seed n8n workflow exports

Status: `complete`

What was completed:

- a manual topic ingest workflow export
- a research-and-script stub export for the next implementation step
- workflow export storage under version control

Changed files:

- [workflows/README.md](/Users/rajchodisetti/n8n-insta/workflows/README.md)
- [workflows/n8n/wf_manual_topic_ingest.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_manual_topic_ingest.json)
- [workflows/n8n/wf_research_script_stub.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_research_script_stub.json)

How to test:

1. Open n8n at `http://localhost:35678`.
2. Import `workflows/n8n/wf_manual_topic_ingest.json`.
3. Import `workflows/n8n/wf_research_script_stub.json`.
4. Confirm both workflows appear in the n8n editor.
5. Open each workflow and inspect the nodes.

What to verify:

- the JSON imports without parse errors
- `wf_manual_topic_ingest` loads with webhook, code, Postgres, and response nodes
- `wf_research_script_stub` loads with manual trigger, Postgres, set/code nodes, and provider placeholder
- the only missing piece should be credentials and provider integration, not broken workflow structure

Pass condition:

- both workflows import successfully and their node graphs look intact

Test result:

- passed by local validation
- both workflows import successfully into n8n
- the two workflows are expected to be separate and do not need to connect to each other

## Current items in `implemented_awaiting_test`

### 4. Research and script prompt templates

Status: `complete`

What was completed:

- extracted the research/script prompt into versioned prompt files
- added a stricter JSON response contract for the workflow
- documented how the workflow should consume these templates

Changed files:

- [prompts/research_and_script/system.md](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/system.md)
- [prompts/research_and_script/user.md](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/user.md)
- [prompts/research_and_script/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/research_and_script/response-schema.json)
- [prompts/README.md](/Users/rajchodisetti/n8n-insta/prompts/README.md)

How to test:

1. Open the three files under `prompts/research_and_script/`.
2. Verify that the prompt variables map to the workflow inputs you expect to send.
3. Verify that the response schema includes every field needed by the `scripts` table.
4. In n8n, inspect `wf_research_script_stub` and confirm the prompt payload shape can be filled from these templates without ambiguity.

What to verify:

- the system prompt defines role, tone, and factual handling clearly
- the user prompt includes placeholders for topic, source notes, duration, and brand voice
- the JSON schema covers hook options, selected hook, narration, short script, caption, CTA, and on-screen text
- there is no mismatch between prompt output names and the intended database fields

Pass condition:

- the prompt files are complete enough to be used directly in the next workflow implementation step without inventing missing fields

Test result:

- passed by local validation
- workflow output shape was aligned with the prompt schema

### 5. Persist scripts to DB from the research workflow

Status: `complete`

What was completed:

- extended `wf_research_script_stub` beyond prompt building
- added a mock provider response so the workflow can be tested before a real LLM is selected
- normalized the generated script package
- upserted script records into `scripts`
- updated `content_items.status` to `script_complete`
- added explicit guardrails so the workflow fails early if `content_id` or `title` is missing
- fixed SQL-safe inserts for `wf_manual_topic_ingest` so it can create test content reliably
- imported fresh runtime copies into n8n to replace the stale partial workflow the app was running

Changed files:

- [workflows/n8n/wf_research_script_stub.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_research_script_stub.json)
- [workflows/n8n/wf_manual_topic_ingest.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_manual_topic_ingest.json)

How to test:

1. In n8n, use the imported workflow named `wf_research_script_stub`. Do not use the older `My workflow` copy.
2. In n8n, use the imported workflow named `wf_manual_topic_ingest` if you need to create a fresh approved content item.
3. Confirm `wf_research_script_stub` has 9 nodes in this order:
   - `Manual Trigger`
   - `Fetch Next Approved Item`
   - `Prepare Prompt Payload`
   - `Build LLM Request`
   - `Mock Provider Response`
   - `Normalize Script Package`
   - `Prepare SQL Values`
   - `Upsert Scripts`
   - `Mark Script Complete`
4. Make sure at least one row exists in `content_items` with `status = 'idea_approved'`.
5. Run `wf_research_script_stub` from the start using `Manual Trigger`.
5. Query Postgres:
   - `select content_id, selected_hook, generation_model from scripts order by generated_at desc limit 5;`
   - `select content_id, status from content_items order by updated_at desc limit 5;`

What to verify:

- the workflow runs past prompt building into the DB nodes
- a row is inserted or updated in `scripts`
- `generation_model` is `mock_provider_v1`
- the related `content_items.status` becomes `script_complete`
- if upstream data is missing, the workflow now fails before SQL with a clear error instead of reaching `Upsert Scripts` with `undefined`

Pass condition:

- one approved content item is transformed into a persisted script record and the content status is updated

Test result:

- passed in the fixed runtime workflow
- script rows persist to `scripts`
- related `content_items.status` updates to `script_complete`

## Current items in `implemented_awaiting_test`

### 6. Storyboard prompt templates

Status: `implemented_awaiting_test`

What was completed:

- extracted the storyboard prompt into versioned prompt files
- defined a response schema for storyboard scenes, subtitle lines, cover prompt, and render manifest seed
- documented the prompt group for future workflow use

Changed files:

- [prompts/storyboard_and_prompts/system.md](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/system.md)
- [prompts/storyboard_and_prompts/user.md](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/user.md)
- [prompts/storyboard_and_prompts/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/storyboard_and_prompts/response-schema.json)
- [prompts/README.md](/Users/rajchodisetti/n8n-insta/prompts/README.md)

How to test:

1. Open the three files under `prompts/storyboard_and_prompts/`.
2. Verify that the placeholders map to the expected workflow inputs:
   - `title`
   - `category`
   - `target_duration_seconds`
   - `brand_tone`
   - `visual_style_rules`
   - `subtitle_style_rules`
   - `narration_script`
3. Verify that the response schema covers:
   - `storyboard_json`
   - `cover_prompt`
   - `subtitle_lines_json`
   - `style_notes`
   - `visual_style_summary`
   - `render_manifest_seed_json`
4. Confirm the schema output is compatible with the `storyboards` table in PostgreSQL.

What to verify:

- the system prompt defines scene planning and factual alignment clearly
- the user prompt gives enough context to derive scenes, subtitles, and a cover prompt
- the schema includes all fields needed to persist a storyboard package
- the scene objects use stable field names suitable for later asset/render steps

Pass condition:

- the prompt files are complete enough to drive the `storyboard_and_prompts` workflow without inventing additional required fields

After your test:

- tell me whether the storyboard prompt-template test passed or failed
- if it passed, I will move this item to `complete` and ask you to raise a PR
