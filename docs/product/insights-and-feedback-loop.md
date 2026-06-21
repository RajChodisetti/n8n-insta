# 10 — Insights and Feedback Loop

## Purpose

This document defines how published Reel performance should be collected and used to improve future content.

## Why this matters

Without a feedback loop, the system is only a publishing pipeline.
With a feedback loop, it becomes a learning system.

## Insight collection windows

Recommended windows:
- 24 hours after publish
- 72 hours after publish
- 7 days after publish

These windows provide a practical early, mid, and stabilized read.

## Metrics to collect

The exact metrics available may vary by media/account context, but the workflow should attempt to store:
- plays or views
- reach
- likes
- comments
- shares
- saves
- engagement rate if derivable
- any watch-time or completion-related indicators if available

## Derived metrics to compute

Where possible compute:
- saves per 1,000 views
- shares per 1,000 views
- likes per 1,000 views
- engagement rate
- view-to-follow pattern if later available from broader account analysis

## Interpretation framework

### Signal groups

#### Hook strength signals
Indications:
- strong early views relative to account baseline
- decent reach for same-sized audience

#### Depth/quality signals
Indications:
- higher saves
- higher shares
- meaningful comments

#### End-of-video strength signals
Indications:
- better completion-related performance
- more follows after story-style posts

## What the review engine should answer

For each review period, generate answers to:
- which categories are performing best?
- which hook formulas work best?
- what script lengths are strongest?
- which endings feel most effective?
- which visual styles correlate with better saves/shares?
- which weak patterns should be avoided?

## Example analysis prompts

### Post-level review
- Why did this Reel perform above or below recent baseline?
- Was the hook likely the issue, or the topic itself?
- Did the content feel more save-worthy or just casually watchable?

### Batch review
- Compare last 10 Reels and identify the top 3 repeatable patterns.
- Suggest 5 next Reel ideas aligned to the strongest patterns.

## Recommendation output format

A performance review should generate:
- concise summary
- what worked
- what failed
- category recommendation
- hook recommendation
- pacing recommendation
- next 5 story ideas

## Storage recommendation

Store both:
- raw snapshot payloads
- normalized metrics
- AI-generated interpretation

This preserves auditability and allows re-analysis later.

## Weekly review recommendation

In addition to post-level reviews, run one weekly workflow that:
- analyzes last 7 to 14 days
- compares categories
- compares hook styles
- suggests next week’s content mix

## Decision loop

The results should feed back into:
- topic scoring
- script style selection
- pacing defaults
- category weighting
- hook template preference

## Long-term goal

Over time the system should learn patterns like:
- maritime mysteries outperform archaeology by 22%
- date-led hooks outperform question-led hooks
- 35-second Reels outperform 50-second Reels
- darker visual tone drives more saves

That learning should influence future generation automatically.

