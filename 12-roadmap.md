# 12 — Roadmap

## Phase 0 — Foundation

### Goal
Prepare the system design, providers, schemas, and environment.

### Deliverables
- documentation pack complete
- provider shortlist complete
- database chosen
- storage chosen
- render strategy chosen
- Instagram account readiness confirmed

---

## Phase 1 — Working MVP

### Goal

Publish one simple Instagram post end to end without video rendering.

### Scope

- manual topic intake
- short caption generation
- hashtag generation
- one image asset path
- Instagram publish workflow
- publish metadata persistence

### Success criteria

You can create and publish a basic Instagram post from the system.

---

## Phase 2 — Content Planning Engine

### Goal
Build topic to script to storyboard flow.

### Scope
- manual or scheduled topic intake
- story scoring
- script generation
- storyboard generation
- content records stored in DB

### Success criteria
You can create a fully specified content package without yet publishing.

---

## Phase 3 — Asset and Render Engine

### Goal
Generate or collect all media assets and produce a final Reel.

### Scope
- narration generation
- scene asset generation
- music selection
- render manifest creation
- render worker integration
- final MP4 output

### Success criteria
You can consistently produce Reel-ready draft videos.

---

## Phase 4 — Instagram Publishing

### Goal
Automate the publish step.

### Scope
- pre-publish validation
- API publishing flow
- save media identifiers
- publish status handling

### Success criteria
Approved content can be published to Instagram without manual upload.

---

## Phase 5 — Insight Collection and Reviews

### Goal
Build the learning loop.

### Scope
- 24h / 72h / 7d metrics capture
- normalized metrics storage
- performance review generation
- recommendation output

### Success criteria
The system can explain what worked and suggest what to create next.

---

## Phase 6 — Semi-autonomous Operation

### Goal
Reduce human involvement while preserving quality.

### Scope
- top-topic auto-selection with approval queue
- draft content auto-batching
- publish queue management
- weekly performance reviews

### Success criteria
You mostly approve high-quality outputs instead of manually coordinating all steps.

---

## Future Phase — Optimization and Scale

### Possible expansions
- multiple branded story channels
- category-specific pipelines
- stronger A/B testing of hooks
- dynamic posting-time optimization
- deeper account-level trend analysis

## Recommended implementation order

1. foundation
2. working MVP
3. content planning engine
4. render engine
5. Instagram publishing automation
6. insights and reviews
7. semi-autonomous operation

## What not to do early

Avoid these in the first build:
- overengineering trend discovery
- building a huge admin UI too early
- adding multiple platforms
- trying to fully eliminate human review before quality is stable

## Final principle

Ship a working loop first.
Then make the loop smarter.
Then make it faster.
