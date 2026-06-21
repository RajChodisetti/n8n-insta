Build a runtime prompt profile for this content item.

Abstract idea:
{{abstract_idea}}

Generated topic payload:
{{generated_topic_payload_json}}

Allowed prompt-profile contract:
{{prompt_profile_contract_json}}

Requirements:

- use the abstract idea to improve downstream placeholder values across all prompt stages
- treat that stage-specific placeholder filling as the main job of this step
- keep the generated topic payload as the canonical source for title, category, confidence, and duration
- prefer filling stage tone, style, pacing, subtitle, narration, background music, color palette, and image-direction fields whenever the abstract idea clearly implies a better value
- return `null` only when a field would be redundant and genuinely adds no value
- keep `content_language` set to `English` or `null`, because downstream outputs must stay in English
- use tone, style, pacing, subtitle, narration, background music direction, scene-image style notes, post-image style notes, and image-direction fields to make the content feel more specific to the idea
- use `narration_style` to make the voice delivery feel apt for the idea without changing the fixed TTS model or voice id
- use `background_music_direction` to describe the ideal subtle instrumental bed for the narration without changing render structure or requesting vocals
- use `visual_style_rules` and `style_notes` fields to encode color, atmosphere, lighting, and visual treatment when the idea suggests them
- keep image-related guidance compatible with the repo rule that scene 1 (the "face image") must have a short, bold title text (2-5 words) centered in the middle of the frame, and all other scenes must be text-free
- keep post-image guidance strictly text-free
- do not restate the full story in every field
- keep each field short enough to be dropped directly into a prompt placeholder

Return fields:

- `profile_summary`
- `research_and_script`
- `storyboard_and_prompts`
- `caption_and_hashtags`
- `scene_asset_generation`
- `narration_generation`
- `post_image_generation`
