import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ReelComposition } from './ReelComposition.jsx';

function totalDurationSeconds(props) {
  const manifestDuration = Number(props?.render_manifest?.total_duration_seconds ?? 0);
  if (Number.isFinite(manifestDuration) && manifestDuration > 0) {
    return manifestDuration;
  }
  const timeline = Array.isArray(props?.timeline) ? props.timeline : [];
  const total = timeline.reduce((max, scene) => {
    const start = Number(scene.start_time_seconds ?? scene.start_time ?? 0);
    const end = Number(scene.end_time_seconds ?? scene.end_time ?? 0);
    const duration = Number(scene.duration_seconds ?? 0);
    return Math.max(max, end > 0 ? end : start + duration);
  }, 0);
  return Number.isFinite(total) && total > 0 ? total : 1;
}

function RemotionRoot() {
  return (
    <Composition
      id="ReelComposition"
      component={ReelComposition}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30}
      calculateMetadata={({ props }) => {
        const output = props?.output || props?.render_manifest?.output || {};
        const fps = Number(output.fps || 30);
        const width = Number(output.width || 1080);
        const height = Number(output.height || 1920);
        const durationInFrames = Math.max(1, Math.ceil(totalDurationSeconds(props) * fps));
        return {
          fps,
          width,
          height,
          durationInFrames,
        };
      }}
    />
  );
}

registerRoot(RemotionRoot);
