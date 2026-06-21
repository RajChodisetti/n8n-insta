# 17 — Brand Identity

This document defines the content personality, voice, visual style, and engagement strategy for **@mana_andhari_kathalu**.

Use this as the source of truth for all prompt engineering, narrator settings, and image generation directives.

## Channel Overview

- **Handle:** @mana_andhari_kathalu
- **Content type:** Faceless storytelling (mysterious narratives)
- **Platform:** Instagram (posts and Reels)
- **Target audience:** English-native Instagram scrollers (general interest)
- **Primary engagement hook:** Mystery, deep voice narration, compelling opening lines

---

## Content Tone & Voice

### Brand Tone
- **Primary:** Mysterious & suspenseful
- **Secondary traits:** Thought-provoking, intrigue-driven
- **Mood:** Dark, atmospheric, compelling
- **Cadence:** Slow-burn revelations, building tension

### Narrator Voice (OpenAI TTS)
- **Selected voice:** Deeper voice options
  - Primary: **onyx** (deep, authoritative, mysterious)
  - Backup: **echo** (serious, contemplative)
- **Delivery:** Measured, measured pacing with strategic pauses
- **Volume dynamics:** Slight emphasis on hook lines and key revelations

### Writing Style
- **Hook line:** Must grab attention in first 10 words
- **Pacing:** Build mystery gradually, reveal selectively
- **Language:** Accessible yet literary (no jargon, high engagement)
- **Tone markers:** 
  - Use phrases like "What if...", "The truth is...", "But here's where it gets strange..."
  - Avoid sensationalism; stay grounded in intrigue

---

## Visual Style (DALL-E 3)

### Image Aesthetic
- **Primary style:** Realistic with darker tones
- **Mood:** Atmospheric, moody, cinematic
- **Color palette:** Deep blues, blacks, shadows, occasional accent colors (gold, crimson)
- **Composition:** Dramatic lighting, focal depth, mysterious subjects

### Image Selection Strategy
- **Per-post customization:** Each post gets a tailored visual prompt based on story topic
- **User flexibility:** Allow manual selection of image style variant per post (dark, realistic, alternative styles)
- **Consistency:** All images maintain the darker, realistic aesthetic

### Image Prompt Template Structure
```
"[scene description] in a realistic, dark, atmospheric style. 
Cinematic lighting. Moody tone. Deep colors and shadows. 
Mystery and intrigue. Professional photography aesthetic."
```

---

## Content Specifications

### Instagram Post Format
- **Caption length:** ~100 words
- **Opening line:** Hook-focused, must stand alone
- **Body:** Context, mystery setup, engagement question
- **Hashtags:** 6-10 relevant tags (generated via wf_caption_and_hashtags)

### Script Format (for narration)
- **Total length:** 90 seconds when read aloud
- **Spoken portion:** 60 seconds
- **Structure:**
  - Hook (5-10 seconds)
  - Setup (20-30 seconds)
  - Revelation (20-30 seconds)
  - Reflection/CTA (5-10 seconds)

### Story Structure
1. **Hook line:** Curiosity-driven opening (must work as standalone caption)
2. **Context:** Brief scene-setting or background
3. **Mystery element:** The central intrigue or unsolved question
4. **Revelation:** Key fact, twist, or insight
5. **Engagement:** Call to action or reflection prompt for audience

---

## Target Audience Insights

### Audience Profile
- **Demographics:** English-native Instagram scrollers (18-45)
- **Interests:** Mysteries, history, true crime, unexplained phenomena
- **Behavior:** Scroll-focused, appreciate short-form content, drawn to curiosity-driven narratives
- **Engagement type:** Comments on unsolved questions, shares intriguing content

### Engagement Drivers
1. **Mystery & intrigue** — "What's the real answer?"
2. **Deep narrator voice** — Adds credibility and presence
3. **Hook line** — Must stop the scroll immediately
4. **Realistic visuals** — Grounds the story, increases immersion
5. **Pacing** — Slow reveals keep viewers engaged

---

## Prompt Engineering Guidelines

### For Caption Generation
Use tone: Mysterious, thought-provoking  
Hook: Must start with intrigue  
Length: ~100 words  
Include: Opening mystery + context + engagement question  

### For Script Generation
Use tone: Mysterious, measured delivery  
Hook: 5-10 second opening that works standalone  
Pacing: 60 seconds total spoken time  
Structure: Setup → Mystery → Revelation → Reflection  

### For Image Generation
Style: Realistic, darker tones  
Mood: Atmospheric, cinematic, mysterious  
Prompt: Always include "dark," "atmospheric," "realistic," "mysterious"  
Flexibility: Allow per-post style selection (dark variant, lighting options)  

---

## Version & Updates

**Version:** 1.0  
**Finalized:** [Current Date]  
**Next review:** After first 10 published posts  

---

## Implementation Checklist

- [x] Brand tone defined (Mysterious & suspenseful)
- [x] Narrator voice selected (onyx, deeper)
- [x] Visual style locked (Realistic, darker)
- [x] Content length finalized (90 sec total, 60 sec spoken, 100 word caption)
- [x] Target audience defined (English-native Instagram scrollers)
- [x] Engagement hooks identified (Mystery, voice depth, hook lines)
- [ ] Update all prompt templates with these guidelines
- [ ] Configure narrator voice in OpenAI TTS nodes
- [ ] Create DALL-E image prompt library
