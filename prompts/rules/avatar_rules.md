# Avatar Rules

Use for avatar, presenter, likeness, synthetic host, and HeyGen-style video generation decisions.

## Blocking

- Do not use real likeness, voice, name, or endorsement without explicit consent metadata.
- Missing, ambiguous, expired, or out-of-scope consent must block avatar generation.
- Do not use avatar presenters for sensitive topics when the presenter framing would be deceptive, exploitative, or unsafe.
- Do not treat an uploaded character reference, face image, customer image, employee photo, or style reference as consent.
- Do not use celebrity similarity, public-figure likeness, customer testimonial framing, employee endorsement, or prospect-specific personalization unless the consent record explicitly covers that use.
- Do not proceed when provider avatar ID, voice ID, disclosure text, account avatar policy, or provider capability is missing or unclear.

## Consent And Policy

- Account policy must explicitly allow avatar use before runtime provider calls.
- Consent records must name or clearly cover the presenter, likeness/voice rights, allowed package type, usage restrictions, verification date, and revocation/expiration state when applicable.
- Synthetic presenters may use `not_required_synthetic` consent only when no real-person likeness, voice clone, name, or implied endorsement is used.
- Real-person avatar routes require consent status `granted`, a consent record URI, and provider identity that matches the consented presenter.
- Any disallowed use listed in account policy, presenter policy, or consent metadata blocks avatar generation.

## Disclosure

- Record disclosure requirements for caption, render metadata, final QA, and approval notes.
- Do not inject spoken disclosure into the narration script unless a future explicit script-rewrite stage authorizes it.
- Disclosure text must be plain and non-misleading, for example "Synthetic presenter used for demonstration."
- If disclosure text is required but absent, auto-downgrade to non-avatar video.

## Presenter Suitability

- Prefer avatar use only when a presenter materially improves clarity, trust, demonstration, or guided explanation.
- Avoid avatar presenters for tragedy, medical/legal/financial claims, political persuasion, crisis content, crime victim narration, or topics where a simulated person would feel deceptive.
- Keep sales/outreach avatar delivery respectful, low-pressure, and clearly synthetic when synthetic.
- Do not imply that the avatar personally experienced events, used a product, met a customer, or represents an employee unless approved by consent and account policy.

## Script Handling

- Keep avatar delivery direction separate from the clean spoken narration script.
- Do not rewrite narration, add spoken disclosure, add SSML, or insert bracketed stage directions into the script.
- Emotion, pacing, pauses, emphasis, and pronunciation guidance should be instructions to the provider or final QA, not audible words.

## Directional Technique

- Framing should be vertical Reel-safe, typically a medium close-up with eyes near the upper third and caption-safe lower space.
- Tone should sound human, warm, emotionally grounded, and appropriate to the story, without overacting or exaggerated sales energy.
- Gestures should be limited, natural, and supportive of the spoken point; avoid pointing at invisible UI, dramatic hand waving, or coercive body language.
- Motion prompts should be concise and provider-safe. Ask for subtle natural head movement, eye contact, and calm expression changes, not identity changes.
- Backgrounds should be simple, brand-safe, free of readable private information, and not imply a real office/customer location unless approved.
- Pacing should follow the narration beat and leave room for final render/caption stages.

## Provider Request Safety

- HeyGen request options may include aspect ratio, resolution, fit, background, captions/caption, output format, voice settings, motion prompt, expressiveness, and engine when supported.
- Do not include API keys, bearer tokens, auth headers, credentials, callback secrets, private URLs, or arbitrary provider commands in request options.
- Provider captions should normally be disabled when renderer/caption stages own subtitles.
- Use 9:16 vertical settings for Instagram Reels unless a later explicit render contract overrides it.

## Fallback Criteria

- Auto-downgrade to the normal video reel path when consent, account policy, provider config, disclosure, provider identity, topic suitability, or capability is missing or unclear.
- Auto-downgrade when the selector is uncertain; do not fail the generation run solely because avatar use is unavailable.
- Preserve requested intent as avatar while recording effective reel type as video and the fallback reason.

## Runtime And Publish Safety

- Avatar output is a generated asset route, not a publish route.
- Keep avatar route generation separate from publish approval.
- Final QA must receive consent/disclosure evidence, actual route, effective reel type, and fallback reason.
- Studio approval remains required before any publish action.
- Default to non-avatar video when rules conflict or evidence is incomplete.
