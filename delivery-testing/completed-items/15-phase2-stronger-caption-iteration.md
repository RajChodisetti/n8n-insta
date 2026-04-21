# 15 — Phase 2 Stronger Caption Iteration

Status: `complete`

What was completed:

- replaced the old deterministic caption mock inside [wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json) with a two-pass OpenAI workflow
- the first pass generates 3 caption directions plus a rationale, and the second pass refines the strongest direction into the final caption package
- the workflow logs iteration metadata, selected model, and revision summary into `workflow_runs.details_json`
- added the repeatable smoke test helper [test_phase2_caption_iteration_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase2_caption_iteration_smoke.sh)

Why it was tested:

- the old caption generator was still a placeholder, so the publish draft path needed confirmation that it now uses real structured OpenAI outputs instead of a hardcoded template
- the critical risks were two-pass model execution, schema enforcement, publish draft persistence, and workflow-run logging

How it was tested:

1. Ran `bash scripts/test_phase2_caption_iteration_smoke.sh`
2. Verified the helper completed successfully and reported `publish_status=draft`
3. Verified the generated `publishes` row had non-empty `caption_final` and `hashtags_final` values
4. Verified the latest `workflow_runs` entry for `wf_caption_and_hashtags` had `run_status=success`, a non-empty `generation_model`, a non-empty `revision_summary`, and an object-valued `caption_iteration`

Result:

- the stronger caption iteration path passed and was promoted out of the active testing tracker
