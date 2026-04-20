# 05 — Persist Scripts to DB from the Research Workflow

Status: `complete`

What was completed:

- `wf_research_script_stub` now generates a mock provider response
- script package normalization and SQL-safe persistence into `scripts`
- `content_items.status` update to `script_complete`
- guardrails for missing upstream data

Changed files:

- [workflows/n8n/wf_research_script_stub.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_research_script_stub.json)
- [workflows/n8n/wf_manual_topic_ingest.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_manual_topic_ingest.json)

Test result:

- `scripts` rows persisted with `generation_model = 'mock_provider_v1'`
- related `content_items.status` updated to `script_complete`
