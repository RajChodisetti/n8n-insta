# Approval Rules

Use for final QA, selected render approval, retry decisions, and publish gates.

## Blocking

- Publish must require approval for the exact selected render, not any successful render.
- Missing script, assets, narration, render output, caption, QA pass, consent, license, public URL, or account match must block publish.
- Rejections must not silently fall through to publishable states.

## Must

- Approval records must include platform, package type, selected render, QA status, approval status, approved_by, approved_at, and platform account ID.
- QA must name the failed upstream stage or contract for every blocker.
- Preserve partial artifacts for review and resume.

## Should

- Approval/rejection notes should be concise and auditable.
- Manual approval should remain explicit in Studio/API flows.

## Preference

- Prefer small review packages that a human can inspect quickly.
