# 14 — Instagram Professional Account Runbook

This runbook operationalizes the first unchecked setup backlog item:

- **Create or convert to professional Instagram account**

**Status: `complete`** ✅

Use this before wiring API publishing in n8n.

Related readiness workflow:

- [workflows/n8n/wf_instagram_publish_readiness.json](/Users/rajchodisetti/n8n-insta/workflows/n8n/wf_instagram_publish_readiness.json)

## Outcome

You have one Instagram account configured as a **Professional account** (Creator or Business), ready for Meta API-based publishing in v1.

**Completed:** Business account created, public, with Graph API token wiring in local dev.

## Preconditions

- You can sign in to the target Instagram account.
- You can access `Professional account` / `Creator tools and controls` in Instagram settings.

## Step-by-step

1. **Confirm target handle**
   - Record the exact Instagram handle to use for v1.
   - Confirm this handle will be the only publishing target in v1.

2. **Convert account type in Instagram app**
   - Open Instagram mobile app.
   - Go to `Settings and privacy` -> `Account type and tools`.
   - If currently personal, choose `Switch to professional account`.
   - Select category aligned with your content niche.
   - Choose account type:
     - `Creator` (recommended for content-first brands)
     - `Business` (recommended if ad/commerce-heavy)

3. **(Optional for now) Skip Facebook Page connection**
   - If your immediate goal is only to finish Creator conversion, you can skip Facebook Page connection now.
   - Keep this as a prerequisite for the later “API-driven publishing workflow” backlog item.

4. **Enable baseline profile readiness**
   - Add profile image, bio, and link placeholder.
   - Enable 2FA for account security.
   - Verify account is not private.

5. **Permissions readiness check**
   - Confirm account appears as Professional in account settings.
   - Confirm no policy, age, or country restrictions block professional features.

## Next steps after Creator account is complete

1. **Lock account security**
   - Turn on 2FA and verify backup methods.
   - Confirm recovery email/phone are current.

2. **Complete publishing profile basics**
   - Finalize bio, profile image, and link.
   - Keep account public.

3. **Prepare n8n prerequisites**
   - Decide hosted vs self-hosted n8n.
   - Define credential/secrets storage strategy.
   - Choose where rendered files are stored.

4. **Plan API publishing readiness (later step)**
   - Create/connect a Facebook Page when you start the publish-automation item.
   - Capture required metadata and ownership details for API onboarding.
   - Store Graph API tokens in local env / secret storage, never in committed files.
   - If you update the repo-root `.env`, recreate the `n8n` service so the running container picks up the latest token.
   - Run `bash scripts/check_instagram_permissions.sh` before testing in n8n. It validates the token in `.env`, compares it with the token loaded in the `n8n` container, and checks Meta permissions/page linkage.
   - If the readiness check returns OAuth error `190`, the current token is expired and must be refreshed before publish testing.

## Evidence checklist (attach to project docs)

- Screenshot or note confirming `Professional account` status.
- Screenshot or note confirming Creator tools visibility.
- Recorded Instagram handle for v1 scope.
- Note whether Facebook Page connection is intentionally deferred.

## Suggested owner + SLA

- **Owner:** channel operator
- **Target completion:** before any n8n publishing workflow implementation

## Definition of done

This backlog item is done when all are true:

- Account is Professional (Creator or Business)
- Account is public and secured with 2FA
- Evidence checklist is filled in project notes
