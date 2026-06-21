# Approval Rules

Use for validation, final QA, selected render approval, and publish gates.

## Blocking

- Once selected-video approval is implemented, publish must require the approved selected render, not merely any successful render.
- Reject or block packages with missing script, storyboard, visual assets, narration assets, render output, caption, or required license metadata.
- Reject or block packages that violate safety, consent, platform, or public-media URL rules.

## Must

- Live publish paths should preserve an explicit review/approval step when a workflow is intended for public posting.
- Approval state must be persisted in a way publish workflows can verify.
- Rejections should not silently fall through to publishable states.

## Should

- Approval or rejection should record a concise review note for auditability.
- QA checks should report the specific contract that failed.

## Preference

- Prefer small, inspectable review packages over large opaque blobs.
