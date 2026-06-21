# Fish Audio Emotional Expressions - Quick Reference

**Voice ID:** 74fde112e2cd4ebfbc2267bfab39ae49

## Quick Syntax

```
(emotion) Text here.
(emotion) Next sentence here.
```

## Most Useful Emotions

### Story Opening
- (excited) — Hook attention
- (curious) — Create intrigue
- (confident) — Assert authority

### Story Development
- (calm) — Explain context
- (curious) — Ask questions
- (nervous) — Build tension
- (worried) — Express concern

### Story Climax
- (surprised) — Big reveal
- (scared) — Create fear
- (shocked) — Extreme surprise

### Story Close
- (hopeful) — Optimistic ending
- (determined) — Strong conclusion
- (sad) — Reflective ending
- (empathetic) — Compassionate close

## Tone Control

| Situation | Expression |
|-----------|------------|
| Intimate/secret | (whispering) |
| Gentle/calm | (soft tone) |
| Rushed/urgent | (in a hurry tone) |
| Long pause | (long-break) |

## Don't Overuse

```
❌ WRONG: (excited)(curious)(hopeful) In 1872...

✅ RIGHT: (curious) In 1872, a ship was found drifting.
```

## One Per Sentence

Each emotion affects ONE sentence:

```
(curious) What happened that night?
(scared) Nobody really knows the truth.
(hopeful) But one day, we might find out.
```

## Story Arc Template

```
(excited) Hook opening.
(calm) Provide context.
(nervous) Build tension.
(surprised) Major reveal.
(hopeful) Reflective close.
```

## Complete Emotion List

**Quick Access:**
happy, sad, angry, excited, calm, nervous, confident, surprised, scared, worried, empathetic, curious, sarcastic, anxious, uncertain, confused, disappointed, regretful, hopeful, determined, nostalgic, compassionate

**See Full Guide:** `FISH_AUDIO_EMOTIONAL_EXPRESSIONS.md`

## Configuration

```bash
NARRATION_PROVIDER=fish_audio
NARRATION_MODEL=74fde112e2cd4ebfbc2267bfab39ae49
NARRATION_VOICE=74fde112e2cd4ebfbc2267bfab39ae49
```

## Files to Update

When generating narration:
1. Use `prompts/narration_generation/instructions.md` for TTS generation
2. Use `prompts/research_and_script/system.md` for script LLMs
3. Use `prompts/story_package_generation/system.md` for story package LLMs

## Example

**Before:**
```
In 1872, a ship was found drifting in the Atlantic.
Nobody knew where it came from.
The crew was never found.
Perhaps one day, we'll know what happened.
```

**After:**
```
(curious) In 1872, a ship was found drifting in the Atlantic.
(nervous) Nobody knew where it came from.
(scared) The crew was never found.
(hopeful) Perhaps one day, we'll know what happened.
```

## Best Practice Checklist

- [ ] Emotions match story content
- [ ] Emotions follow emotional arc
- [ ] Not overused
- [ ] Placed before text (not after)
- [ ] Realistic for narrator
- [ ] One per sentence
- [ ] Compatible with punctuation
- [ ] Scene-level consistency

---

For full details: `FISH_AUDIO_EMOTIONAL_EXPRESSIONS.md`
