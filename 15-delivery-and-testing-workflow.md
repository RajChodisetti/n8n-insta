# 15 — Delivery and Testing Workflow

This is the active delivery/testing tracker.

## Updated Links

- Active tracker: [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md)
- Engineering backlog: [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)
- Completed items archive: [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)
- Setup checklist: [11-setup-checklist.md](/Users/rajchodisetti/n8n-insta/11-setup-checklist.md)
- MVP smoke test runbook: [18-mvp-smoke-test-and-publish-runbook.md](/Users/rajchodisetti/n8n-insta/18-mvp-smoke-test-and-publish-runbook.md)

## How Tracking Works

Use these three documents together:

- [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)
  Source of truth for what still needs to be built and what is in scope for the MVP.
- [15 — Delivery and Testing Workflow](/Users/rajchodisetti/n8n-insta/15-delivery-and-testing-workflow.md)
  Active tracker for items that have been implemented and are waiting for testing.
- [delivery-testing/completed-items/README.md](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/README.md)
  Archive of items that already passed testing.

Rule:

1. backlog sequencing lives in the engineering backlog
2. once an item is implemented, it moves here for testing
3. once it passes testing, it moves into the completed-items archive
4. every completion message should include the updated links above
5. every testing section should include exact DB check commands and, if needed, exact insert or update commands
6. every `implemented_awaiting_test` item must document:
   - what was delivered
   - why you are testing it
   - exact prerequisites
   - exact test steps
   - exact DB checks or observable outputs
   - clear pass conditions
   - cleanup steps if the test creates synthetic data
7. after an item passes testing, the feature PR target should be `release/2.0`
8. `main` should only receive promoted changes from `release/2.0`

## Branching Rule

For all work after Phase 1:

- cut feature branches from `release/2.0`
- merge tested feature branches into `release/2.0`
- merge `release/2.0` into `main` only when the branch contains a meaningful validated upgrade

## Status Model

- `backlog`
- `implemented_awaiting_test`
- `complete`

## Required Entry Format

Every new item added to `implemented_awaiting_test` must use this structure:

### `ITEM-ID` short title

Status: `implemented_awaiting_test`

What Was Delivered:

- concrete code, workflow, script, or config that changed
- key behavior now supported

Why You Are Testing It:

- the user-visible or system-critical behavior that still needs confirmation
- the failure or regression risk this test is meant to catch

Prerequisites:

- env flags, credentials, data state, or running services needed before the test

How To Test:

1. exact commands to run, or exact n8n/manual UI path
2. exact DB checks or observable outputs to inspect
3. cleanup commands if needed

Pass Condition:

- exact expected result
- exact DB state or log evidence that confirms success

Notes:

- optional local validation context from implementation, if it helps you understand what you are confirming

## Current Items in `implemented_awaiting_test`

No items are currently in `implemented_awaiting_test`.

## Completed Items (moved to archive)

### 10. `MVP-06` Instagram publishing credentials and account validation

Status: `complete` ✅

Archive entry:

- [10 — Instagram Publishing Credentials and Account Validation](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/10-instagram-publishing-credentials-and-account-validation.md)
- Exact test steps and DB validation commands now live only in the archive record above.

### 11. `MVP-07` simple Instagram publish workflow

Archive entry:

- [11 — Simple Instagram Publish Workflow](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/11-simple-instagram-publish-workflow.md)

### 12. `MVP-08` publish metadata persistence and duplicate protection

Archive entry:

- [12 — Publish Metadata Persistence and Duplicate Protection](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/12-publish-metadata-persistence-and-duplicate-protection.md)

### 13. `MVP-09` smoke test and publish runbook

Archive entry:

- [13 — Smoke Test and Publish Runbook](/Users/rajchodisetti/n8n-insta/delivery-testing/completed-items/13-smoke-test-and-publish-runbook.md)
- Primary runbook: [18 — MVP Smoke Test and Publish Runbook](/Users/rajchodisetti/n8n-insta/18-mvp-smoke-test-and-publish-runbook.md)

## Next Item After MVP Completion

- choose the first Phase 2 improvement from [16 — Engineering Backlog](/Users/rajchodisetti/n8n-insta/16-engineering-backlog.md)
