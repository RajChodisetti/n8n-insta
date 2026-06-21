#!/usr/bin/env python3

import base64
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlparse

import boto3
import requests
from flask import Flask, jsonify, request
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account


app = Flask(__name__)
executor = ThreadPoolExecutor(max_workers=max(1, int(os.environ.get("RENDER_WORKER_CONCURRENCY", "1"))))
active_jobs = {}
active_jobs_lock = threading.Lock()
google_cloud_storage_credentials = None
google_cloud_storage_credentials_path = None


def utc_now():
    return datetime.now(timezone.utc)


def iso_basic(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def slugify(value: str, fallback: str) -> str:
    normalized = "".join(ch.lower() if ch.isalnum() else "-" for ch in (value or fallback))
    collapsed = "-".join(filter(None, normalized.split("-")))
    return (collapsed[:64] or fallback)


def require_string(name: str, value) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{name} is required.")
    return normalized


def normalize_provider(value: str, fallback: str) -> str:
    normalized = str(value or "").strip().lower()
    return normalized or str(fallback or "").strip().lower()


def parse_bool(value, default: bool = False) -> bool:
    if value is None:
        normalized = ""
    else:
        normalized = str(value).strip().lower()
    if normalized in ("1", "true", "yes", "on"):
        return True
    if normalized in ("0", "false", "no", "off"):
        return False
    return default


def parse_float(value, default: float) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def select_asset_host_provider(component: str) -> str:
    mapping = {
        "render_output": [
            "RENDER_OUTPUT_HOST_PROVIDER",
            "ASSET_HOST_PROVIDER",
            "IMAGE_HOST_PROVIDER",
        ]
    }
    for key in mapping.get(component, []):
        value = (os.environ.get(key) or "").strip()
        if value:
            normalized = normalize_provider(value, "object_storage")
            if normalized in ("gcs", "google-cloud-storage"):
                return "google_cloud_storage"
            if normalized in ("minio", "s3"):
                return "object_storage"
            return normalized
    return "object_storage"


def select_render_provider(job_request: dict) -> str:
    return normalize_provider(
        job_request.get("render_provider") or os.environ.get("RENDER_PROVIDER"),
        "local_ffmpeg",
    )


def normalize_public_base_url(value: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise ValueError("REELS_STORAGE_PUBLIC_BASE_URL is required for render output delivery.")
    parsed = urlparse(normalized)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("REELS_STORAGE_PUBLIC_BASE_URL must be a valid http(s) URL.")
    return normalized.rstrip("/")


def encode_object_key(key: str) -> str:
    return "/".join(quote(segment, safe="") for segment in key.split("/") if segment)


def build_public_object_url(base_url: str, bucket: str, object_key: str) -> str:
    parsed = urlparse(base_url)
    base_path = parsed.path.rstrip("/")
    encoded_bucket = quote(bucket, safe="")
    encoded_key = encode_object_key(object_key)
    path = f"{base_path}/{encoded_bucket}/{encoded_key}".replace("//", "/")
    return parsed._replace(path=path, query="", fragment="").geturl()


def encode_query(params: dict) -> str:
    parts = []
    for key, value in params.items():
        if value in (None, ""):
            continue
        parts.append(f"{quote(str(key), safe='')}={quote(str(value), safe='')}")
    return "&".join(parts)


def read_json_response(response: requests.Response) -> dict:
    try:
        return response.json()
    except Exception:
        return {"raw": response.text}


def render_object_key(content_id: str, title: str, extension: str) -> str:
    now = utc_now()
    prefix = os.environ.get("REELS_STORAGE_KEY_PREFIX", "generated/instagram-posts").strip().strip("/")
    title_slug = slugify(title, "story")
    return (
        f"{prefix}/renders/{now.year}/{now.month:02d}/"
        f"{iso_basic(now)}-{content_id}-{title_slug}.{extension}"
    )


def background_music_enabled() -> bool:
    return parse_bool(os.environ.get("BACKGROUND_MUSIC_ENABLED"), True)


def background_music_library_path() -> Path:
    return Path((os.environ.get("BACKGROUND_MUSIC_LIBRARY_JSON") or "/workflows/assets/music/library.json").strip())


def safe_read_json_file(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def tokenize_text(value: str) -> set[str]:
    return {
        token
        for token in "".join(ch.lower() if ch.isalnum() else " " for ch in str(value or "")).split()
        if len(token) >= 3
    }


def normalize_music_catalog_entry(entry: dict) -> dict | None:
    if not isinstance(entry, dict):
        return None
    if parse_bool(entry.get("enabled"), True) is False:
        return None
    track_id = str(entry.get("id") or "").strip()
    if not track_id:
        return None
    url = str(entry.get("url") or "").strip() or None
    if not url:
        return None
    return {
        "id": track_id,
        "title": str(entry.get("title") or track_id).strip(),
        "local_path": None,
        "url": url,
        "categories": [str(value).strip().lower() for value in entry.get("categories", []) if str(value).strip()],
        "tags": [str(value).strip().lower() for value in entry.get("tags", []) if str(value).strip()],
        "moods": [str(value).strip().lower() for value in entry.get("moods", []) if str(value).strip()],
        "vocals": parse_bool(entry.get("vocals"), False),
        "default": parse_bool(entry.get("default"), False),
        "volume": max(0.0, min(parse_float(entry.get("volume"), parse_float(os.environ.get("BACKGROUND_MUSIC_DEFAULT_VOLUME"), 0.12)), 1.0)),
        "fade_in_seconds": max(0.0, parse_float(entry.get("fade_in_seconds"), parse_float(os.environ.get("BACKGROUND_MUSIC_FADE_IN_SECONDS"), 0.8))),
        "fade_out_seconds": max(0.0, parse_float(entry.get("fade_out_seconds"), parse_float(os.environ.get("BACKGROUND_MUSIC_FADE_OUT_SECONDS"), 2.5))),
    }


def load_background_music_catalog() -> tuple[list[dict], Path]:
    catalog_path = background_music_library_path()
    parsed = safe_read_json_file(catalog_path)
    if not isinstance(parsed, list):
        return [], catalog_path
    entries = []
    for entry in parsed:
        normalized = normalize_music_catalog_entry(entry)
        if normalized is not None:
            entries.append(normalized)
    return entries, catalog_path


def build_background_music_context(job_request: dict) -> dict:
    music_context = job_request.get("music_context") or {}
    scene_moods = music_context.get("scene_moods") or []
    if not isinstance(scene_moods, list):
        scene_moods = []
    context_text = "\n".join(
        filter(
            None,
            [
                str(job_request.get("title") or "").strip(),
                str(music_context.get("category") or "").strip(),
                str(music_context.get("selected_hook") or "").strip(),
                str(music_context.get("narration_script_excerpt") or "").strip(),
                str(music_context.get("scene_prompt_summary") or "").strip(),
                str(music_context.get("prompt_profile_summary") or "").strip(),
                str(music_context.get("background_music_direction") or "").strip(),
                str(music_context.get("narration_style") or "").strip(),
                str(music_context.get("style_notes") or "").strip(),
                " ".join(str(value).strip() for value in scene_moods if str(value).strip()),
            ],
        )
    )
    return {
        "category": str(music_context.get("category") or "").strip().lower(),
        "tokens": tokenize_text(context_text),
        "background_music_direction": str(music_context.get("background_music_direction") or "").strip().lower(),
        "scene_moods": [str(value).strip().lower() for value in scene_moods if str(value).strip()],
    }


def score_background_music_track(track: dict, context: dict) -> tuple[float, list[str]]:
    score = 0.0
    reasons = []
    category = context.get("category") or ""
    if category and category in track.get("categories", []):
        score += 5.0
        reasons.append(f"category:{category}")
    track_tokens = set(track.get("categories", [])) | set(track.get("tags", [])) | set(track.get("moods", [])) | tokenize_text(track.get("title") or "") | tokenize_text(track.get("id") or "")
    matched_tokens = sorted(context.get("tokens", set()) & track_tokens)
    if matched_tokens:
        score += min(8.0, float(len(matched_tokens)) * 1.5)
        reasons.extend(f"token:{token}" for token in matched_tokens[:6])
    if any(mood in track.get("moods", []) for mood in context.get("scene_moods", [])):
        score += 2.0
        reasons.append("scene_mood_match")
    if "no vocals" in context.get("background_music_direction", "") and not track.get("vocals", False):
        score += 2.0
        reasons.append("instrumental")
    if not track.get("vocals", False):
        score += 1.0
    if track.get("default"):
        score += 0.25
    return score, reasons


def select_background_music_track(job_request: dict) -> dict | None:
    if not background_music_enabled():
        return None
    catalog, _catalog_path = load_background_music_catalog()
    if not catalog:
        return None
    context = build_background_music_context(job_request)
    scored = []
    for track in catalog:
        score, reasons = score_background_music_track(track, context)
        scored.append((score, len(reasons), track, reasons))
    scored.sort(key=lambda item: (item[0], item[1], item[2].get("default", False)), reverse=True)
    best_score, _reason_count, best_track, reasons = scored[0]
    if best_score <= 0 and not best_track.get("default"):
        return None
    return {
        **best_track,
        "selection_reasons": reasons,
        "selection_score": round(best_score, 2),
    }


def resolve_background_music_source(render_request: dict, workspace: Path) -> dict | None:
    audio = render_request.get("audio") or {}
    explicit_path = str(audio.get("music_path") or "").strip()
    explicit_url = str(audio.get("music_url") or "").strip()
    volume = max(0.0, min(parse_float(audio.get("music_volume"), parse_float(os.environ.get("BACKGROUND_MUSIC_DEFAULT_VOLUME"), 0.12)), 1.0))
    fade_in_seconds = max(0.0, parse_float(audio.get("music_fade_in_seconds"), parse_float(os.environ.get("BACKGROUND_MUSIC_FADE_IN_SECONDS"), 0.8)))
    fade_out_seconds = max(0.0, parse_float(audio.get("music_fade_out_seconds"), parse_float(os.environ.get("BACKGROUND_MUSIC_FADE_OUT_SECONDS"), 2.5)))

    if explicit_path:
        candidate = Path(explicit_path)
        if candidate.is_file():
            return {
                "id": "explicit_music_path",
                "title": candidate.stem,
                "local_path": str(candidate),
                "volume": volume,
                "fade_in_seconds": fade_in_seconds,
                "fade_out_seconds": fade_out_seconds,
                "source": "explicit_path",
            }

    if explicit_url:
        extension = Path(urlparse(explicit_url).path).suffix or ".mp3"
        music_path = workspace / f"background_music{extension}"
        download_file(explicit_url, music_path)
        return {
            "id": "explicit_music_url",
            "title": music_path.stem,
            "local_path": str(music_path),
            "url": explicit_url,
            "volume": volume,
            "fade_in_seconds": fade_in_seconds,
            "fade_out_seconds": fade_out_seconds,
            "source": "explicit_url",
        }

    selected = select_background_music_track(render_request)
    if selected is None:
        return None
    if selected.get("url") and not selected.get("local_path"):
        extension = Path(urlparse(selected["url"]).path).suffix or ".mp3"
        music_path = workspace / f"background_music{extension}"
        download_file(selected["url"], music_path)
        selected = {
            **selected,
            "local_path": str(music_path),
        }
    if not selected.get("local_path"):
        return None
    return selected


def download_file(url: str, destination: Path) -> None:
    response = requests.get(url, stream=True, timeout=120)
    response.raise_for_status()
    with destination.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                handle.write(chunk)


def build_srt_entries(render_request: dict) -> list[dict]:
    timeline = render_request.get("timeline") or []
    subtitle_lines = ((render_request.get("subtitles") or {}).get("subtitle_lines")) or []
    lines_by_scene = {}
    for line in subtitle_lines:
        try:
            scene_number = int(line.get("scene_number"))
        except Exception:
            continue
        text = str(line.get("text") or "").strip()
        if text:
            lines_by_scene[scene_number] = text

    entries = []
    for index, scene in enumerate(timeline):
        scene_number = int(scene.get("scene_number") or index + 1)
        text = lines_by_scene.get(scene_number, "").strip()
        if not text:
            continue
        start = float(scene.get("start_time", 0) or 0)
        duration = float(scene.get("duration_seconds", 0) or 0)
        end = max(start + duration, start + 0.5)
        entries.append(
            {
                "index": len(entries) + 1,
                "start": start,
                "end": end,
                "text": text,
            }
        )
    return entries


def format_srt_timestamp(seconds: float) -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    hours = total_ms // 3_600_000
    minutes = (total_ms % 3_600_000) // 60_000
    secs = (total_ms % 60_000) // 1000
    millis = total_ms % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def write_srt(entries: list[dict], destination: Path) -> None:
    lines = []
    for entry in entries:
        lines.extend(
            [
                str(entry["index"]),
                f"{format_srt_timestamp(entry['start'])} --> {format_srt_timestamp(entry['end'])}",
                entry["text"],
                "",
            ]
        )
    destination.write_text("\n".join(lines), encoding="utf-8")


def title_overlay_enabled(render_request: dict) -> bool:
    overlay = render_request.get("title_overlay")
    if isinstance(overlay, dict) and "enabled" in overlay:
        return parse_bool(overlay.get("enabled"), True)
    return parse_bool(os.environ.get("RENDER_OPENING_TITLE_OVERLAY_ENABLED"), True)


def normalize_title_overlay_text(render_request: dict) -> str:
    overlay = render_request.get("title_overlay") or {}
    configured_text = overlay.get("text") if isinstance(overlay, dict) else None
    title = str(configured_text or render_request.get("title") or "").strip()
    return " ".join(title.split())


def compact_title_overlay_text(text: str, max_words: int = 5) -> str:
    normalized = " ".join(str(text or "").split())
    if not normalized:
        return ""
    words = normalized.split()
    if len(words) <= max_words:
        return normalized
    return " ".join(words[:max_words])


def wrap_title_overlay_text(text: str, max_line_chars: int = 22, max_lines: int = 2) -> str:
    words = [word for word in str(text or "").split() if word]
    if not words:
        return ""

    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_line_chars:
            lines.append(current)
            current = word
        else:
            current = candidate
        if len(lines) >= max_lines:
            break

    if current and len(lines) < max_lines:
        lines.append(current)

    remaining_word_count = len(words) - sum(len(line.split()) for line in lines)
    if remaining_word_count > 0 and lines:
        lines[-1] = f"{lines[-1].rstrip('.')}..."

    return "\n".join(lines)


def escape_drawtext_text(value: str) -> str:
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace(",", "\\,")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace(";", "\\;")
        .replace("'", "\\'")
        .replace("%", "\\%")
        .replace("\n", "\\n")
    )


def build_title_overlay_filter(render_request: dict, width: int, height: int) -> str | None:
    if not title_overlay_enabled(render_request):
        return None

    title_raw = wrap_title_overlay_text(compact_title_overlay_text(normalize_title_overlay_text(render_request)))
    if not title_raw:
        return None

    title = title_raw.upper()  # uppercase for visual impact

    overlay = render_request.get("title_overlay") or {}

    # Adaptive font size: fit longest line within 80% of canvas width.
    # DejaVu Sans Bold average char width ≈ 0.58 × fontsize.
    lines = title.split("\n")
    max_chars = max(len(line) for line in lines) if lines else 1
    target_px = width * 0.80
    adaptive = int(target_px / max(max_chars, 1) / 0.58)
    default_font_size = max(52, min(130, adaptive))
    font_size = int(max(48, min(138, parse_float(
        (overlay.get("font_size") if isinstance(overlay, dict) else None),
        default_font_size,
    ))))

    line_spacing = int(max(8, min(36, parse_float(
        (overlay.get("line_spacing") if isinstance(overlay, dict) else None),
        max(14, round(font_size * 0.22)),
    ))))

    # Estimate bar height from font_size + line_spacing + padding
    num_lines = len(lines)
    estimated_text_h = font_size * num_lines + line_spacing * max(0, num_lines - 1)
    bar_pad = max(22, round(font_size * 0.32))
    bar_height = estimated_text_h + bar_pad * 2
    bar_y = f"(h-{bar_height})/2"

    font_color = str(
        (overlay.get("font_color") if isinstance(overlay, dict) else None) or "white"
    ).strip() or "white"

    overlay_duration_seconds = max(0.5, min(4.0, parse_float(
        (overlay.get("duration_seconds") if isinstance(overlay, dict) else None),
        parse_float(os.environ.get("RENDER_OPENING_TITLE_OVERLAY_SECONDS"), 4.0),
    )))
    enable_expr = f"lte(t,{overlay_duration_seconds:.3f})"

    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

    drawbox = (
        f"drawbox=x=0:y={bar_y}:w=iw:h={bar_height}"
        ":color=0x000000@0.78:t=fill"
        f":enable='{enable_expr}'"
    )
    drawtext = (
        "drawtext="
        f"fontfile={font_path}"
        f":text='{escape_drawtext_text(title)}'"
        f":fontcolor={font_color}"
        f":fontsize={font_size}"
        f":line_spacing={line_spacing}"
        ":box=0"
        ":shadowcolor=0x000000@0.95"
        ":shadowx=3"
        ":shadowy=4"
        ":x=(w-text_w)/2"
        ":y=(h-text_h)/2"
        f":enable='{enable_expr}'"
    )

    return f"{drawbox},{drawtext}"


def measure_audio_duration(audio_path: Path) -> float:
    command = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json",
        str(audio_path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        return 0.0
    try:
        parsed = json.loads(completed.stdout or "{}")
        return float((parsed.get("format") or {}).get("duration") or 0)
    except (ValueError, TypeError):
        return 0.0


def redistribute_scene_durations(timeline: list[dict], actual_duration: float) -> list[dict]:
    if not timeline or actual_duration <= 0:
        return timeline
    char_counts = [
        max(len(" ".join(str(line) for line in (scene.get("dialogue_lines") or []))), 1)
        for scene in timeline
    ]
    total_chars = sum(char_counts)
    return [
        {**scene, "duration_seconds": round((chars / total_chars) * actual_duration, 3)}
        for scene, chars in zip(timeline, char_counts)
    ]


def build_ffmpeg_command(
    scene_paths: list[Path],
    narration_path: Path | None,
    music_path: Path | None,
    subtitle_path: Path | None,
    timeline: list[dict],
    width: int,
    height: int,
    fps: int,
    output_path: Path,
    *,
    preset: str,
    music_volume: float = 0.12,
    music_fade_in_seconds: float = 0.8,
    music_fade_out_seconds: float = 2.5,
    title_overlay_filter: str | None = None,
    threads: int | None = None,
    scene_narration_paths: list[Path] | None = None,
) -> list[str]:
    command = ["ffmpeg", "-y"]
    for scene, scene_path in zip(timeline, scene_paths):
        duration = max(float(scene.get("duration_seconds") or 0), 0.5)
        is_video = str(scene_path).endswith('.mp4')
        if is_video:
            command.extend(["-i", str(scene_path)])
        else:
            command.extend(["-loop", "1", "-framerate", str(fps), "-t", f"{duration:.3f}", "-i", str(scene_path)])
    total_duration = max(sum(max(float(scene.get("duration_seconds") or 0), 0.5) for scene in timeline), 0.5)
    narr_start_index = len(scene_paths)
    if scene_narration_paths:
        for narr_path in scene_narration_paths:
            command.extend(["-i", str(narr_path)])
        next_index = narr_start_index + len(scene_narration_paths)
    else:
        command.extend(["-i", str(narration_path)])
        next_index = narr_start_index + 1
    music_index = None
    if music_path is not None:
        music_index = next_index
        command.extend(["-stream_loop", "-1", "-i", str(music_path)])

    filter_parts = []
    concat_inputs = []
    for index, scene in enumerate(timeline):
        duration = max(float(scene.get("duration_seconds") or 0), 0.5)
        scene_filters = [
            f"scale={width}:{height}:force_original_aspect_ratio=increase",
            f"crop={width}:{height}",
            "setsar=1",
            "format=yuv420p",
        ]
        if index == 0 and title_overlay_filter is not None:
            scene_filters.append(title_overlay_filter)
        scene_filters.extend(
            [
                f"trim=duration={duration:.3f}",
                "setpts=PTS-STARTPTS",
            ]
        )
        filter_parts.append(f"[{index}:v]{','.join(scene_filters)}[v{index}]")
        concat_inputs.append(f"[v{index}]")

    filter_parts.append(f"{''.join(concat_inputs)}concat=n={len(scene_paths)}:v=1:a=0[vcat]")
    video_map = "[vcat]"
    if subtitle_path is not None:
        subtitle_filter_path = str(subtitle_path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        style = "Alignment=2,MarginV=140,Outline=2,BorderStyle=3,FontSize=20"
        filter_parts.append(
            f"[vcat]subtitles='{subtitle_filter_path}':force_style='{style}'[vout]"
        )
        video_map = "[vout]"

    if scene_narration_paths:
        total_narr = len(scene_narration_paths)
        for i in range(total_narr):
            pad = ",apad=pad_dur=0.35" if i < total_narr - 1 else ""
            filter_parts.append(f"[{narr_start_index + i}:a]aresample=async=1:first_pts=0{pad}[sn{i}]")
        concat_narr = "".join(f"[sn{i}]" for i in range(total_narr))
        filter_parts.append(f"{concat_narr}concat=v=0:a=1:n={total_narr}[narr]")
    else:
        filter_parts.append(f"[{narr_start_index}:a]aresample=async=1:first_pts=0[narr]")
    audio_map = "[narr]"
    if music_index is not None:
        music_filters = [
            f"[{music_index}:a]aresample=async=1:first_pts=0",
            f"atrim=duration={total_duration:.3f}",
            f"volume={max(0.0, min(music_volume, 1.0)):.3f}",
        ]
        if music_fade_in_seconds > 0:
            music_filters.append(f"afade=t=in:st=0:d={music_fade_in_seconds:.3f}")
        effective_fade_out = min(max(music_fade_out_seconds, 0.0), total_duration)
        if effective_fade_out > 0:
            fade_start = max(total_duration - effective_fade_out, 0.0)
            music_filters.append(f"afade=t=out:st={fade_start:.3f}:d={effective_fade_out:.3f}")
        filter_parts.append(",".join(music_filters) + "[music]")
        filter_parts.append("[narr]asplit=2[narrduck][narrmix]")
        filter_parts.append(
            "[music][narrduck]sidechaincompress=threshold=0.03:ratio=10:attack=15:release=350:makeup=1[ducked]"
        )
        filter_parts.append(
            "[ducked][narrmix]amix=inputs=2:duration=first:dropout_transition=0,aresample=async=1:first_pts=0[aout]"
        )
        audio_map = "[aout]"

    command.extend(
        [
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            video_map,
            "-map",
            audio_map,
            "-c:v",
            "libx264",
            "-preset",
            preset,
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(fps),
        ]
    )
    if threads is not None and threads > 0:
        command.extend(["-threads", str(threads)])
    command.extend(
        [
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-shortest",
            str(output_path),
        ]
    )
    return command


def summarize_ffmpeg_failure(completed: subprocess.CompletedProcess[str], attempt_name: str) -> str:
    stderr_tail = (completed.stderr or "").strip()[-3000:]
    return f"{attempt_name} failed (exit={completed.returncode}): {stderr_tail or 'ffmpeg exited without stderr output'}"


def run_ffmpeg_render(
    render_request: dict,
    workspace: Path,
) -> dict:
    output = render_request.get("output") or {}
    width = int(output.get("width") or 1080)
    height = int(output.get("height") or 1920)
    fps = int(output.get("fps") or 30)
    timeline = render_request.get("timeline") or []
    if len(timeline) < 1:
        raise ValueError("render_request.timeline is empty.")

    scene_paths = []
    for index, scene in enumerate(timeline):
        asset_url = require_string(f"timeline[{index}].asset_url", scene.get("asset_url"))
        asset_type = str(scene.get("asset_type") or "").strip().lower()
        is_video_asset = asset_type == "video" or asset_url.lower().endswith(".mp4")
        if is_video_asset:
            scene_path = workspace / f"scene_{index + 1:02d}.mp4"
        else:
            scene_path = workspace / f"scene_{index + 1:02d}.jpg"
        download_file(asset_url, scene_path)
        scene_paths.append(scene_path)

    audio_section = render_request.get("audio") or {}
    narration_section = audio_section.get("narration") or {}
    is_per_scene = str(narration_section.get("mode") or "").strip() == "per_scene"

    scene_narration_paths = None
    narration_path = None

    if is_per_scene:
        scene_narration_paths = []
        updated_timeline = list(timeline)
        last_index = len(timeline) - 1
        for index, scene in enumerate(timeline):
            scene_number = int(scene.get("scene_number") or index + 1)
            scene_narration_url = str(scene.get("narration_url") or "").strip()
            if not scene_narration_url:
                raise ValueError(
                    f"Per-scene narration mode: timeline[{index}] (scene {scene_number}) is missing narration_url."
                )
            audio_path = workspace / f"narration_scene_{scene_number:02d}.mp3"
            download_file(scene_narration_url, audio_path)
            actual_duration = measure_audio_duration(audio_path)
            if actual_duration > 0:
                padded_duration = actual_duration if index == last_index else actual_duration + 0.35
                updated_timeline[index] = {**scene, "duration_seconds": padded_duration}
            scene_narration_paths.append(audio_path)
        timeline = updated_timeline
    else:
        narration_url = require_string(
            "audio.narration.storage_url",
            narration_section.get("storage_url") or audio_section.get("narration_url"),
        )
        narration_path = workspace / "narration.mp3"
        download_file(narration_url, narration_path)
        actual_narration_duration = measure_audio_duration(narration_path)
        if actual_narration_duration > 0:
            timeline = redistribute_scene_durations(timeline, actual_narration_duration)

    background_music = None
    background_music_resolution_error = None
    try:
        background_music = resolve_background_music_source(render_request, workspace)
    except Exception as error:
        background_music_resolution_error = str(error)

    subtitle_entries = build_srt_entries(render_request)
    subtitle_path = workspace / "subtitles.srt"
    if subtitle_entries and (render_request.get("subtitles") or {}).get("enabled", True):
        write_srt(subtitle_entries, subtitle_path)
    else:
        subtitle_path = None

    title_overlay_filter = build_title_overlay_filter(render_request, width, height)
    output_path = workspace / "final.mp4"
    attempts = [
        {
            "name": "primary",
            "subtitle_path": subtitle_path,
            "preset": "veryfast",
            "threads": None,
            "background_music": background_music,
        },
        {
            "name": "fallback_no_subtitles_single_thread",
            "subtitle_path": None,
            "preset": "ultrafast",
            "threads": 1,
            "background_music": background_music,
        },
    ]
    if background_music is not None:
        attempts.append(
            {
                "name": "voice_only_no_subtitles_single_thread",
                "subtitle_path": None,
                "preset": "ultrafast",
                "threads": 1,
                "background_music": None,
            }
        )
    failures = []
    background_music_failures = []

    for attempt in attempts:
        attempt_music = attempt.get("background_music")
        command = build_ffmpeg_command(
            scene_paths,
            narration_path,
            Path(attempt_music["local_path"]) if attempt_music is not None else None,
            attempt["subtitle_path"],
            timeline,
            width,
            height,
            fps,
            output_path,
            preset=attempt["preset"],
            music_volume=parse_float((attempt_music or {}).get("volume"), parse_float(os.environ.get("BACKGROUND_MUSIC_DEFAULT_VOLUME"), 0.12)),
            music_fade_in_seconds=parse_float((attempt_music or {}).get("fade_in_seconds"), parse_float(os.environ.get("BACKGROUND_MUSIC_FADE_IN_SECONDS"), 0.8)),
            music_fade_out_seconds=parse_float((attempt_music or {}).get("fade_out_seconds"), parse_float(os.environ.get("BACKGROUND_MUSIC_FADE_OUT_SECONDS"), 2.5)),
            title_overlay_filter=title_overlay_filter,
            threads=attempt["threads"],
            scene_narration_paths=scene_narration_paths,
        )
        completed = subprocess.run(command, cwd=workspace, capture_output=True, text=True)
        if completed.returncode == 0:
            return {
                "output_path": output_path,
                "render_attempt": attempt["name"],
                "background_music": attempt_music,
                "background_music_resolution_error": background_music_resolution_error,
                "background_music_failures": background_music_failures,
            }
        failure_summary = summarize_ffmpeg_failure(completed, attempt["name"])
        failures.append(failure_summary)
        if attempt_music is not None:
            background_music_failures.append(failure_summary)

    raise RuntimeError(f"ffmpeg render failed after {len(attempts)} attempt(s): {' | '.join(failures)}")


def ffprobe_summary(video_path: Path) -> dict:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        str(video_path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {completed.stderr[-2000:]}")
    parsed = json.loads(completed.stdout or "{}")
    streams = parsed.get("streams") or []
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    duration = float((parsed.get("format") or {}).get("duration") or 0)
    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    return {
        "duration_seconds": round(duration, 2),
        "resolution": f"{width}x{height}" if width and height else "",
        "width": width,
        "height": height,
    }


def normalize_required_url(name: str, value: str) -> str:
    normalized = require_string(name, value).rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"{name} must be a valid http(s) URL.")
    return normalized


def get_google_cloud_storage_credentials():
    global google_cloud_storage_credentials, google_cloud_storage_credentials_path

    key_path = require_string(
        "GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH",
        os.environ.get("GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH") or "/secrets/google/sa-key.json",
    )
    if google_cloud_storage_credentials is None or google_cloud_storage_credentials_path != key_path:
        google_cloud_storage_credentials = service_account.Credentials.from_service_account_file(
            key_path,
            scopes=["https://www.googleapis.com/auth/devstorage.read_write"],
        )
        google_cloud_storage_credentials_path = key_path
    if not google_cloud_storage_credentials.valid:
        google_cloud_storage_credentials.refresh(GoogleAuthRequest())
    return google_cloud_storage_credentials


def upload_to_google_cloud_storage(file_path: Path, object_key: str, content_type: str) -> dict:
    endpoint = normalize_required_url(
        "GOOGLE_CLOUD_STORAGE_ENDPOINT",
        os.environ.get("GOOGLE_CLOUD_STORAGE_ENDPOINT") or "https://storage.googleapis.com",
    )
    public_base_url = normalize_required_url(
        "GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL",
        os.environ.get("GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL") or "https://storage.googleapis.com",
    )
    bucket = require_string("GOOGLE_CLOUD_STORAGE_BUCKET", os.environ.get("GOOGLE_CLOUD_STORAGE_BUCKET"))
    credentials = get_google_cloud_storage_credentials()
    upload_url = (
        f"{endpoint}/upload/storage/v1/b/{quote(bucket, safe='')}/o"
        f"?uploadType=media&name={quote(object_key, safe='')}"
    )
    with file_path.open("rb") as handle:
        response = requests.post(
            upload_url,
            headers={
                "Authorization": f"Bearer {credentials.token}",
                "Content-Type": content_type,
            },
            data=handle,
            timeout=300,
        )
    if not response.ok:
        raise RuntimeError(f"Google Cloud Storage upload failed ({response.status_code}): {response.text[:4000]}")
    try:
        response_body = response.json()
    except Exception:
        response_body = {}
    return {
        "mode": "google_cloud_storage",
        "public_base_url": public_base_url,
        "bucket": bucket,
        "endpoint": endpoint,
        "object_key": object_key,
        "url": build_public_object_url(public_base_url, bucket, object_key),
        "size": int(file_path.stat().st_size),
        "media_link": response_body.get("mediaLink"),
        "generation": response_body.get("generation"),
    }


def upload_to_object_storage(file_path: Path, object_key: str, content_type: str) -> dict:
    endpoint = require_string("REELS_STORAGE_ENDPOINT", os.environ.get("REELS_STORAGE_ENDPOINT"))
    bucket = require_string("REELS_STORAGE_BUCKET", os.environ.get("REELS_STORAGE_BUCKET"))
    access_key = require_string(
        "storage access key",
        os.environ.get("REELS_STORAGE_ACCESS_KEY_ID")
        or os.environ.get("AWS_ACCESS_KEY_ID")
        or os.environ.get("MINIO_ROOT_USER"),
    )
    secret_key = require_string(
        "storage secret key",
        os.environ.get("REELS_STORAGE_SECRET_ACCESS_KEY")
        or os.environ.get("AWS_SECRET_ACCESS_KEY")
        or os.environ.get("MINIO_ROOT_PASSWORD"),
    )
    region = (os.environ.get("REELS_STORAGE_REGION") or os.environ.get("AWS_REGION") or "us-east-1").strip() or "us-east-1"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
    )
    with file_path.open("rb") as handle:
        client.put_object(Bucket=bucket, Key=object_key, Body=handle, ContentType=content_type)
    public_base_url = normalize_public_base_url(os.environ.get("REELS_STORAGE_PUBLIC_BASE_URL"))
    return {
        "mode": "object_storage",
        "public_base_url": public_base_url,
        "bucket": bucket,
        "endpoint": endpoint,
        "region": region,
        "object_key": object_key,
        "url": build_public_object_url(public_base_url, bucket, object_key),
        "size": int(file_path.stat().st_size),
    }


def upload_render_output(file_path: Path, content_id: str, title: str) -> dict:
    provider = select_asset_host_provider("render_output")
    object_key = render_object_key(content_id, title, "mp4")
    if provider == "google_cloud_storage":
        return upload_to_google_cloud_storage(file_path, object_key, "video/mp4")
    if provider != "object_storage":
        raise RuntimeError(
            f"asset host provider '{provider}' is not implemented for render_output. "
            "Add an adapter implementation before selecting it in .env."
        )
    return upload_to_object_storage(file_path, object_key, "video/mp4")


def post_callback(payload: dict, callback_url: str) -> None:
    response = requests.post(callback_url, json=payload, timeout=120)
    response.raise_for_status()


def build_render_failure_payload(request_id: str, error: Exception, render_provider: str) -> dict:
    return {
        "render_status": "failed",
        "error_message": str(error),
        "render_log": json.dumps(
            {
                "request_id": request_id,
                "render_provider": render_provider,
                "worker_mode": render_provider,
                "failure": str(error),
            }
        ),
    }


def perform_render(job_request: dict) -> dict:
    request_id = require_string("request_id", job_request.get("request_id"))
    content_id = require_string("content_id", job_request.get("content_id"))
    title = require_string("title", job_request.get("title"))
    render_provider = select_render_provider(job_request)
    if render_provider != "local_ffmpeg":
        raise ValueError(
            f"render provider '{render_provider}' is not implemented for the local worker. "
            "Add a render adapter before selecting it in .env."
        )
    with tempfile.TemporaryDirectory(prefix=f"render-{content_id[:8]}-") as tmp:
        workspace = Path(tmp)
        render_result = run_ffmpeg_render(job_request, workspace)
        output_path = render_result["output_path"]
        summary = ffprobe_summary(output_path)
        uploaded = upload_render_output(output_path, content_id, title)
        return {
            "content_id": content_id,
            "render_status": "success",
            "output_video_url": uploaded["url"],
            "cover_image_url": ((job_request.get("cover") or {}).get("cover_asset_url") or "").strip(),
            "duration_seconds": summary["duration_seconds"],
            "resolution": summary["resolution"],
            "render_log": json.dumps(
                {
                    "request_id": request_id,
                    "render_provider": render_provider,
                    "worker_mode": render_provider,
                    "output_provider": uploaded["mode"],
                    "output_object_key": uploaded.get("object_key"),
                    "output_size_bytes": uploaded.get("size"),
                    "render_attempt": render_result.get("render_attempt"),
                    "background_music": render_result.get("background_music"),
                    "background_music_resolution_error": render_result.get("background_music_resolution_error"),
                    "background_music_failures": render_result.get("background_music_failures"),
                }
            ),
        }


def render_job(job_request: dict) -> None:
    request_id = require_string("request_id", job_request.get("request_id"))
    callback_url = require_string(
        "callback_url",
        job_request.get("callback_url") or os.environ.get("RENDER_CALLBACK_URL"),
    )
    content_id = require_string("content_id", job_request.get("content_id"))
    render_provider = select_render_provider(job_request)
    try:
        post_callback(perform_render(job_request), callback_url)
    except Exception as error:
        failed_payload = {
            "content_id": content_id,
            **build_render_failure_payload(request_id, error, render_provider),
        }
        post_callback(failed_payload, callback_url)
    finally:
        with active_jobs_lock:
            active_jobs.pop(request_id, None)


@app.get("/health")
def health():
    return jsonify({"ok": True, "active_jobs": len(active_jobs), "time": utc_now().isoformat()})


@app.post("/render")
def render():
    payload = request.get_json(force=True, silent=False)
    content_id = require_string("content_id", payload.get("content_id"))
    request_id = require_string("request_id", payload.get("request_id"))

    with active_jobs_lock:
        if request_id in active_jobs:
            return jsonify({"accepted": True, "request_id": request_id, "render_status": "queued", "message": "Request already queued."})
        active_jobs[request_id] = {"content_id": content_id, "queued_at": utc_now().isoformat()}

    executor.submit(render_job, payload)
    return jsonify(
        {
            "accepted": True,
            "request_id": request_id,
            "render_status": "queued",
            "message": "Render job accepted by local FFmpeg worker.",
        }
    )


@app.post("/render-sync")
def render_sync():
    payload = request.get_json(force=True, silent=False)
    request_id = require_string("request_id", payload.get("request_id"))
    try:
        result = perform_render(payload)
        result["request_id"] = request_id
        return jsonify(result)
    except Exception as error:
        render_provider = select_render_provider(payload)
        return jsonify(
            {
                "content_id": require_string("content_id", payload.get("content_id")),
                "request_id": request_id,
                **build_render_failure_payload(request_id, error, render_provider),
            }
        ), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("RENDER_WORKER_PORT", "8080")))
