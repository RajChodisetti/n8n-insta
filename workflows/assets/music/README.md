Place subtle, royalty-cleared background tracks in this directory and describe them in `library.json`.

How selection works:
- The render worker reads `BACKGROUND_MUSIC_LIBRARY_JSON` from `.env`.
- It scores tracks against the reel category, hook, narration excerpt, prompt-profile music direction, scene moods, and style notes.
- It skips catalog entries where `license_status` is `unknown` or `publish_allowed` is not `true`.
- It prefers instrumental tracks and ducks them under narration during render.
- If no track matches, or music fails, the reel still renders with narration only.

Recommended track rules:
- Use instrumental beds only. Avoid vocals.
- Keep arrangements subtle and cinematic.
- Favor clean loops or long beds with gentle intros/outros.
- Avoid heavy hits that fight the narration.
- Keep filenames stable once referenced from `library.json`.

License note:
- The classical/Wikimedia tracks in this folder are public domain or CC0.
- The modern `*-mixkit.mp3` tracks are under the Mixkit Stock Music Free License, not public domain.
- Use the Mixkit tracks as embedded background music inside videos. Treat them as project assets, not as standalone music you redistribute on their own.

Catalog fields:
- `id`: stable internal id
- `title`: human-friendly name
- `relative_path`: file path relative to this folder, for local tracks
- `url`: hosted music URL, for remotely hosted tracks
- `categories`: top-level topics like `history`, `war`, `mystery`, `horror`
- `tags`: texture/style words like `somber`, `archival`, `tense`, `ambient`, `documentary`
- `moods`: scene-level emotional matches
- `vocals`: should usually be `false`
- `license`: human-readable license label
- `license_status`: one of `documented`, `licensed`, `public_domain`, `cc0`, or `unknown`
- `publish_allowed`: must be `true` for render-worker selection
- `license_scope`: short statement of the allowed use
- `license_notes`: repo-local review note
- `allowed_uses`: list of allowed project uses
- `disallowed_uses`: list of blocked uses, such as standalone redistribution
- `volume`: optional per-track override, from `0` to `1`
- `fade_in_seconds`: optional fade-in override
- `fade_out_seconds`: optional fade-out override
- `default`: optional fallback track

Validation:

```bash
jq empty workflows/assets/music/library.json
node scripts/validate_music_library.mjs workflows/assets/music/library.json
```

No SFX catalog exists yet. Add one only when there are real licensed SFX assets to catalog.

Start by copying the example shape from `library.sample.json` into `library.json`, then add your actual files.
