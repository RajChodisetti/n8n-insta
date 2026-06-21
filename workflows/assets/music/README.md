Place subtle, royalty-cleared background tracks in this directory and describe them in `library.json`.

How selection works:
- The render worker reads `BACKGROUND_MUSIC_LIBRARY_JSON` from `.env`.
- It scores tracks against the reel category, hook, narration excerpt, prompt-profile music direction, scene moods, and style notes.
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
- `relative_path`: file path relative to this folder
- `categories`: top-level topics like `history`, `war`, `mystery`, `horror`
- `tags`: texture/style words like `somber`, `archival`, `tense`, `ambient`, `documentary`
- `moods`: scene-level emotional matches
- `vocals`: should usually be `false`
- `volume`: optional per-track override, from `0` to `1`
- `fade_in_seconds`: optional fade-in override
- `fade_out_seconds`: optional fade-out override
- `default`: optional fallback track

Start by copying the example shape from `library.sample.json` into `library.json`, then add your actual files.
