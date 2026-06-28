#!/usr/bin/env node

function normalizePromptPath(promptPath = '') {
  return String(promptPath || '').trim().replace(/^\/+/, '');
}

function uniqueRules(rules = []) {
  return [...new Set(
    rules
      .map((rule) => String(rule || '').trim())
      .filter(Boolean),
  )];
}

const GLOBAL_PROMPT_BUILDER_RULES = Object.freeze([
  'Preserve every existing {{placeholder}} token exactly as written.',
  'Do not add, remove, rename, or reorder placeholders unless the user explicitly asks for placeholder changes.',
  'Keep the file focused on the same runtime stage and output shape.',
  'Treat schema/output requirements, safety rules, consent rules, approval rules, provider-secret rules, and no-visible-text rules as immutable unless an explicit repository change updates the owning contract.',
  'Improve wording, ordering, specificity, and short-form quality without weakening any runtime contract or validation boundary.',
]);

const NO_VISIBLE_TEXT_GENERATION_DIRECTIVE = [
  'Text-free generated asset rule:',
  'The generated pixels must contain zero visible text and zero pseudo-text.',
  'Do not include readable words, fake words, gibberish letters, random glyphs, script-like marks, symbols arranged like writing, captions, subtitles, titles, lower thirds, signatures, watermarks, logos, labels, signs, banners, posters, plaques, inscriptions, documents, newspapers, maps, diagrams, charts, UI, screens, dashboards, product packaging, nameplates, speech bubbles, or title cards.',
  'If the subject would normally have writing or labels, show plain unmarked surfaces, clean shapes, texture, water, stone, people, tools, architecture, landscape, or objects with no marks.',
  'Renderer-owned text, including the 2-second opening title card, is added later by Remotion and must not be baked into generated assets.',
].join(' ');

const NO_VISIBLE_TEXT_NEGATIVE_PROMPT = [
  'text',
  'readable text',
  'unreadable text',
  'gibberish text',
  'fake text',
  'pseudo text',
  'pseudo-writing',
  'random letters',
  'letters',
  'numbers',
  'glyphs',
  'symbols arranged like writing',
  'typography',
  'captions',
  'subtitles',
  'title',
  'title card',
  'lower third',
  'watermark',
  'logo',
  'signature',
  'signage',
  'signboard',
  'street sign',
  'billboard',
  'banner',
  'poster',
  'label',
  'nameplate',
  'plaque',
  'inscription',
  'carved letters',
  'etched letters',
  'document',
  'newspaper',
  'book page',
  'manuscript',
  'map labels',
  'labeled map',
  'diagram text',
  'chart labels',
  'infographic',
  'UI text',
  'screen text',
  'dashboard text',
  'product packaging text',
  'speech bubble',
  'dialogue bubble',
  'thought bubble',
  'comic text',
].join(', ');

export function getNoVisibleTextGenerationDirective() {
  return NO_VISIBLE_TEXT_GENERATION_DIRECTIVE;
}

export function getNoVisibleTextNegativePrompt() {
  return NO_VISIBLE_TEXT_NEGATIVE_PROMPT;
}

export function getPromptSpecificHardRules(promptPath) {
  const clean = normalizePromptPath(promptPath);

  if (clean === 'storyboard_and_prompts/system.md' || clean === 'storyboard_and_prompts/user.md') {
    return [
      'Storyboard generated scene images must contain no visible text or pseudo-text of any kind; the renderer handles the opening title separately.',
      'All storyboard scenes must explicitly avoid visible text, fake writing, random glyphs, typography, subtitles, captions, labels, logos, UI, watermarks, signage, maps, diagrams, charts, documents, newspapers, plaques, inscriptions, and placards.',
      'If a scene normally has writing, labels, maps, diagrams, signs, plaques, or screens, replace them with blank unmarked surfaces or non-text visual evidence.',
      'render_manifest_seed_json.subtitles.enabled must be false so captions are not burned into the video.',
      'The cover prompt must avoid visible text and obstructive overlays of any kind.',
      'Storyboard visual prompts must preserve concrete subject, action, and setting from the script scene guide instead of drifting into generic mood-board imagery.',
      'Storyboard visual prompts must preserve any requested narration perspective, including respectful victim/survivor-centered perspective for sensitive harm stories.',
      'For sexual violence, domestic abuse, marital rape, coercion, or victim testimony, never request graphic assault, sexualized bodies, victim-blaming imagery, or sensationalized suffering.',
    ];
  }

  if (clean === 'scene_asset_generation/prompt.md') {
    return [
      'No generated visible text or pseudo-text is allowed in any scene image, including scene 1.',
      'Absolutely no subtitles, captions, titles, signage, maps, diagrams, charts, plaques, inscriptions, documents, newspapers, UI, logos, watermark, fake letters, or random glyphs of any kind is allowed.',
      'If a subject normally has writing, labels, maps, screens, plaques, or diagrams, describe blank unmarked surfaces or non-text visual evidence instead.',
      'Do not replace the narrated beat with generic symbolic imagery, anonymous silhouettes, or background-only atmosphere shots.',
      'Render the concrete subject, action, and setting named in the scene direction as the focal point of the frame.',
      'Keep the image matched to this exact scene narration and preserve the storyboard subject, action, setting, and story-specific visual evidence.',
      'For sexual violence, domestic abuse, marital rape, coercion, or victim testimony, keep visuals respectful and non-graphic; never depict assault or sexualized imagery.',
    ];
  }

  if (clean === 'post_image_generation/prompt.md') {
    return [
      'Absolutely no visible text, signage, documents, labels, UI, watermark, or obstructive overlay of any kind is allowed in the generated post image.',
    ];
  }

  return [];
}

