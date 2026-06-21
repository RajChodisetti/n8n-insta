# Provider Routing Rules

Use for model, provider, adapter, host-provider, and render-provider decisions.

## Blocking

- If a selected provider is not implemented for a component, fail fast instead of silently falling back to a different provider.
- Do not call paid external APIs for documentation, fixture, or contract-only sessions.

## Must

- Provider-specific responses must be normalized to the repo's stable asset, script, storyboard, render, or cost shape before downstream use.
- Keep provider selector environment variable names stable unless all callers, docs, and validation commands are updated.
- Do not expose provider API keys, service account material, or runtime env values in prompts, fixtures, logs, or docs.

## Should

- Keep provider branching in helper scripts/adapters, not scattered through n8n workflow JSON.
- Keep provider-specific syntax out of global prompt contracts when an adapter can translate it.

## Preference

- Prefer adapter-level capability flags over broad provider assumptions.
