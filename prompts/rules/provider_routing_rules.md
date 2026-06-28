# Provider Routing Rules

Use for model/provider selection, adapters, asset hosting, render providers, and cost-aware routing.

## Blocking

- If a selected provider is not implemented for a component, fail fast instead of silently using another provider.
- Do not expose API keys, service account material, tokens, or secret env values in prompts, fixtures, logs, docs, or UI copy.
- Do not call paid external APIs during docs-only, fixture-only, or contract-only work unless explicitly requested.

## Must

- Keep provider branching in adapter/helper code, not scattered through workflow prompts.
- Normalize provider outputs to repo contracts before downstream use.
- Keep environment selector names stable unless all callers and docs are updated.

## Should

- Prefer provider-neutral prompt contracts and adapter-level mapping.
- Record cost and provider metadata when a live call occurs.

## Preference

- Prefer simple, inspectable fallback plans over hidden automatic switching.
