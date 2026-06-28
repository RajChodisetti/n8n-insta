# Runtime Prompt Orchestration Strategy

Last reviewed: 2026-06-25, git commit `6a33fe0`.

This repo has three prompt layers. Keep them separate when improving short-form video quality.

## Layer 1: Must Remain Stable

These are contract and safety anchors. They should not be rewritten by AI at runtime.

| Area | Examples | Why stable |
| --- | --- | --- |
| Response schemas | `prompts/*/response-schema.json`, `prompts/schemas/*.json` | Downstream code expects these shapes. |
| Placeholder names | `{{title}}`, `{{narration_script}}`, `{{creative_defaults_json}}` | Runtime rendering fails or silently loses context if names change. |
| Stage wiring | `workflows/scripts/build_prompt_request.mjs`, `prompt_utils.mjs` stage metadata | Controls which prompt files are active. |
| Hard safety rules | Consent, approval, factuality, no generated text, license, public URL, no secret exposure | These are not creative preferences. |
| Prompt-builder guardrails | `prompts/prompt_builder/*`, `workflows/scripts/prompt_hard_rules.mjs` | Prevent runtime prompt rewrites from changing contracts. |
| Idea ingestion contract | `prompts/idea_ingest/*` | Creates the first structured topic and `creative_defaults` for the run. |

Stable does not mean never edited. It means edits must be explicit repo changes with tests, not runtime AI rewrites.

## Layer 2: Partially Runtime-Variable

These fields are allowed to change per idea, client, or run while the underlying prompt contract remains stable.

| Source | Runtime behavior | Allowed purpose |
| --- | --- | --- |
| Template placeholders | `prompt_template_data`, DB fields, env defaults | Inject the current idea, script, storyboard, model settings, style notes, and account context. |
| Selected `creative_workflow` | Stored on the topic source payload and resolved by `prompt_stage_defaults.mjs` into a role doc, strategy summary, and few-shot card from `prompts/creative_workflows/` | Choose a run-level creative strategy such as high-retention story, premium documentary, or sales/conversion without changing schemas or provider routes. |
| `creative_defaults` | Built by `idea_ingest` and stored on the topic/source payload | Set first-pass perspective, tone, visual strategy, pacing, narrator hint, music mood, and avoid rules. |
| Legacy `prompt_profile` | Normalized by `prompt_profile_contract.mjs` | Override only allowlisted stage fields such as tone, timing, style notes, language guidance, narration style, and music direction. |
| Client/account context | Snapshot fields resolved in `prompt_stage_defaults.mjs` | Apply account-level brand, style, voice, music, avatar, and publishing defaults without overriding global safety rules. |

Partial runtime changes should shape presentation, not change facts, schemas, providers, approval gates, or publish policy.

## Layer 3: Fully AI-Built At Runtime

These are expected to be generated fresh for each run.

| Area | Runtime behavior | Boundary |
| --- | --- | --- |
| Stage outputs | Topic package, story package, director plan, storyboard, captions, visual prompts, narration instructions | Must match the stage schema or expected output shape. |
| Runtime prompt-builder drafts | Enabled only by `prompts/.runtime-prompt-builder.json` and excluded for `prompt_builder`, `idea_ingest`, and `idea_prompt_profile` | May rewrite selected prompt files for wording and quality, but must preserve placeholders and hard rules. |
| Provider outputs | Images, audio, avatar/video jobs, render artifacts | Must be normalized before downstream use. |

Use this layer for creative generation and controlled prompt experiments. Do not use it to mutate workflow contracts.

Provider-facing asset prompts are intentionally not part of the default runtime prompt-builder target list. If they are explicitly selected, runtime visual safety rules are appended to keep generated assets text-free and keep title/caption work in the renderer.

## Professional Short-Form Strategy

Use these as the default quality bar for all Reel prompts.

