# 08 — Rendering Contract

This document defines the contract between n8n and the rendering layer.

## Goal

n8n prepares a render manifest.
The render worker consumes the manifest and returns final output file references.

## Why this separation exists

- keeps n8n lightweight
- isolates FFmpeg complexity
- allows easier scaling and debugging
- makes render retries independent from orchestration logic

## Render input contract

The render worker should accept a payload shaped like this:

```json
{
  "content_id": "uuid",
  "output": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "format": "mp4"
  },
  "timeline": [
    {
      "scene_number": 1,
      "asset_url": "https://...",
      "asset_type": "video",
      "start_time": 0,
      "duration_seconds": 4,
      "transition": "fade",
      "is_face_image": true,
      "face_image_title": "Story Title"
    }
  ],
  "audio": {
    "narration_url": "https://...",
    "music_url": "https://...",
    "music_volume": 0.15
  },
  "subtitles": {
    "enabled": true,
    "subtitle_lines": [
      {
        "start_time": 0,
        "end_time": 2.5,
        "text": "In 1872, a ship was found drifting in the Atlantic."
      }
    ],
    "style": "default_story_subtitles"
  },
  "cover": {
    "enabled": true,
    "cover_asset_url": "https://..."
  },
  "storage": {
    "output_path": "reels/content_id/final.mp4"
  }
}
```

## Render manifest v2 bridge

Session 16 adds a renderer-neutral bridge contract in `prompts/workflow/render_manifest_v2.md` with schema `prompts/schemas/render_manifest_v2.schema.json`.

This contract is not active runtime wiring yet. The current n8n render manifest construction workflow still writes `renders.render_manifest_json`, and dispatch workflows still lower that manifest into the local FFmpeg render-worker request shape.

The bridge exists to describe a richer render plan while preserving current FFmpeg compatibility:

| v2 bridge field | Current FFmpeg request field | Notes |
| --- | --- | --- |
| `output` / `export_settings` | `output` | Width, height, FPS, format, and 9:16 aspect ratio must match. |
| `scenes` and visual `timeline` entries | `timeline[]` | Each scene lowers to one visual timeline entry with `asset_url`, `start_time`, and `duration_seconds`. |
| per-scene narration assets | `timeline[].narration_url` plus `audio.narration.mode = "per_scene"` | Current worker supports per-scene narration and may adjust timing from measured audio duration. |
| music `audio_tracks` | `audio.music_url`, `music_volume`, and fade fields | License metadata must be known and publish-allowed before publish. |
| `caption_tracks` | `subtitles.subtitle_lines` | The worker can render subtitles when enabled; current workflow defaults may still disable them. |
| title/text `overlays` | `title_overlay` or future renderer overlay fields | Readable text stays renderer-owned, not generated inside image/video assets. |
| `storage.output_path` | `storage.output_path` | Must remain a relative object path for hosted render output. |
| `quality_gates` | QA/validation inputs | Contract examples only until workflow wiring consumes them. |

Validation for the bridge contract:

```bash
jq empty prompts/schemas/render_manifest_v2.schema.json
node scripts/validate_render_manifest_v2_fixture.mjs fixtures/ai-video/founder_explainer/expected_render_manifest_v2.json
node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_renderer_replacement.json
node scripts/validate_render_manifest_v2_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_render_manifest_v2_timeline_gap.json
```

Do not replace the FFmpeg renderer or require Remotion from this contract alone.

## Remotion edit-plan bridge

Session 17 adds a Remotion-compatible edit-plan contract in `prompts/workflow/remotion_edit_plan.md` with schema `prompts/schemas/remotion_edit_plan.schema.json`.

This is a planning contract only. It can express a future Remotion composition with frame-based scene sequences, captions, overlays, lower thirds, audio tracks, transitions, brand elements, export settings, and fallback behavior, but it does not install Remotion or change active rendering.

The edit plan must keep `runtime_policy.plan_only = true`, `runtime_policy.install_remotion_now = false`, `runtime_policy.replaces_ffmpeg = false`, and an active `local_ffmpeg` fallback plan. Future-only Remotion commands in fixtures are not current setup instructions.

Validation for the edit-plan contract:

```bash
jq empty prompts/schemas/remotion_edit_plan.schema.json
node scripts/validate_remotion_edit_plan_fixture.mjs fixtures/ai-video/founder_explainer/expected_remotion_edit_plan.json
node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_runtime_install.json
node scripts/validate_remotion_edit_plan_fixture.mjs --expect-fail fixtures/ai-video/founder_explainer/invalid_remotion_edit_plan_frame_gap.json
```

## Render output contract

The render worker should return:

```json
{
  "content_id": "uuid",
  "render_status": "success",
  "output_video_url": "https://.../final.mp4",
  "cover_image_url": "https://.../cover.jpg",
  "duration_seconds": 41.2,
  "resolution": "1080x1920",
  "render_log": "optional render log or ID"
}
```

On failure:

```json
{
  "content_id": "uuid",
  "render_status": "failed",
  "error_message": "reason here",
  "render_log": "optional details"
}
```

## Render rules

### Face Image (Scene 1)

The first scene in the timeline may include optional `is_face_image` and `face_image_title` fields:
- `is_face_image` (boolean): indicates this is the opening "face image" scene
- `face_image_title` (string): the short title text (2-5 words) to be displayed in the middle of the image

When `is_face_image` is true and `face_image_title` is provided:
- the generated visual asset should remain text-free
- the renderer should add the centered title overlay using `face_image_title`
- the title text serves as the face of the reel, immediately hooking the viewer

When `is_face_image` is false or not present:
- render normally without any additional title treatment
- follow subtitle rules as normal for that scene

### Required output
- 9:16 aspect ratio
- vertical Reel-ready MP4
- stable playback
- synchronized audio
- readable subtitles

### Recommended defaults
- 1080 x 1920
- H.264 video
- AAC audio
- 30 fps
- clean burned-in subtitles
- face image title rendered as overlay from `face_image_title` metadata

## Subtitle rules

- large enough to read on mobile
- high contrast
- avoid too many words per frame
- keep safe margin from bottom UI overlay areas

## Music rules

- low enough that narration stays clear
- same mood family across account
- should not overpower pacing

## Validation checks before publish

The render worker or QA workflow should verify:
- output file exists
- correct aspect ratio
- narration present
- duration within expected range
- subtitles included when required
- no corrupted file/container issue

## Retry strategy

If render fails:
1. log error
2. preserve manifest
3. allow re-run without regenerating upstream content unless needed

## Local development recommendation

Start with a simple worker that:
- reads a JSON manifest
- downloads assets
- renders with FFmpeg
- uploads output to storage
- returns output URLs
