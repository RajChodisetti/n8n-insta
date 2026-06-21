# Context Maintenance

Last reviewed: 2026-06-21 at git commit `0d0515b`.

Keep this context layer short, current, and route-oriented.

## Update rules

- Update [repo-map.md](repo-map.md) when top-level folders, major generated paths, or important docs move.
- Update [task-routing.md](task-routing.md) when new subsystems, workflow stages, provider areas, or validation paths are added.
- Update [architecture-summary.md](architecture-summary.md) when runtime components, data flow, provider support, or storage boundaries change.
- Update [commands-and-validation.md](commands-and-validation.md) when Docker commands, scripts, package scripts, CI, or required env groups change.
- Update [context-manifest.json](context-manifest.json) whenever context docs or major read routes change.
- Update folder `AGENTS.md`/`CONTEXT.md` files when that folder's responsibilities or gotchas change.

## Style rules

- Prefer short routing notes over exhaustive explanations.
- Link to source docs and implementation files instead of copying them.
- Record uncertainty instead of guessing.
- Mark inferred statements and explain the evidence briefly.
- Remove stale context when old flows are deleted or superseded.
- Keep root `AGENTS.md` small.
- Do not include secrets, API responses, long prompt bodies, or large code snippets.

## Review checklist

Before finishing a context update:

- `docs/ai-context/context-manifest.json` is valid JSON.
- New docs point to the smallest useful reading path.
- Commands are discoverable from repo files or clearly marked as not discovered.
- Generated, secret, and local state paths are not treated as implementation files.
- Ambiguous areas are labeled uncertain.
