# Fish Audio Emotional Expressions Implementation Guide

**Date:** April 28, 2026
**Voice ID:** 74fde112e2cd4ebfbc2267bfab39ae49
**Provider:** Fish Audio with Natural Expressions Support

## Overview

The narration system now uses **Fish Audio** with support for **emotional expressions**. These are natural language tags placed in parentheses within the narration script to shape the emotional delivery of the voice.

### Example

Instead of:
```
In 1872, a ship was found drifting in the Atlantic.
```

Now use:
```
(curious) In 1872, a ship was found drifting in the Atlantic.
```

This tells Fish Audio to deliver that line with a curious, inquisitive tone.

---

## Configuration

### Environment Variables Updated

```bash
NARRATION_PROVIDER=fish_audio
NARRATION_MODEL=74fde112e2cd4ebfbc2267bfab39ae49
NARRATION_VOICE=74fde112e2cd4ebfbc2267bfab39ae49
```

The voice ID `74fde112e2cd4ebfbc2267bfab39ae49` is now the primary narration voice.

---

## Supported Emotional Expressions

### Basic Emotions (24 expressions)

| Expression | Tag | Best For |
|------------|-----|----------|
| Happy | (happy) | Good news, greetings, positive outcomes |
| Sad | (sad) | Melancholic moments, tragic events |
| Angry | (angry) | Frustration, outrage, strong disagreement |
| Excited | (excited) | Major revelations, surprising discoveries |
| Calm | (calm) | Instructions, gentle moments, explanations |
| Nervous | (nervous) | Anxiety, suspense, uncertainty |
| Confident | (confident) | Assertions, strong statements, conclusions |
| Surprised | (surprised) | Shocking reveals, unexpected twists |
| Satisfied | (satisfied) | Resolutions, confirmations |
| Delighted | (delighted) | Joy, celebration, positive outcomes |
| Scared | (scared) | Danger, warnings, fearful topics |
| Worried | (worried) | Concerns, questions, troubling details |
| Upset | (upset) | Distress, problems, negative impacts |
| Frustrated | (frustrated) | Annoyance, delays, complications |
| Depressed | (depressed) | Deep sadness, hopeless topics |
| Empathetic | (empathetic) | Understanding, compassion, support |
| Embarrassed | (embarrassed) | Shame, awkward moments |
| Disgusted | (disgusted) | Negative reactions, repulsion |
| Moved | (moved) | Emotional moments, heartfelt statements |
| Proud | (proud) | Achievements, accomplishments |
| Relaxed | (relaxed) | Casual tone, comfortable delivery |
| Grateful | (grateful) | Appreciation, thanks |
| Curious | (curious) | Questions, exploration, mystery |
| Sarcastic | (sarcastic) | Irony, humor, criticism |

### Advanced Emotions (25 expressions)

| Expression | Tag | Best For |
|------------|-----|----------|
| Disdainful | (disdainful) | Strong criticism, contempt |
| Anxious | (anxious) | Urgency, worry, pressure |
| Hysterical | (hysterical) | Extreme emotions, panic |
| Indifferent | (indifferent) | Neutral responses, detachment |
| Uncertain | (uncertain) | Doubt, speculation |
| Doubtful | (doubtful) | Skepticism, questioning |
| Confused | (confused) | Bewilderment, unclear situations |
| Disappointed | (disappointed) | Unmet expectations, letdowns |
| Regretful | (regretful) | Apologies, remorse |
| Guilty | (guilty) | Culpability, confession |
| Ashamed | (ashamed) | Deep embarrassment, shame |
| Jealous | (jealous) | Envy, resentment |
| Envious | (envious) | Desire, admiration with want |
| Hopeful | (hopeful) | Optimism, future possibilities |
| Optimistic | (optimistic) | Positive outlook, encouragement |
| Pessimistic | (pessimistic) | Negative outlook, warnings |
| Nostalgic | (nostalgic) | Longing for the past, memories |
| Lonely | (lonely) | Isolation, solitude |
| Bored | (bored) | Disinterest, weariness |
| Contemptuous | (contemptuous) | Strong contempt, disdain |
| Sympathetic | (sympathetic) | Sympathy, condolences |
| Compassionate | (compassionate) | Deep care, support |
| Determined | (determined) | Resolve, decision-making |
| Resigned | (resigned) | Acceptance of defeat |
| Unhappy | (unhappy) | Discontent, dissatisfaction |