| Principle | Must be fixed | Can be partial | Can be fully generated |
| --- | --- | --- | --- |
| One clear promise | The prompt must require one focused premise and a concrete viewer payoff. | The topic angle and audience framing. | Hooks, title options, caption options. |
| Fast hook | Prompts should require a first-line interruption in the first 1 to 2 seconds. | Hook style: question, contrast, confession, myth-bust, before/after. | Specific hook wording. |
| Evidence and specificity | No unsupported claims; uncertainty must be labeled. | Source notes, confidence label, client-provided context. | Script details that are supported by input. |
| Scene-by-scene clarity | Each scene maps to one narration beat with positive duration. | Scene pacing and mood curve. | Scene descriptions and transition choices. |
| Visual exactness | No generated text, logos, UI, signs, documents, or subtitles in image/video prompts. | Style pack, palette, camera language, subject continuity. | Final per-scene visual prompts. |
| Voice discipline | Clean spoken script stays separate from performance metadata. | Narrator style, speed, emotion curve. | Delivery notes and TTS instructions. |
| Remotion ownership | Renderer owns overlays, subtitles, cover output, title text, and final timeline. | Render style and timing metadata. | Edit-plan details when that stage is used. |
| Approval safety | Publish remains explicit and gated. | Reviewer/account metadata. | Caption draft and post copy. |

## Recommended Prompt Flow

1. `idea_ingest`: convert raw idea to a structured topic and `creative_defaults`.
2. `story_package_generation` or legacy split stages: produce hook, narration, scene guidance, storyboard, render seed, cover, and subtitle metadata.
3. `director_contract`: lock style, continuity, pacing, visual approach, and voice direction.
4. `storyboard_and_shot_plan`: split the storyboard into scene jobs, shot intent, asset handoff, voice/caption/music intent, and QA focus while preserving the downstream scene structure.
5. `visual_prompt_builder`: turn each scene job into concrete, text-free visual generation prompts.
6. `narration_generation`: produce provider-safe voice instructions for the clean script.
7. Render/Remotion stages: consume artifacts and timeline metadata. Do not ask image/video models to render text overlays.
8. `caption_and_hashtags`: write truthful publish copy after the story package exists.
9. QA, approval, and publish gates: validate artifacts, account, consent, license, selected render, and public URL.

## Runtime Prompt-Builder Policy

Enable runtime prompt-builder only for controlled experiments or broad prompt tone upgrades.

Safe targets:
- clearer task framing
- better ordering of instructions
- more precise quality criteria
- stronger short-form pacing language
- lower ambiguity around visual/narration output

Unsafe targets:
- changing placeholders
- changing schemas or output keys
- weakening safety, approval, consent, license, factuality, or no-visible-text rules
- adding provider credentials, private URLs, env values, or new service names
- claiming a contract-only prompt is active runtime wiring
- rewriting provider-facing image, video, or narration prompts casually; those are more sensitive to drift and are not default runtime-builder targets

If a runtime rewrite becomes a durable improvement, copy it back into the saved prompt file and run validation.

## Skills, AGENTS, And Runtime Prompts

Use all three, but for different jobs.

| Mechanism | Best use | Not good for |
| --- | --- | --- |
| Runtime prompt files in `prompts/` | Model instructions used by the pipeline. They are versioned, hot-loaded, schema-coupled, and placeholder-aware. | Teaching coding agents how to edit the repo. |
| `AGENTS.md` and context docs | Guidance for future coding agents and maintainers. | Runtime generation, unless pipeline code explicitly reads them. |
| Codex skills | Reusable operator workflows for prompt review, UI redesign, provider research, or repo maintenance. | Replacing pipeline prompts; skills are not automatically visible to production model calls. |

Recommendation: keep runtime model behavior in `prompts/`, keep agent behavior in `AGENTS.md` and `docs/ai-context/`, and create a dedicated prompt-review skill only if this review process becomes repeated enough to justify a local reusable workflow.

## Validation

After prompt or prompt-policy edits, run:

```bash
npm run check
node scripts/validate_ai_video_contract_regressions.mjs
```

For affected stages, also run the relevant smoke test from `prompts/AGENTS.md`.
