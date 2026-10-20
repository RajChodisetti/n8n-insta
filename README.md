# Content Workflow Orchestration

Versioned n8n workflows for taking a topic through research, script, storyboard, caption, image generation, human approval, and a persisted Instagram image-post result.

The engineering focus is **workflow state, duplicate protection, retry behavior, review gates, and observable failures**. PostgreSQL holds content and publishing state; exported workflow JSON keeps orchestration logic reviewable in Git.

## Implemented pipeline

```text
topic → research/script → storyboard → caption/hashtags → image asset
                                                         ↓
                                              manual content approval
                                                         ↓
                                        readiness → publish → persist result
```

Eight [workflow exports](workflows/n8n) cover ingestion, research, storyboard, caption/hashtags, image assets, approval, readiness, and publishing. The image helper supports generated JPEG assets and rehosting through ImageKit. The current delivery path is a single image post; full Reel rendering, narration, and an automated insights feedback loop remain roadmap items.

## Engineering decisions

- **Durable state in PostgreSQL.** Content, generated assets, publishing identifiers, and workflow runs remain inspectable after an execution finishes.
- **Atomic publish claim.** Eligible work is claimed before publishing. Existing media IDs block duplicate claims; retry failures preserve previously recorded container IDs.
- **Failures are persisted.** Validation errors are written to publishing state and workflow-run details instead of disappearing into a workflow execution log.
- **Approval before delivery.** A dedicated approval workflow separates generated content from the publish-ready state.
- **Workflow logic in version control.** Exported JSON and helper scripts can be reviewed independently of n8n's editor and credential store.
- **Delivery assets are validated.** The publish path requires a public HTTP(S) JPEG asset; a local SVG is rejected before delivery.

## Evidence and tests

| Check | Evidence and scope |
| --- | --- |
| Duplicate protection and retry-safe failure | [Recorded test](delivery-testing/completed-items/12-publish-metadata-persistence-and-duplicate-protection.md): existing media IDs prevent a claim; failure preserves container ID and records validation errors |
| Generated image → approval → publish | [Recorded integration result](delivery-testing/completed-items/17-phase2-image-generation-and-approval-flow.md): image rehosting, approval, persisted media/container IDs, and successful workflow-run records |
| Topic, caption, and hashtag iterations | [Completed work index](delivery-testing/completed-items/README.md) links the individual checks and results |

These are historical repository records, not newly executed live tests. The duplicate/retry test exercised the exact workflow SQL and code-node logic because the recorded local n8n manual execution path was unreliable; it was not a full n8n execution test.

The reproducible duplicate/retry smoke script is [`scripts/test_mvp08_smoke.sh`](scripts/test_mvp08_smoke.sh). It requires the local PostgreSQL stack, creates synthetic database fixtures, blocks network access for its validation step, and cleans up its fixture rows. Run it only against an isolated development database:

```sh
bash scripts/test_mvp08_smoke.sh
```

Other smoke scripts cover topic-to-storyboard generation, caption iteration, and hashtag ranking. Review their prerequisites before running them; provider-backed flows can incur costs. Preparing content is distinct from publishing it.

## Explore and run

- [Architecture](02-architecture.md) and [data model](05-data-model.md).
- [Local infrastructure](infra/README.md): n8n, PostgreSQL, Redis, and MinIO.
- [Setup checklist](11-setup-checklist.md) and [smoke-test runbook](18-mvp-smoke-test-and-publish-runbook.md).
- [Manual review and publishing runbook](19-phase2-manual-review-and-live-publish-runbook.md).
- [Workflow exports](workflows/n8n) and [image delivery helper](workflows/scripts/generate_and_rehost_post_image.mjs).

Copy the example environment files, configure your own development services, and follow the setup checklist. Keep credentials out of exported workflows and Git. Starting the local infrastructure does not establish that account permissions, provider calls, or publishing are working.

## Development flow

Feature branches target `release/2.0`; validated releases are promoted to `main`. [Engineering backlog](16-engineering-backlog.md), [active testing tracker](15-delivery-and-testing-workflow.md), and [completed evidence](delivery-testing/completed-items/README.md) distinguish planned work from implemented and verified behavior.
