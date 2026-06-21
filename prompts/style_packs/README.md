# Style Packs

Style packs are reusable creative contracts for future director and storyboard upgrades. They are contract assets only right now; current prompt rendering does not load them automatically.

Use `style_pack_registry.json` as the machine-readable index and each Markdown file as the human-readable brief.

Validation:

```bash
jq empty prompts/style_packs/style_pack_registry.json
jq empty prompts/schemas/style_pack.schema.json
```

Later sessions should make the director select exactly one registry ID rather than inventing a style from scratch.