export function getPromptBuilderHardRules(promptPath) {
  return uniqueRules([
    ...GLOBAL_PROMPT_BUILDER_RULES,
    ...getPromptSpecificHardRules(promptPath),
  ]);
}

export function getRuntimePromptSafetyAppendix(promptPath) {
  const clean = normalizePromptPath(promptPath);
  const visualPlanningPaths = new Set([
    'story_package_generation/system.md',
    'story_package_generation/user.md',
    'storyboard_and_prompts/system.md',
    'storyboard_and_prompts/user.md',
    'scene_asset_generation/prompt.md',
    'post_image_generation/prompt.md',
  ]);
  if (!visualPlanningPaths.has(clean)) {
    return '';
  }

  return [
    'Runtime locked visual rules:',
    '- Generated image/video assets must contain no readable text or pseudo-text of any kind.',
    '- Do not request words, letters, fake writing, random glyphs, typography, subtitles, captions, logos, UI, watermarks, signs, labels, maps, diagrams, charts, documents, newspapers, placards, plaques, inscriptions, speech bubbles, or title text inside generated assets.',
    '- If a scene normally contains writing, use blank unmarked surfaces or non-text visual evidence instead.',
    '- Opening title text belongs only in renderer metadata such as face_image_title or title_overlay.',
    '- Remotion/rendering owns title cards, captions, subtitles, and overlays.',
    '- The opening renderer title card should last 2 seconds.',
  ].join('\n');
}

export function getSceneImageTextGuard(sceneNumber) {
  const normalizedSceneNumber = Number(sceneNumber);

  if (Number.isInteger(normalizedSceneNumber) && normalizedSceneNumber === 1) {
    return [
      'Hard rule:',
      'no generated visible text or pseudo-text of any kind, even on the opening image.',
      'Do not add titles, subtitles, captions, words, fake words, gibberish letters, random glyphs, UI, watermark, logo, signage, labels, plaques, inscriptions, maps, diagrams, charts, documents, placards, newspaper text, or decorative typography.',
      'Use blank unmarked surfaces wherever a sign, plaque, document, screen, map, diagram, or label might otherwise appear.',
      'The opening title is added later by the renderer, not by the image model.',
      'Keep the composition clean and unobstructed with no blocking overlays.',
    ].join(' ');
  }

  return [
    'Hard rule:',
    'no visible text or pseudo-text of any kind.',
    'No titles, words, fake words, gibberish letters, random glyphs, captions, labels, logos, UI, watermark, signage, plaques, inscriptions, maps, diagrams, charts, documents, placards, newspaper text, or decorative typography.',
    'Use blank unmarked surfaces wherever a sign, plaque, document, screen, map, diagram, or label might otherwise appear.',
    'Keep the composition clean and unobstructed with no blocking overlays.',
  ].join(' ');
}

function compactSentence(value, fallback = '') {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 280 ? `${normalized.slice(0, 277).trimEnd()}...` : normalized;
}

export function getSceneImageRelevanceGuard(scene = {}) {
  const visualPrompt = compactSentence(scene.visual_prompt, 'Use the scene direction literally.');
  const narrationText = compactSentence(scene.narration_text, 'Match the narrated beat exactly.');
  const mood = compactSentence(scene.mood);
  const transition = compactSentence(scene.transition);

  const parts = [
    'Hard relevance rule:',
    'depict the exact narrated beat, not a generic version of the topic.',
    `Scene direction to follow literally: ${visualPrompt}`,
    `Narration beat to match: ${narrationText}`,
    'Keep one dominant focal subject or action that a viewer can understand instantly.',
    'Preserve the scene direction subject, action or emotional situation, setting, and story-specific visual evidence.',
    'Avoid vague atmosphere-only imagery, symbolic substitutes, generic crowd scenes, random portraits, or filler backgrounds.',
  ];

  if (mood) {
    parts.push(`Mood is secondary to relevance: ${mood}.`);
  }
  if (transition) {
    parts.push(`Let the framing support this transition: ${transition}.`);
  }

  return parts.join(' ');
}

export function getPostImageTextGuard() {
  return [
    'Hard rule:',
    'no visible text or pseudo-text of any kind.',
    'No titles, words, fake words, gibberish letters, random glyphs, captions, labels, logos, UI, watermark, signage, plaques, inscriptions, maps, diagrams, charts, documents, placards, newspaper text, or decorative typography.',
    'Use blank unmarked surfaces wherever a sign, plaque, document, screen, map, diagram, or label might otherwise appear.',
    'Keep the composition clean and unobstructed with no blocking overlays.',
  ].join(' ');
}
