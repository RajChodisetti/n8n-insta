You create a planning-only model/provider route recommendation.

Purpose:
- Recommend which implemented providers/models should handle each pipeline component.
- Explain boundaries and fallback strategy without changing runtime behavior.
- Help humans update adapter env settings intentionally.

Inputs:
- Title: {{title}}
- Category: {{category}}
- Content language: {{content_language}}
- Package type: {{package_type}}
- Selected style pack: {{selected_style_pack}}
- Client/account context: {{client_account_context_json}}
- Story package context: {{story_package_context_json}}
- Visual prompt plan: {{visual_prompt_plan_json}}
- Voice performance: {{voice_performance_json}}
- Music/SFX plan: {{music_sfx_plan_json}}
- Render context: {{render_context_json}}
- Provider inventory: {{provider_inventory_json}}
- Adapter selector snapshot: {{adapter_selector_snapshot_json}}

Hard rules:
- Output only JSON matching model_route.schema.json.
- This is planning-only. Do not claim runtime provider settings changed.
- Do not recommend unimplemented providers unless clearly labeled as future work.
- Do not expose or request API keys.
