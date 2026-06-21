Create a single-pass caption and hashtag package for this Instagram post.

Title:
{{title}}

Category:
{{category}}

Audience-facing language:
{{content_language}}

Current pipeline stage:
{{content_status}}

Selected hook:
{{selected_hook}}

Narration script:
{{narration_script}}

Existing caption draft:
{{caption_draft_or_none}}

Optional CTA seed:
{{cta_line_or_none}}

Cover prompt context:
{{cover_prompt_or_none}}

Requirements:

- produce 3 distinct caption options
- keep each option natural and platform-appropriate
- include a soft CTA only when it fits
- choose the strongest option and refine it into one final caption
- produce one final compact space-separated hashtag string
- use only relevant hashtags
- do not exceed a practical short-post style
- keep the final caption aligned to {{content_language}}
- follow this language guidance: {{language_guidance}}

Return fields:

- `caption_option_1`
- `caption_option_2`
- `caption_option_3`
- `selection_rationale`
- `caption_final`
- `hashtags_final`

Return only JSON.
