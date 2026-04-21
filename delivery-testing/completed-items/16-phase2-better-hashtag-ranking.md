# 16 — Phase 2 Better Hashtag Ranking

Status: `complete`

What was completed:

- extended [wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json) so the caption pass is followed by a dedicated OpenAI hashtag-ranking pass
- the workflow now generates 3 hashtag-set candidates, records the ranking rationale, and persists the selected final set into `publishes.hashtags_final`
- the workflow now logs hashtag ranking metadata into `workflow_runs.details_json.hashtag_ranking` alongside the existing caption iteration details
- added the repeatable smoke test helper [test_phase2_hashtag_ranking_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase2_hashtag_ranking_smoke.sh)

Why it was tested:

- the publish-draft path already had stronger caption writing, but hashtag quality was still bundled into the same response without an explicit ranking step
- the critical risks were the added OpenAI ranking pass, schema enforcement, publish draft persistence, and workflow-run logging

How it was tested:

1. Ran `bash scripts/test_phase2_hashtag_ranking_smoke.sh`
2. Verified the helper completed successfully and reported `publish_status=draft`
3. Verified the generated `publishes` row had non-empty `caption_final` and `hashtags_final` values
4. Verified the latest `workflow_runs` entry for `wf_caption_and_hashtags` had `run_status=success`, a non-empty `generation_model`, a non-empty `hashtag_selection_rationale`, and an object-valued `hashtag_ranking`

Result:

- the ranked hashtag path passed and was promoted out of the active testing tracker