### Tone Markers (5 expressions)

| Tone | Tag | Usage |
|------|-----|-------|
| Hurried | (in a hurry tone) | Rushed, time-sensitive information |
| Shouting | (shouting) | Loud, commanding attention (use sparingly) |
| Screaming | (screaming) | Very loud, panic (rare, only for extreme situations) |
| Whispering | (whispering) | Very soft, intimate, secretive |
| Soft | (soft tone) | Gentle, quiet, comforting |

### Audio Effects (use sparingly)

| Effect | Tag | When to Use |
|--------|-----|------------|
| Laughing | (laughing) | When script has "ha, ha, ha" |
| Chuckling | (chuckling) | Light humor, "heh, heh" |
| Sobbing | (sobbing) | Intense crying (rare) |
| Crying Loudly | (crying loudly) | Extreme emotional moments |
| Sighing | (sighing) | Relief, frustration, resignation |
| Groaning | (groaning) | Frustration, "ugh" sounds |
| Gasping | (gasping) | Shock, surprise, "gasp" |
| Yawning | (yawning) | Tiredness, "yawn" |

### Special Pause Markers

| Marker | Tag | Duration |
|--------|-----|----------|
| Short Pause | (break) | ~0.5 second pause |
| Long Pause | (long-break) | ~1-2 second pause |

---

## Usage Guidelines

### Placement

Place the expression **before** the text it modifies:

```
(curious) In 1872, a ship was found drifting in the Atlantic.
```

NOT:

```
In 1872, a ship was found drifting in the Atlantic. (curious)
```

### For Multiple Sentences

Each emotion tag applies to the sentence that immediately follows it:

```
(curious) In 1872, a ship was found drifting in the Atlantic.
(nervous) Nobody knew where it came from.
(scared) The crew was never found.
```

### Scope Rules

An emotion tag affects one sentence or phrase. If you want to extend an emotion across multiple lines, use multiple tags:

```
(sad) The final message was heartbreaking.
(sad) Nobody understood what happened.
(sad) The truth died with them.
```

### Multiple Emotions in Sequence

You can chain different emotions to show emotional escalation:

```
(curious) At first, it seemed like a simple case.
(worried) Then, strange details emerged.
(nervous) The investigators realized something was wrong.
(scared) They discovered the full truth— and it was terrifying.
```

---

## Best Practices

### 1. Use Sparingly
Don't over-tag. Let natural delivery dominate:

```
❌ (curious) (hopeful) In 1872, (sad) a ship was found (nervous) drifting.
✅ (curious) In 1872, a ship was found drifting in the Atlantic.
```

### 2. Match Emotional Arc
Emotions should match the story's pacing and emotional journey:

```
Hook (excited): Immediate curiosity
Context (calm): Setup and explanation
Escalation (nervous/worried): Rising tension
Reveal (surprised/scared): Major moment
Close (hopeful/determined): Reflection or resolution
```

### 3. Use Realistic Emotions
Choose emotions that match how a real narrator would deliver:

```
✅ (curious) What if the truth was buried for a reason?
❌ (hysterical) What if the truth was buried for a reason?
```

### 4. Avoid Contradictions
Don't use emotions that contradict the semantic meaning:

```
✅ (sad) The family never recovered from this loss.
❌ (happy) The family never recovered from this loss.
```

### 5. Let Punctuation Do Some Work
Em-dashes and ellipses create pauses naturally. Use emotions for tone, not rhythm:

```
(curious) In 1872, a ship was found...
(nervous) Nobody knew where it came from— and nobody asked why.
```

### 6. Scene-Level Consistency
Maintain emotional tone within a scene, but shift between scenes:

```
Scene 1 (Hook): (excited) Opening revelation
Scene 2 (Context): (calm) Background explanation
Scene 3 (Escalation): (nervous) Rising tension
Scene 4 (Reveal): (scared) Major discovery
Scene 5 (Close): (hopeful) Reflection
```

---

## Example Scripts

### Example 1: Ghost Ship Mystery

