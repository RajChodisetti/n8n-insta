# 08 — Caption and Hashtag Generator

Status: `complete`

What was completed:

- added versioned caption/hashtag prompt files
- added `wf_caption_and_hashtags`
- fetches the next publishable content item from PostgreSQL
- generates a mock caption and compact hashtag set
- persists draft publish data into `publishes`
- imported the workflow into the running n8n instance and bound it to the existing Postgres credential

Changed files:

- [prompts/caption_and_hashtags/system.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/system.md)
- [prompts/caption_and_hashtags/user.md](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/user.md)
- [prompts/caption_and_hashtags/response-schema.json](/Users/rajchodisetti/n8n-insta/prompts/caption_and_hashtags/response-schema.json)
- [workflows/n8n/wf_caption_and_hashtags.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_caption_and_hashtags.json)

Test result:

- draft publish rows persisted in `publishes`
- `caption_final` and `hashtags_final` were populated
