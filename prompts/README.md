# Prompt Templates

This folder stores versioned prompt assets used by n8n workflows and supporting services.

Structure:

- `research_and_script/`
- `storyboard_and_prompts/`
- `caption_and_hashtags/`

Each prompt group should contain:

- `system.md`
- `user.md`
- `response-schema.json`

Testing rule:

- after a prompt set is implemented, review the placeholders and schema before it is marked `complete`
- once your review passes, the backlog item can move to `complete` and you should raise a PR
