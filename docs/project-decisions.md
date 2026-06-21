# 00 — Decisions Log

This file captures the current decisions already made for the project.

## Decisions already made

### Platform
- We are building for **Instagram only** for now.
- Long-term primary format is **Instagram Reels**.
- MVP publish target is a **simple Instagram post** so the first working loop avoids video/render complexity.

### Content type
- Content will be **English-language**.
- Content will be **faceless**.
- Content style will be **interesting story / mystery / history / strange event storytelling**.
- Visuals will be **AI-generated and/or sourced through external providers**.
- Narration will be **AI-generated**.

### Brand approach
- Even without a face, the channel must have a recognizable signature.
- Signature will come from:
  - consistent voice
  - consistent pacing
  - consistent subtitle style
  - consistent music mood
  - consistent ending style

### Automation approach
- The system should aim for **minimum human intervention**, but not blind full automation.
- Recommended mode is **high automation with approval checkpoints**.
- Human involvement is mainly for:
  - topic approval
  - final Reel approval

### Technical approach
- Orchestrator: **n8n**
- Rendering: **external render worker or FFmpeg service** triggered by n8n
- Storage: **cloud drive or object storage**
- Data tracking: **database-backed content state tracking**
- Publishing: **Instagram API-based publishing workflow**
- Improvement loop: **Instagram insights collected and used for future recommendations**

### Build strategy
- Start with Instagram only
- Build modular workflows, not one giant workflow
- Build in phases
- Focus first on getting one complete loop working
- For MVP, prioritize `topic -> caption/hashtags -> single image -> publish` before `storyboard -> assets -> render -> Reel`
- After Phase 1, use `release/2.0` as the integration branch for ongoing work
- Cut feature branches from `release/2.0`, merge tested feature work back into `release/2.0`, and merge `release/2.0` into `main` only for meaningful upgrades

## Current target loop

`story -> script -> storyboard -> assets -> render -> approve -> publish -> analyze -> improve`

## Current MVP loop

`topic -> caption/hashtags -> simple image -> publish -> persist`

---

## Decision: Face Image Title Card Metadata (April 2026, updated 2026-06-21)

### What changed
- **Scene 1 (opening scene) is the "face image" title-card scene** with a short title text (2-5 words)
- This title text is stored in `face_image_title` metadata and applied by the renderer as an overlay
- Generated image/video assets remain text-free, including scene 1
- All subsequent scenes (2+) remain text-free and do not carry title metadata

### Why
- The first image in a Reel is the most important—it's the visual hook that stops the scroll
- A short, compelling title immediately communicates the story's core theme or intrigue
- This gives the Reel a strong visual identity right from frame 1
- The title becomes part of the brand signature (like a film title card)

### What's affected
- **Storyboard schema**: Added `is_face_image` (boolean) and `face_image_title` (string, 2-5 words) fields to scene objects
- **Storyboard prompts**: Scene 1 guidance now requests a specific title for the opening hook
- **Scene asset generation**: Scene 1 visual prompts stay text-free; all other scenes also remain text-free
- **Rendering contract**: `is_face_image` and `face_image_title` flow through the render manifest; the renderer owns the centered title overlay for scene 1
- **Data model**: Updated `storyboard_json` structure and documentation

### No breaking changes
- All existing workflows continue to work
- Scene 1 remains the opening image; nothing about timing or sequencing changes
- Only scene 1 carries the title metadata
- The renderer contract is clarified but backward-compatible for older payloads where fields are absent

### Implementation notes
- The `face_image_title` should distill the story's core theme, emotional hook, or intrigue
- Renderer title placement should be centered horizontally and vertically in the frame
- Renderer title treatment should be bold and readable at mobile scale
- Title overlay should not obscure the core visual subject of the scene
- Example: "The Mary Celeste" for a story about a ghost ship; "Hidden Fortune" for a buried treasure story

---

## Decision: Fish Audio with Emotional Expressions (April 28, 2026)

### What changed
- **Narration provider:** Switched to **Fish Audio** for TTS
- **Voice ID:** `74fde112e2cd4ebfbc2267bfab39ae49` (primary narration voice)
- **New capability:** LLMs can now use **emotional expressions** in narration scripts via parentheses tags
- **Supported emotions:** 49 emotional expressions + tone markers + audio effects

### Why
- Fish Audio supports natural emotional expression tags that enhance narration delivery
- Emotional consistency with story arc creates stronger viewer engagement
- Cinematic delivery (with emotions) matches the brand signature better than flat TTS
- Narrator style guidance can now be expressed through concrete emotion markers instead of vague adjectives
- Proper emotional delivery improves watch time and retention

### What's affected
- **Configuration:** Updated `.env` with new `NARRATION_MODEL` ID
- **Prompts:** Added emotional expression guidance to narration, research, and story package prompts
- **LLM behavior:** Story LLMs can now generate narration with emotion tags like `(curious)`, `(scared)`, `(hopeful)`
- **TTS behavior:** Fish Audio interprets emotion tags for appropriate vocal delivery

### How to use
Place emotion tags before text:
```
(curious) In 1872, a ship was found drifting in the Atlantic.
(nervous) Nobody knew where it came from.
(scared) The crew was never found.
(hopeful) Perhaps one day, we'll know the truth.
```

### Available emotions
- Basic (24): happy, sad, angry, excited, calm, nervous, confident, surprised, scared, worried, empathetic, curious, etc.
- Advanced (25): anxious, uncertain, confused, disappointed, regretful, guilty, ashamed, jealous, envious, hopeful, optimistic, etc.
- Tone markers (5): in a hurry tone, shouting, screaming, whispering, soft tone
- Audio effects (10): laughing, chuckling, sobbing, crying loudly, sighing, groaning, gasping, panting, yawning, snoring
- Pause markers (2): break, long-break

### Best practices
- Use emotions **sparingly** — don't over-tag
- Place emotions **before** the text they modify
- Match emotions to **story emotional arc**
- One emotion per sentence/thought
- Use realistic emotions that match narrator delivery

### No breaking changes
- Existing narration scripts without emotions continue to work
- Fish Audio falls back to neutral delivery if no emotions specified
- New content benefits from emotional expressions; old content remains compatible

### Documentation
- See `docs/integrations/fish-audio.md` for complete reference with 49 emotions
- See `docs/integrations/fish-audio.md` for quick lookup guide
- See updated prompts for LLM guidance integration
