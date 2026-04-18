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
      "transition": "fade"
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

