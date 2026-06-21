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
]);

export function getPromptSpecificHardRules(promptPath) {
  const clean = normalizePromptPath(promptPath);

  if (clean === 'storyboard_and_prompts/system.md' || clean === 'storyboard_and_prompts/user.md') {
    return [
      'Storyboard generated scene images must contain no visible text of any kind; the renderer handles the opening title separately.',
      'All storyboard scenes must explicitly avoid visible text, typography, subtitles, captions, labels, logos, UI, watermarks, signage, documents, newspapers, and placards.',
      'render_manifest_seed_json.subtitles.enabled must be false so captions are not burned into the video.',
      'The cover prompt must avoid visible text and obstructive overlays of any kind.',
      'Storyboard visual prompts must preserve concrete subject, action, and setting from the script scene guide instead of drifting into generic mood-board imagery.',
      'Storyboard visual prompts must preserve any requested narration perspective, including respectful victim/survivor-centered perspective for sensitive harm stories.',
      'For sexual violence, domestic abuse, marital rape, coercion, or victim testimony, never request graphic assault, sexualized bodies, victim-blaming imagery, or sensationalized suffering.',
    ];
  }

  if (clean === 'scene_asset_generation/prompt.md') {
    return [
      'No generated visible text is allowed in any scene image, including scene 1.',
      'Absolutely no subtitles, captions, titles, signage, documents, newspapers, UI, or watermark of any kind is allowed.',
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

export function getSceneImageTextGuard(sceneNumber) {
  const normalizedSceneNumber = Number(sceneNumber);

  if (Number.isInteger(normalizedSceneNumber) && normalizedSceneNumber === 1) {
    return [
      'Hard rule:',
      'no generated visible text of any kind, even on the opening image.',
      'Do not add titles, subtitles, captions, words, letters, UI, watermark, logo, signage, documents, placards, newspaper text, or decorative typography.',
      'The opening title is added later by the renderer, not by the image model.',
      'Keep the composition clean and unobstructed with no blocking overlays.',
    ].join(' ');
  }

  return [
    'Hard rule:',
    'no visible text of any kind.',
    'No titles, words, letters, captions, labels, logos, UI, watermark, signage, documents, placards, newspaper text, or decorative typography.',
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
    'no visible text of any kind.',
    'No titles, words, letters, captions, labels, logos, UI, watermark, signage, documents, placards, newspaper text, or decorative typography.',
    'Keep the composition clean and unobstructed with no blocking overlays.',
  ].join(' ');
}
