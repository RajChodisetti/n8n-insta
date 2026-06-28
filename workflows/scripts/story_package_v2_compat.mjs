#!/usr/bin/env node

function asString(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || String(fallback ?? '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asPositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function slugWords(value, maxWords = 5) {
  return asString(value)
    .replace(/[^A-Za-z0-9' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(' ');
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = asString(value);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function normalizeReelType(value) {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'image' || normalized === 'video' || normalized === 'avatar') {
    return normalized;
  }
  return 'video';
}

function inferMotionRequirement(scene = {}) {
  const text = asString([
    scene.narration_text,
    scene.beat_label,
  ].filter(Boolean).join(' ')).toLowerCase();
  if (/\b(chase|fight|run|rush|fall|explosion|storm|crowd|dance|vehicle|drive|crash|collapse|transform|flowing|waves?|fire|smoke|rain|walking|running|spinning)\b/.test(text)) {
    return 'high';
  }
  if (/\b(move|motion|reveal|enter|leave|turn|open|close|gesture|camera|drift|pan|zoom|tilt|light changes?)\b/.test(text)) {
    return 'medium';
  }
  return 'low';
}

function buildAssetPlan(scene = {}, index = 0, reelType = 'video') {
  const motionRequirement = inferMotionRequirement(scene);
  const mode = reelType === 'video' ? 'video' : (index === 0 ? 'image' : 'image_with_motion');
  return {
    mode,
    provider_intent: mode === 'video' ? 'provider_video' : (mode === 'image' ? 'static_image' : 'remotion_motion'),
    motion_requirement: motionRequirement,
    video_generation_required: mode === 'video',
    video_generation_reason: mode === 'video'
      ? 'The operator selected Video Reel, so generate this scene directly as video.'
      : 'Use a still image and let Remotion provide the scene movement.',
    fallback_mode: 'image_with_motion',
    budget_priority: mode === 'video' ? 'premium' : 'standard',
    review_required: mode === 'video',
  };
}

function buildRemotionGuidance(scene = {}, index = 0, assetPlan = {}) {
  const motionRequirement = assetPlan.motion_requirement || inferMotionRequirement(scene);
  const cameraMoves = motionRequirement === 'high'
    ? ['pan_left', 'pan_right', 'tilt_up', 'push_in']
    : ['push_in', 'pan_right', 'tilt_down', 'drift'];
  const cameraMove = assetPlan.mode === 'image' && index === 0 ? 'hold' : cameraMoves[index % cameraMoves.length];
  const directionByMove = {
    pull_out: 'center_pull',
    pan_left: 'right_to_left',
    pan_right: 'left_to_right',
    tilt_up: 'bottom_to_top',
    tilt_down: 'top_to_bottom',
    drift: 'diagonal_up',
    hold: 'hold',
  };
  return {
    camera_move: cameraMove,
    pan_zoom_direction: directionByMove[cameraMove] || 'center_push',
    motion_intensity: motionRequirement,
    transition_type: index === 0 ? 'cut' : (index % 3 === 0 ? 'crossfade' : 'soft_cut'),
    overlay_style: motionRequirement === 'high' ? 'documentary_shadow' : 'subtle_vignette',
    pacing: motionRequirement === 'low' ? 'linger' : 'steady',
    motion_layers: assetPlan.mode === 'video' ? ['subtle exposure shaping'] : ['parallax-style pan/zoom from the still image'],
    instructions: `Use ${cameraMove.replaceAll('_', ' ')} with ${motionRequirement} motion intensity to support beat "${scene.beat_label}".`,
  };
}

function normalizeHookOptions(cleanScript = {}) {
  const hooks = asArray(cleanScript.hook_options).map((hook) => asString(hook)).filter(Boolean);
  while (hooks.length < 3) {
    hooks.push(firstNonEmpty(cleanScript.selected_hook, cleanScript.narration_script, 'Untitled hook'));
  }
  return hooks.slice(0, 3);
}

function normalizeSceneLines(cleanScript = {}) {
  const scenes = asArray(cleanScript.scene_dialogue_lines);
  if (scenes.length < 4 || scenes.length > 8) {
    throw new Error('story_package_generation_v2 compatibility requires 4 to 8 clean_script.scene_dialogue_lines entries.');
  }
  return scenes.map((scene, index) => {
    const sceneNumber = Number(scene?.scene_number ?? index + 1);
    const startTime = Number(scene?.start_time_seconds ?? 0);
    const duration = asPositiveNumber(scene?.duration_seconds, 0);
    const endTime = Number(scene?.end_time_seconds ?? startTime + duration);
    const narrationText = asString(scene?.narration_text);
    const dialogueLines = asArray(scene?.dialogue_lines).map((line) => asString(line)).filter(Boolean);
    return {
      scene_number: Number.isFinite(sceneNumber) && sceneNumber > 0 ? sceneNumber : index + 1,
      beat_label: asString(scene?.beat_label, `beat_${index + 1}`),
      start_time_seconds: Number.isFinite(startTime) ? Number(startTime.toFixed(2)) : 0,
      end_time_seconds: Number.isFinite(endTime) ? Number(endTime.toFixed(2)) : Number((startTime + duration).toFixed(2)),
      duration_seconds: duration || Math.max(0.5, Number((endTime - startTime).toFixed(2))),
      narration_text: narrationText || dialogueLines.join(' '),
      dialogue_lines: dialogueLines.length ? dialogueLines : [narrationText].filter(Boolean),
    };
  });
}

function buildVisualText(v2 = {}, scene = {}, index = 0) {
  const strategy = asString(v2.narrative_strategy?.visual_strategy, 'Use a concrete, story-specific, text-free documentary visual.');
  const constraints = v2.downstream_constraints?.visual_constraints ?? {};
  const prohibited = asArray(constraints.prohibited_visuals).map((entry) => asString(entry)).filter(Boolean);
  const noText = asString(
    constraints.text_policy,
    'No readable text, labels, logos, documents, UI, subtitles, captions, or typography.',
  );
  const sceneRole = index === 0 ? 'opening face-image/title-card background' : 'scene video beat';
  return [
    `Text-free ${sceneRole} for beat "${scene.beat_label}".`,
    `Represent this narration beat with a concrete focal subject, action, and setting: ${scene.narration_text}`,
    `Visual strategy: ${strategy}`,
    noText,
    prohibited.length ? `Avoid: ${prohibited.join('; ')}.` : '',
  ].filter(Boolean).join(' ');
}

function buildTtsInstructions(v2 = {}, scene = {}) {
  return firstNonEmpty(
    v2.downstream_constraints?.voice_constraints?.delivery_notes,
    v2.narrative_strategy?.voice_strategy,
    `Natural spoken delivery matching beat: ${scene.beat_label}.`,
  );
}

function buildMusicCue(v2 = {}, scene = {}) {
  return firstNonEmpty(
    v2.downstream_constraints?.music_sfx_constraints?.music_brief,
    v2.narrative_strategy?.music_strategy,
    `Subtle music cue for ${scene.beat_label}.`,
  );
}

function buildCreativeDirection(v2 = {}) {
  const strategy = v2.narrative_strategy ?? {};
  const constraints = v2.downstream_constraints ?? {};
  return {
    core_angle: asString(strategy.core_angle, 'No core angle provided.'),
    point_of_view: asString(strategy.point_of_view, 'No point of view provided.'),
    emotional_arc: asString(strategy.emotional_arc, 'No emotional arc provided.'),
    narration_strategy: asString(strategy.voice_strategy, 'Clean human narration.'),
    visual_strategy: asString(strategy.visual_strategy, 'Text-free concrete visuals.'),
    music_strategy: asString(strategy.music_strategy, constraints.music_sfx_constraints?.music_brief || 'Subtle instrumental bed.'),
    consistency_rules: [
      ...asArray(constraints.global_rules),
      asString(constraints.visual_constraints?.text_policy),
      asString(constraints.voice_constraints?.clean_script_policy),
    ].map((entry) => asString(entry)).filter(Boolean),
  };
}

export function mapStoryPackageV2ToLegacyResponse(v2 = {}, options = {}) {
  if (!v2 || typeof v2 !== 'object' || Array.isArray(v2)) {
    throw new Error('story_package_generation_v2 response must be an object.');
  }
  const cleanScript = v2.clean_script ?? {};
  const captionSeed = v2.caption_seed ?? {};
  const researchBrief = v2.research_brief ?? {};
  const scenes = normalizeSceneLines(cleanScript);
  const hooks = normalizeHookOptions(cleanScript);
  const title = asString(options.title, researchBrief.topic);
  const reelType = normalizeReelType(options.reelType);
  const targetDurationSeconds = asPositiveNumber(options.targetDurationSeconds, researchBrief.target_duration_seconds || cleanScript.estimated_duration_seconds || 45);
  const sceneContractJson = {
    expected_scene_count: scenes.length,
    expected_total_duration_seconds: targetDurationSeconds,
    scene_count_rationale: `Mapped ${scenes.length} clean-script scene beats into matching legacy scene_guidance_json and storyboard_json arrays.`,
  };
  const musicDirection = firstNonEmpty(
    captionSeed.music_direction,
    v2.downstream_constraints?.music_sfx_constraints?.music_brief,
    v2.narrative_strategy?.music_strategy,
    'Subtle instrumental bed under narration.',
  );

  const sceneGuidanceJson = scenes.map((scene, index) => {
    const assetPlan = buildAssetPlan(scene, index, reelType);
    const remotion = buildRemotionGuidance(scene, index, assetPlan);
    return {
      scene_number: scene.scene_number,
      beat_label: scene.beat_label,
      start_time_seconds: scene.start_time_seconds,
      end_time_seconds: scene.end_time_seconds,
      duration_seconds: scene.duration_seconds,
      narration_text: scene.narration_text,
      dialogue_lines: scene.dialogue_lines,
      asset_type: assetPlan.mode === 'video' ? 'video' : 'image',
      asset_plan: assetPlan,
      remotion,
      image_prompt: buildVisualText(v2, scene, index),
      music_cue: buildMusicCue(v2, scene),
      tts_instructions: buildTtsInstructions(v2, scene),
      includes_primary_character: false,
      scene_purpose: `Advance the ${scene.beat_label} beat without adding unsupported facts.`,
      visual_beat: buildVisualText(v2, scene, index),
      source_boundary: asArray(researchBrief.source_boundaries).join(' ') || 'Use only supported source notes.',
    };
  });

  const storyboardJson = scenes.map((scene, index) => {
    const assetPlan = buildAssetPlan(scene, index, reelType);
    const remotion = buildRemotionGuidance(scene, index, assetPlan);
    return {
      scene_number: scene.scene_number,
      duration_seconds: scene.duration_seconds,
      narration_text: scene.narration_text,
      dialogue_lines: scene.dialogue_lines,
      visual_prompt: buildVisualText(v2, scene, index),
      asset_type: assetPlan.mode === 'video' ? 'video' : 'image',
      asset_plan: assetPlan,
      remotion,
      transition: index === 0 ? 'cut' : 'soft cut',
      mood: scene.beat_label,
      music_cue: buildMusicCue(v2, scene),
      tts_instructions: buildTtsInstructions(v2, scene),
      is_face_image: reelType === 'image' && index === 0,
      face_image_title: index === 0 ? slugWords(firstNonEmpty(cleanScript.selected_hook, title), 5) : '',
      includes_primary_character: false,
    };
  });

  return {
    creative_direction_json: buildCreativeDirection(v2),
    confidence_label: asString(researchBrief.confidence_label, options.confidenceLabel || 'unverified'),
    hook_option_1: hooks[0],
    hook_option_2: hooks[1],
    hook_option_3: hooks[2],
    selected_hook: firstNonEmpty(cleanScript.selected_hook, hooks[0]),
    narration_script: asString(cleanScript.narration_script),
    short_script: asString(cleanScript.short_script, cleanScript.narration_script),
    caption_draft: asString(captionSeed.caption_draft),
    cta_line: asString(captionSeed.cta_line, 'Save this for later.'),
    music_direction: musicDirection,
    onscreen_text_json: scenes.map((scene) => ({
      scene_number: scene.scene_number,
      text: slugWords(scene.beat_label.replaceAll('_', ' '), 5) || `Scene ${scene.scene_number}`,
    })),
    scene_contract_json: sceneContractJson,
    scene_guidance_json: sceneGuidanceJson,
    storyboard_json: storyboardJson,
    cover_prompt: buildVisualText(v2, scenes[0], 0),
    subtitle_lines_json: scenes.map((scene) => ({
      scene_number: scene.scene_number,
      text: slugWords(scene.narration_text, 10),
    })),
    style_notes: [
      asString(v2.narrative_strategy?.visual_strategy),
      asString(v2.downstream_constraints?.visual_constraints?.text_policy),
      'Legacy compatibility mapping from story_package_generation_v2.',
    ].filter(Boolean).join('\n'),
    visual_style_summary: asString(v2.narrative_strategy?.visual_strategy, 'Text-free, story-specific visual continuity.'),
    render_manifest_seed_json: {
      output: {
        width: 1080,
        height: 1920,
        fps: 30,
        format: 'mp4',
      },
      timeline: storyboardJson.map((scene) => ({
        scene_number: scene.scene_number,
        duration_seconds: scene.duration_seconds,
        asset_type: scene.asset_type,
        asset_plan: scene.asset_plan,
        remotion: scene.remotion,
        transition: scene.transition,
      })),
      subtitles: {
        enabled: false,
        style: 'cinematic_center_safe',
      },
    },
    story_package_v2_json: v2,
    story_package_v2_compatibility: {
      mapped_at: '1970-01-01T00:00:00.000Z',
      target_duration_seconds: targetDurationSeconds,
      scene_count: scenes.length,
      note: 'Deterministic compatibility mapping for legacy scripts/storyboards consumers.',
    },
  };
}
