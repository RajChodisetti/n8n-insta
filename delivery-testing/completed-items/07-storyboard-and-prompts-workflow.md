# 07 — Storyboard and Prompts Workflow

Status: `complete`

What was completed:

- added `wf_storyboard_and_prompts`
- fetches the next `script_complete` item from PostgreSQL
- generates a mock storyboard package
- persists `storyboard_json`, `subtitle_lines_json`, and `cover_prompt`
- updates `content_items.status` to `storyboard_complete`
- imported and bound the runtime workflow in n8n

Changed files:

- [workflows/n8n/wf_storyboard_and_prompts.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_storyboard_and_prompts.json)
- [workflows/README.md](/Users/rajchodisetti/n8n-insta/workflows/README.md)

Test result:

- storyboard rows persisted in PostgreSQL
- `cover_prompt` was populated
- multiple scenes and subtitle rows were stored
- related `content_items.status` updated to `storyboard_complete`
