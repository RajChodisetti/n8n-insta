# 10 — Instagram Publishing Credentials and Account Validation

Status: `complete` ✅

## What Was Completed

- added `wf_instagram_publish_readiness`
- validates the Graph API token from the running n8n container environment
- checks `/me`, `/me/permissions`, and `/me/accounts`
- evaluates required publish scopes and linked Facebook Pages
- writes a readiness result into `workflow_runs` so the outcome is queryable in PostgreSQL
- added `scripts/check_instagram_permissions.sh` as a hard preflight gate with non-zero exit on failure

## Changed Files

- [workflows/n8n/wf_instagram_publish_readiness.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_publish_readiness.json)
- [scripts/check_instagram_permissions.sh](/Users/rajchodisetti/n8n-insta/scripts/check_instagram_permissions.sh)
- [workflows/README.md](/Users/rajchodisetti/n8n-insta/workflows/README.md)
- [docs/runbooks/instagram-professional-account.md](/Users/rajchodisetti/n8n-insta/docs/runbooks/instagram-professional-account.md)
- [infra/.env.example](/Users/rajchodisetti/n8n-insta/infra/.env.example)
- [infra/README.md](/Users/rajchodisetti/n8n-insta/infra/README.md)
- [.env.example](/Users/rajchodisetti/n8n-insta/.env.example)
- [docs/delivery/setup-checklist.md](/Users/rajchodisetti/n8n-insta/docs/delivery/setup-checklist.md)
- [docs/delivery/engineering-backlog.md](/Users/rajchodisetti/n8n-insta/docs/delivery/engineering-backlog.md)

## How It Was Tested

1. Opened `wf_instagram_publish_readiness` in n8n.
2. Confirmed the workflow nodes:
   - `Manual Trigger`
   - `Validate Instagram Publish Readiness`
   - `Prepare Readiness Log SQL Values`
   - `Log Readiness Run`
3. Ran `wf_instagram_publish_readiness` from `Manual Trigger`.
4. Verified the newest readiness rows:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select run_id, workflow_name, run_status, error_message, started_at, ended_at from workflow_runs where workflow_name = 'wf_instagram_publish_readiness' order by started_at desc limit 5;"`
5. Verified the detailed readiness payload:
   - `docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "select details_json->>'checked_at' as checked_at, details_json->>'graph_api_version' as graph_api_version, details_json->'missing_required_scopes' as missing_required_scopes, details_json->'linked_pages' as linked_pages from workflow_runs where workflow_name = 'wf_instagram_publish_readiness' order by started_at desc limit 1;"`
6. Ran the preflight validator:
   - `bash scripts/check_instagram_permissions.sh`

## Test Result

- the newest `workflow_runs` rows for `wf_instagram_publish_readiness` were `success`
- `error_message` was empty on the newest successful runs
- required scopes were present
- linked Facebook Pages were returned
- the current saved token and the running `n8n` token matched during readiness validation
- local preflight passed on `2026-04-19` in `America/Phoenix`
- latest readiness payload `checked_at` was `2026-04-20T04:31:15.941Z`
