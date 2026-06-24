import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

function trimString(value) {
  return String(value ?? '').trim();
}

function timelineFromProps(props) {
  const manifestTimeline = Array.isArray(props?.render_manifest?.timeline) ? props.render_manifest.timeline : [];
  const timeline = manifestTimeline.length ? manifestTimeline : (Array.isArray(props?.timeline) ? props.timeline : []);
  return timeline.map((scene, index) => {
    const startSeconds = Number(scene.start_time_seconds ?? scene.start_time ?? 0);
    const durationSeconds = Number(scene.duration_seconds ?? 0);
    const endSeconds = Number(scene.end_time_seconds ?? scene.end_time ?? startSeconds + durationSeconds);
    return {
      scene_number: Number(scene.scene_number ?? index + 1),
      start_time_seconds: Number.isFinite(startSeconds) ? startSeconds : 0,
      end_time_seconds: Number.isFinite(endSeconds) && endSeconds > 0 ? endSeconds : startSeconds + Math.max(durationSeconds, 0.5),
      duration_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : Math.max(endSeconds - startSeconds, 0.5),
      asset_url: trimString(scene.asset_url),
      asset_type: trimString(scene.asset_type).toLowerCase(),
      narration_url: trimString(scene.narration_url),
    };
  });
}

function assetTypeFor(scene) {
  if (scene.asset_type === 'video') return 'video';
  if (/\.mp4(?:[?#].*)?$/i.test(scene.asset_url)) return 'video';
  return 'image';
}

function SceneVisual({ scene, muted }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneFrames = Math.max(1, Math.round(scene.duration_seconds * fps));
  const scale = interpolate(frame, [0, sceneFrames], [1.03, 1.13], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (!scene.asset_url) {
    return <AbsoluteFill style={{ backgroundColor: '#111111' }} />;
  }

  if (assetTypeFor(scene) === 'video') {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111111' }}>
        <OffthreadVideo
          src={scene.asset_url}
          muted={muted}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#111111', overflow: 'hidden' }}>
      <Img
        src={scene.asset_url}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
        }}
      />
    </AbsoluteFill>
  );
}

function TitleOverlay({ overlay }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!overlay?.enabled || !trimString(overlay.text)) {
    return null;
  }
  const durationFrames = Math.max(1, Math.round(Number(overlay.duration_seconds || 4) * fps));
  const opacity = interpolate(frame, [0, 12, Math.max(13, durationFrames - 12), durationFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        padding: '0 84px 210px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.62) 100%)',
        opacity,
      }}
    >
      <div
        style={{
          color: 'white',
          fontFamily: 'Georgia, Times New Roman, serif',
          fontSize: 86,
          lineHeight: 0.98,
          fontWeight: 700,
          textShadow: '0 5px 18px rgba(0,0,0,0.55)',
        }}
      >
        {trimString(overlay.text)}
      </div>
    </AbsoluteFill>
  );
}

function SubtitleLayer({ subtitles }) {
  if (!subtitles?.enabled || !Array.isArray(subtitles.lines)) {
    return null;
  }
  return null;
}

export function ReelComposition(props) {
  const { fps } = useVideoConfig();
  const timeline = timelineFromProps(props);
  const narration = props?.render_manifest?.audio?.narration || props?.audio?.narration || {};
  const usesEmbeddedAvatarAudio = trimString(narration.mode) === 'embedded_avatar' || trimString(props.render_mode) === 'avatar';
  const narrationByScene = new Map(
    Array.isArray(narration.scenes)
      ? narration.scenes.map((scene) => [Number(scene.scene_number), trimString(scene.storage_url)])
      : [],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#111111' }}>
      {timeline.map((scene) => {
        const from = Math.max(0, Math.round(scene.start_time_seconds * fps));
        const durationInFrames = Math.max(1, Math.round(scene.duration_seconds * fps));
        const narrationUrl = scene.narration_url || narrationByScene.get(scene.scene_number) || '';
        return (
          <Sequence
            key={`${scene.scene_number}-${scene.asset_url}`}
            from={from}
            durationInFrames={durationInFrames}
          >
            <SceneVisual scene={scene} muted={!usesEmbeddedAvatarAudio} />
            {!usesEmbeddedAvatarAudio && narrationUrl ? <Audio src={narrationUrl} /> : null}
          </Sequence>
        );
      })}
      <TitleOverlay overlay={props.title_overlay || props.render_manifest?.title_overlay} />
      <SubtitleLayer subtitles={props.subtitles || props.render_manifest?.subtitles} />
    </AbsoluteFill>
  );
}
