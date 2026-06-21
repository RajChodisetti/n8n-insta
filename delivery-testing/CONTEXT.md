# delivery-testing Context

## Purpose

This folder archives completed delivery/testing items and evidence from earlier implementation phases.

## When to read this

Read this only when you need historical context for why a workflow, prompt, smoke test, or runbook exists.

## Important files and subfolders

- `completed-items/README.md`: archive index.
- `completed-items/*.md`: per-item completion notes.

## Inputs

Historical implementation/test notes from prior phases.

## Outputs

Documentation evidence only.

## Depends on

Root delivery docs such as `docs/delivery/delivery-and-testing-workflow.md` and `docs/delivery/engineering-backlog.md`.

## Used by

Agents or maintainers reconstructing context around completed backlog work.

## Common change patterns

- Add an archive item only after a delivery item is complete and documented.
- Link back to current runbooks or source files when useful.

## Do not do

- Do not treat archive entries as the current source of truth if newer workflow files or runbooks disagree.
- Do not update archive history to describe uncompleted work.

## Validation

Docs-only validation. No command required.

## Gotchas

- Some archived notes refer to file names or workflow shapes that were later replaced.

## Uncertainties

- Current active state should be verified from `docs/runbooks/`, workflow files, and `docs/ai-context/current-focus.md`.

## Last reviewed

2026-06-21, git commit `0d0515b`.
