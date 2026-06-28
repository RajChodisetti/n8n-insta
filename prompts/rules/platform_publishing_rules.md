# Platform Publishing Rules

Use for captions, hashtags, approval, publish rows, public URLs, and Instagram Graph publishing.

## Blocking

- Live publish must not run unless publish is explicitly enabled and required credentials/account IDs are present.
- Publishable media URLs must be public HTTPS URLs, not local/private hosts.
- Do not publish if an existing media ID or published timestamp indicates prior publication.
- Do not publish without selected-render approval, passing QA, approved_by, approved_at, and matching platform account.

## Must

- Keep caption and hashtags cleanly separable until final composition.
- Verify platform account matching against client/account context when present.
- Preserve publish errors and partial IDs for audit/retry.

## Should

- Keep captions compact and aligned with the story angle.
- Use relevant non-duplicative hashtags.

## Preference

- Prefer clear human captions over growth-hack phrasing.
