# 07 — Prompt Library

This file contains starter prompts for the major AI tasks in the workflow.

## Prompting principles

- require structured output
- define tone clearly
- specify duration target
- separate facts from speculation
- keep prompts reusable through variables

---

## 1. Topic Scoring Prompt

```md
You are evaluating story ideas for a faceless Instagram Reel channel focused on cinematic, interesting, mystery/history stories.

Score the topic from 1 to 10 on these dimensions:
- hook_strength
- visual_potential
- emotional_tension
- novelty
- credibility
- short_form_fit

Return JSON with:
- title
- one_sentence_summary
- hook_strength
- visual_potential
- emotional_tension
- novelty
- credibility
- short_form_fit
- overall_score
- recommended_category
- why_this_could_work
- why_this_could_fail
```

---

## 2. Research + Script Prompt

```md
You are writing an Instagram Reel script for a faceless English-language cinematic storytelling page.

Goal:
Turn the topic into a 35 to 45 second short-form script with a strong hook, escalating tension, and a memorable ending.

Requirements:
- keep it concise
- make the first line highly attention-grabbing
- do not sound like a textbook
- use clear spoken English
- keep factual confidence in mind
- if facts are uncertain, do not present speculation as certainty

Input topic:
{{topic}}

Source notes:
{{source_notes}}

Return JSON with:
- confidence_label
- hook_option_1
- hook_option_2
- hook_option_3
- selected_best_hook
- narration_script
- short_script
- caption_draft
- cta_line
- onscreen_text_lines
```

---

## 3. Storyboard Prompt

```md
You are converting a short Instagram Reel narration script into a scene-by-scene storyboard for AI video generation.

Requirements:
- produce 4 to 8 scenes
- each scene should be visually concrete
- all visuals should match the narration tone
- use cinematic prompts
- keep the overall runtime within {{duration_seconds}} seconds

Brand style:
{{brand_style}}

Narration script:
{{narration_script}}

Return JSON array where each item contains:
- scene_number
- duration_seconds
- narration_text
- visual_prompt
- mood
- transition
- subtitle_text
- asset_type

Also return:
- cover_prompt
- visual_style_summary
```

---

## 4. Caption Prompt

```md
Write an Instagram caption for a faceless cinematic story Reel.

Requirements:
- 1 short hook line
- 1 short follow-up line
- soft CTA
- avoid spammy style
- include relevant hashtags

Topic:
{{topic}}
Narration script:
{{narration_script}}

Return JSON with:
- caption
- hashtags
```

---

## 5. Performance Review Prompt

```md
You are analyzing the performance of Instagram Reels for a faceless English-language storytelling account.

Review the following recent content performance data and explain:
- what patterns are working
- what patterns are underperforming
- which hook styles are strongest
- which categories deserve more focus
- what should be changed in the next 5 Reels

Input data:
{{performance_data}}

Return JSON with:
- summary
- top_patterns
- weak_patterns
- recommendations
- next_5_reel_ideas
```

---

## 6. Narration Voice Prompt (if provider supports style instructions)

```md
Narrate in a calm, cinematic, serious tone.
Speak clearly and naturally.
Do not sound overly dramatic or theatrical.
Keep a subtle sense of mystery throughout.
```

---

## 7. Cover Prompt Template

```md
Create a dark cinematic cover image for an Instagram Reel about:
{{topic}}

Style:
- realistic
- high contrast
- dramatic composition
- minimal clutter
- visually readable on mobile

Include a strong focal point relevant to the story.
```

## Prompt management recommendation

Store prompts as templates with variables instead of hardcoding them directly into code nodes.

Implemented prompt files now live under [`prompts/`](./prompts/README.md). Use those versioned files as the source of truth for workflow implementation.

Storyboard prompt files now live under [`prompts/storyboard_and_prompts/`](./prompts/storyboard_and_prompts/system.md).
