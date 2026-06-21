# AI Context Layer

This directory is a progressive-disclosure context layer for future AI coding agents. It routes agents to the smallest useful set of repo facts so they do not need to load the full repo, every runbook, or every workflow export.

## How to use this

1. Read root [AGENTS.md](../../AGENTS.md).
2. Read [task-routing.md](task-routing.md) for the task type.
3. Read only the docs and folder context cards named by that route.
4. Inspect implementation files only after the relevant context points to them.

Always-relevant docs:

- [repo-map.md](repo-map.md) for the top-level layout.
- [task-routing.md](task-routing.md) for what to read next.
- [commands-and-validation.md](commands-and-validation.md) before running validation.
- [known-risks-and-gotchas.md](known-risks-and-gotchas.md) before touching runtime, secrets, workflows, or provider code.

Task-specific docs:

- [architecture-summary.md](architecture-summary.md) for cross-system changes.
- [glossary.md](glossary.md) when stage names or provider terms are unclear.
- [current-focus.md](current-focus.md) before continuing active pipeline work.
- Folder cards such as [prompts/AGENTS.md](../../prompts/AGENTS.md), [workflows/AGENTS.md](../../workflows/AGENTS.md), [infra/AGENTS.md](../../infra/AGENTS.md), [studio-ui/AGENTS.md](../../studio-ui/AGENTS.md), [scripts/CONTEXT.md](../../scripts/CONTEXT.md), and [delivery-testing/CONTEXT.md](../../delivery-testing/CONTEXT.md).

## When to update context

Update this layer when:

- a folder's responsibility changes
- workflow stage order changes
- new prompt groups, adapters, providers, or storage paths are added
- package scripts, Docker commands, smoke tests, or CI commands change
- schema tables or important status names change
- generated, secret, or ignored paths change

## What not to duplicate

Do not copy whole runbooks, workflow JSON, prompt bodies, schemas, or implementation snippets here. Link to existing source docs and record only the routing, contracts, gotchas, and validation paths that help an agent decide what to read next.
