# 14 — Phase 2 Topic to Script to Storyboard Draft Generation

Status: `complete`

What was completed:

- replaced the old research/script scaffold with the real OpenAI-backed workflow export [wf_research_and_script.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_research_and_script.json)
- upgraded [wf_storyboard_and_prompts.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_storyboard_and_prompts.json) from a mock scene splitter into a real OpenAI-backed storyboard generator
- both workflows now atomically claim the next queue item, persist generated records into `scripts` and `storyboards`, and advance `content_items.status`
- added the repeatable smoke test helper [test_phase2_topic_to_storyboard_smoke.sh](/Users/rajchodisetti/n8n-insta/scripts/test_phase2_topic_to_storyboard_smoke.sh)

Why it was tested:

- this was the first real upstream content-packaging path after the Instagram publish MVP
- the test needed to confirm one approved topic could become a saved script and then a saved storyboard without manual DB edits

How it was tested:

1. Ran `bash scripts/test_phase2_topic_to_storyboard_smoke.sh`
2. Verified the helper completed successfully and reported `content_status=storyboard_complete`
3. Verified the generated `scripts` row had a non-empty `generation_model` and at least one on-screen text line
4. Verified the generated `storyboards` row had at least 4 scenes, at least 1 subtitle line, and a non-empty `cover_prompt`

Result:

- the end-to-end topic -> script -> storyboard draft flow passed and was promoted out of the active testing tracker
