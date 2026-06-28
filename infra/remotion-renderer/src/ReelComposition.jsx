import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
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
      narration_duration_seconds: Number(scene.narration_duration_seconds ?? scene.duration_seconds ?? 0),
      narration_tail_padding_seconds: Number(scene.narration_tail_padding_seconds ?? 0),
      transition: trimString(scene.transition),
      asset_plan: scene.asset_plan && typeof scene.asset_plan === 'object' ? scene.asset_plan : {},
      remotion: scene.remotion && typeof scene.remotion === 'object' ? scene.remotion : {},
    };
  });
}

function assetTypeFor(scene) {
  if (scene.asset_type === 'video') return 'video';
  if (/\.mp4(?:[?#].*)?$/i.test(scene.asset_url)) return 'video';
  return 'image';
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function motionIntensityValue(value) {
  const normalized = trimString(value).toLowerCase();
  if (normalized === 'high') return 1;
  if (normalized === 'low') return 0.4;
  return 0.7;
}

function sceneSeed(scene) {
  const sceneNumber = Number(scene?.scene_number || 1);
  return ((sceneNumber * 37) % 101) / 100;
}

function easingForPacing(value) {
  const pacing = trimString(value).toLowerCase();
  if (pacing === 'quick') return Easing.bezier(0.33, 1, 0.68, 1);
  if (pacing === 'linger' || pacing === 'slow') return Easing.bezier(0.16, 1, 0.3, 1);
  return Easing.bezier(0.22, 1, 0.36, 1);
}

function transformForScene(scene, frame, sceneFrames, isVideo) {
  const remotion = scene.remotion || {};
  const cameraMove = trimString(remotion.camera_move || 'push_in').toLowerCase();
  const direction = trimString(remotion.pan_zoom_direction || '').toLowerCase();
  const intensity = motionIntensityValue(remotion.motion_intensity);
  const eased = interpolate(frame, [0, sceneFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easingForPacing(remotion.pacing),
  });
  const travel = (isVideo ? 22 : 76) * intensity;
  const zoom = (isVideo ? 0.045 : 0.22) * intensity;
  const rotationTravel = (isVideo ? 0.18 : 0.62) * intensity;
  let startScale = isVideo ? 1.02 : 1.08;
  let endScale = startScale + zoom;
  let startX = 0;
  let endX = 0;
  let startY = 0;
  let endY = 0;
  let startRotate = (sceneSeed(scene) - 0.5) * rotationTravel;
  let endRotate = -startRotate;

  if (cameraMove === 'pull_out' || direction === 'center_pull') {
    startScale = (isVideo ? 1.04 : 1.12) + zoom;
    endScale = isVideo ? 1.02 : 1.08;
  } else if (cameraMove === 'hold' || direction === 'hold') {
    startScale = isVideo ? 1.01 : 1.045;
    endScale = isVideo ? 1.018 : 1.075;
    startRotate = 0;
    endRotate = 0;
  }

  if (cameraMove === 'pan_left' || direction === 'right_to_left') {
    startX = travel;
    endX = -travel;
  } else if (cameraMove === 'pan_right' || direction === 'left_to_right') {
    startX = -travel;
    endX = travel;
  } else if (cameraMove === 'tilt_up' || direction === 'bottom_to_top') {
    startY = travel;
    endY = -travel;
  } else if (cameraMove === 'tilt_down' || direction === 'top_to_bottom') {
    startY = -travel;
    endY = travel;
  } else if (direction === 'diagonal_up') {
    startX = -travel * 0.55;
    endX = travel * 0.55;
    startY = travel * 0.7;
    endY = -travel * 0.7;
  } else if (direction === 'diagonal_down') {
    startX = travel * 0.55;
    endX = -travel * 0.55;
    startY = -travel * 0.7;
    endY = travel * 0.7;
  }

  const scale = startScale + ((endScale - startScale) * eased);
  const x = startX + ((endX - startX) * eased);
  const y = startY + ((endY - startY) * eased);
  const rotate = startRotate + ((endRotate - startRotate) * eased);
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)}) rotate(${rotate.toFixed(3)}deg)`;
}

function SceneOverlay({ scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const remotion = scene.remotion || {};
  const overlayStyle = trimString(remotion.overlay_style || 'subtle_vignette').toLowerCase();
  const intensity = motionIntensityValue(remotion.motion_intensity);
  const pulse = interpolate(frame, [0, Math.max(1, Math.round(scene.duration_seconds * fps))], [0.25, 0.68], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easingForPacing(remotion.pacing),
  });
  const opacity = clamp01((overlayStyle === 'none' ? 0 : 0.2) + (pulse * 0.18 * intensity));
  const gradients = {
    warm_gradient: 'linear-gradient(180deg, rgba(75,42,16,0.20) 0%, rgba(0,0,0,0.05) 48%, rgba(0,0,0,0.46) 100%)',
    cool_gradient: 'linear-gradient(180deg, rgba(13,40,70,0.24) 0%, rgba(0,0,0,0.03) 48%, rgba(0,0,0,0.48) 100%)',
    documentary_shadow: 'radial-gradient(circle at 50% 36%, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.02) 38%, rgba(0,0,0,0.62) 100%)',
    soft_light_leak: 'linear-gradient(135deg, rgba(255,196,112,0.20) 0%, rgba(255,255,255,0.03) 34%, rgba(0,0,0,0.42) 100%)',
    subtle_vignette: 'radial-gradient(circle at 50% 42%, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.12) 58%, rgba(0,0,0,0.54) 100%)',
  };
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity,
        background: gradients[overlayStyle] || gradients.subtle_vignette,
      }}
    />
  );
}

function KineticLayer({ scene, isVideo }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const remotion = scene.remotion || {};
  const sceneFrames = Math.max(1, Math.round(scene.duration_seconds * fps));
  const intensity = motionIntensityValue(remotion.motion_intensity);
  const progress = interpolate(frame, [0, sceneFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easingForPacing(remotion.pacing),
  });
  const seed = sceneSeed(scene);
  const entry = interpolate(frame, [0, Math.max(8, Math.round(0.6 * fps))], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sweepX = interpolate(progress, [0, 1], [-width * (0.7 + seed * 0.25), width * (0.7 + seed * 0.2)], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sweepY = interpolate(progress, [0, 1], [height * (0.12 + seed * 0.15), height * (0.52 + seed * 0.18)], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const focusX = 28 + seed * 44;
  const focusY = 22 + (1 - seed) * 42;
  const pulse = 0.5 + (Math.sin(progress * Math.PI * 2) * 0.5);
  const baseOpacity = (isVideo ? 0.34 : 0.52) * intensity;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          opacity: clamp01(baseOpacity * entry),
          background: `radial-gradient(circle at ${focusX.toFixed(1)}% ${focusY.toFixed(1)}%, rgba(255,255,255,0.17) 0%, rgba(255,255,255,0.04) 28%, rgba(0,0,0,0) 58%)`,
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -width * 0.24,
          top: 0,
          width: width * 0.42,
          height: height * 1.25,
          transform: `translate3d(${sweepX.toFixed(2)}px, ${sweepY.toFixed(2)}px, 0) rotate(-24deg)`,
          transformOrigin: '50% 50%',
          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 45%, rgba(255,255,255,0.34) 52%, rgba(255,255,255,0) 100%)',
          filter: 'blur(18px)',
          opacity: clamp01((isVideo ? 0.36 : 0.58) * intensity),
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 34,
          right: 34,
          bottom: 42,
          height: 4,
          borderRadius: 999,
          transform: `scaleX(${Math.max(0.08, progress).toFixed(4)})`,
          transformOrigin: scene.scene_number % 2 === 0 ? 'right center' : 'left center',
          background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.46), rgba(255,255,255,0))',
          opacity: clamp01((0.18 + pulse * 0.16) * intensity),
          boxShadow: '0 0 24px rgba(255,255,255,0.22)',
        }}
      />
    </AbsoluteFill>
  );
}

function SceneFade({ scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneFrames = Math.max(1, Math.round(scene.duration_seconds * fps));
  const transitionType = trimString(scene.remotion?.transition_type || scene.transition || 'soft_cut').toLowerCase();
  const fadeFrames = Math.max(4, Math.min(18, Math.round((transitionType === 'dip_to_black' ? 0.45 : 0.22) * fps)));
  const fadeIn = interpolate(frame, [0, fadeFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [Math.max(0, sceneFrames - fadeFrames), sceneFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = transitionType === 'cut' ? 0 : Math.max(fadeIn, fadeOut);
  return <AbsoluteFill style={{ pointerEvents: 'none', backgroundColor: '#111111', opacity }} />;
}

function SceneVisual({ scene, muted }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneFrames = Math.max(1, Math.round(scene.duration_seconds * fps));
  const isVideo = assetTypeFor(scene) === 'video';
  const transform = transformForScene(scene, frame, sceneFrames, isVideo);

  if (!scene.asset_url) {
    return <AbsoluteFill style={{ backgroundColor: '#111111' }} />;
  }

  if (isVideo) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111111', overflow: 'hidden' }}>
        <OffthreadVideo
          src={scene.asset_url}
          muted={muted}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform,
            transformOrigin: 'center center',
            filter: 'contrast(1.05) saturate(1.06)',
            willChange: 'transform',
          }}
        />
        <SceneOverlay scene={scene} />
        <KineticLayer scene={scene} isVideo />
        <SceneFade scene={scene} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#111111', overflow: 'hidden' }}>
      <Img
        src={scene.asset_url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `${transform} scale(1.035)`,
          transformOrigin: 'center center',
          filter: 'blur(24px) saturate(1.14) brightness(0.76)',
          opacity: 0.72,
          willChange: 'transform',
        }}
      />
      <Img
        src={scene.asset_url}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform,
          transformOrigin: 'center center',
          filter: 'contrast(1.07) saturate(1.1)',
          willChange: 'transform',
        }}
      />
      <SceneOverlay scene={scene} />
      <KineticLayer scene={scene} isVideo={false} />
      <SceneFade scene={scene} />
    </AbsoluteFill>
  );
}

function TitleOverlay({ overlay }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!overlay?.enabled || !trimString(overlay.text)) {
    return null;
  }
  const durationFrames = Math.max(1, Math.round(Number(overlay.duration_seconds || 2) * fps));
  const fadeFrames = Math.max(4, Math.min(10, Math.floor(durationFrames / 4)));
  const opacity = interpolate(frame, [0, fadeFrames, Math.max(fadeFrames + 1, durationFrames - fadeFrames), durationFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 92px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.30) 44%, rgba(0,0,0,0.64) 100%)',
        opacity,
      }}
    >
      <div
        style={{
          color: 'white',
          fontFamily: 'Inter, Arial, Helvetica, sans-serif',
          fontSize: 76,
          lineHeight: 1.02,
          fontWeight: 800,
          letterSpacing: 0,
          textAlign: 'center',
          maxWidth: 880,
          textShadow: '0 5px 22px rgba(0,0,0,0.72)',
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

function NarrationAudio({ src, scene }) {
  const { fps } = useVideoConfig();
  const sceneDurationFrames = Math.max(1, Math.round(scene.duration_seconds * fps));
  const narrationDurationSeconds = Number.isFinite(Number(scene.narration_duration_seconds)) && Number(scene.narration_duration_seconds) > 0
    ? Number(scene.narration_duration_seconds)
    : Math.max(0.5, Number(scene.duration_seconds || 0) - Number(scene.narration_tail_padding_seconds || 0));
  const narrationDurationFrames = Math.max(1, Math.round(narrationDurationSeconds * fps));
  const fadeFrames = Math.max(4, Math.min(12, Math.round(0.28 * fps)));
  return (
    <Audio
      src={src}
      volume={(frame) => {
        const fadeIn = interpolate(frame, [0, Math.max(2, Math.round(0.08 * fps))], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const fadeOut = interpolate(
          frame,
          [Math.max(0, narrationDurationFrames - fadeFrames), narrationDurationFrames],
          [1, 0],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          },
        );
        if (frame > sceneDurationFrames) {
          return 0;
        }
        return Math.max(0, Math.min(1, fadeIn, fadeOut));
      }}
    />
  );
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
            premountFor={Math.round(0.5 * fps)}
          >
            <SceneVisual scene={scene} muted={!usesEmbeddedAvatarAudio} />
            {!usesEmbeddedAvatarAudio && narrationUrl ? <NarrationAudio src={narrationUrl} scene={scene} /> : null}
          </Sequence>
        );
      })}
      <TitleOverlay overlay={props.title_overlay || props.render_manifest?.title_overlay} />
      <SubtitleLayer subtitles={props.subtitles || props.render_manifest?.subtitles} />
    </AbsoluteFill>
  );
}