```
(curious) In 1872, a ship was found drifting in the Atlantic.

(calm) The Mary Celeste was a fully stocked merchant vessel with supplies for months.

(surprised) But the crew was gone. All of them.

(nervous) No lifeboats were missing. The cargo was untouched.

(scared) It was as if they simply vanished— mid-meal, mid-life, mid-everything.

(hopeful) Perhaps one day, we'll know what really happened.
```

### Example 2: Unsolved Disappearance

```
(excited) In 1945, Flight 19 took off from Fort Lauderdale.

(confident) Five navy bombers headed out on a routine patrol.

(nervous) Within hours, radio contact was lost.

(worried) The flight leader's last words: "We seem to be off course."

(scared) All six aircraft vanished without a trace.

(in a hurry tone) A massive search found nothing.

(determined) Seventy years later, the mystery remains unsolved.
```

### Example 3: Historical Scandal

```
(calm) The story begins in 1890 London.

(curious) A young woman's diary surfaces with shocking confessions.

(surprised) Her husband was among the city's most powerful men.

(empathetic) She described years of manipulation and control.

(sad) Nobody believed her then. Her diary was sealed away.

(nostalgic) A century later, her words finally saw light.

(hopeful) Her story gave voice to countless others who suffered in silence.
```

### Example 4: Strange Weather Event

```
(excited) On one fateful night in 1888, something impossible happened.

(calm) The temperature dropped 66 degrees in just 12 hours.

(nervous) Ice formed on trees so thick, branches snapped like glass.

(in a hurry tone) Towns went dark. People froze.

(scared) Livestock died in the fields where they stood.

(curious) Meteorologists still debate what caused it.

(determined) We call it the Schoolhouse Blizzard— and it changed winter forecast forever.
```

---

## LLM Prompt Integration

When generating narration scripts, LLMs should receive this guidance:

```
Use emotional expressions in parentheses to shape the narration delivery.

Available emotions include:
- (curious), (excited), (calm), (confident), (empathetic)
- (sad), (worried), (scared), (surprised), (nervous)
- (nostalgic), (hopeful), (determined), (compassionate)
- (whispering), (soft tone) for intimate moments
- (in a hurry tone) for urgency
- (long-break) for extended pauses

Place expressions before the text they modify.

Examples:
- (curious) In 1872, a ship was found...
- (scared) The crew was never seen again.
- (hopeful) Perhaps one day, we'll know the truth.

Use emotions sparingly, naturally, and in alignment with the emotional arc of the story.
```

---

## Quality Checklist

When reviewing narration with emotional expressions:

- [ ] Emotions match the story's semantic content
- [ ] Emotions follow a logical emotional arc
- [ ] No overuse — emotions are applied strategically
- [ ] Placement is before the affected text (not after)
- [ ] Emotions don't contradict punctuation (em-dashes, ellipses)
- [ ] Scene-level emotions maintain consistency within beats
- [ ] Tone markers used appropriately (not shouting unnecessarily)
- [ ] Audio effects used only when script indicates (laughing, sighing, etc.)
- [ ] Long pauses don't break the narrative flow
- [ ] Final output is natural-sounding, not robotic

---

## Files Modified

| File | Changes |
|------|---------|
| `.env` | Updated `NARRATION_MODEL` to `74fde112e2cd4ebfbc2267bfab39ae49` |
| `prompts/narration_generation/instructions.md` | Added Fish Audio emotion reference |
| `prompts/research_and_script/system.md` | Added emotion guidance for LLMs |
| `prompts/story_package_generation/system.md` | Added emotion guidance for LLMs |

---

## Next Steps

1. **Generate test narration** with Fish Audio emotions
2. **Listen to output** to verify emotional delivery
3. **Adjust emotions** based on quality feedback
4. **Deploy to production** once satisfied

---

## Support & Reference

For complete Fish Audio emotion documentation, see:
- Basic Emotions (24 options) — Use for most situations
- Advanced Emotions (25 options) — Use for nuanced delivery
- Tone Markers (5 options) — Use for volume/intensity control
- Audio Effects (10 options) — Use sparingly for special moments

---

**Voice ID:** 74fde112e2cd4ebfbc2267bfab39ae49
**Provider:** Fish Audio
**Status:** Active and Ready
