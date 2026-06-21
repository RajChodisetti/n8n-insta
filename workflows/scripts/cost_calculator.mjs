#!/usr/bin/env node

// Pricing references:
// - OpenAI pricing: https://platform.openai.com/docs/pricing/
// - fal model pricing: https://fal.ai/docs/documentation/model-apis/pricing
// - Fish Audio pricing: https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits

const LLM_PRICE_TABLE = [
  { pattern: 'gpt-5.2-pro', input: 21.00, cached_input: null, output: 168.00 },
  { pattern: 'gpt-5-pro', input: 15.00, cached_input: null, output: 120.00 },
  { pattern: 'gpt-5.2-chat-latest', input: 1.75, cached_input: 0.175, output: 14.00 },
  { pattern: 'gpt-5.2-codex', input: 1.75, cached_input: 0.175, output: 14.00 },
  { pattern: 'gpt-5.2', input: 1.75, cached_input: 0.175, output: 14.00 },
  { pattern: 'gpt-5.1-chat-latest', input: 1.25, cached_input: 0.125, output: 10.00 },
  { pattern: 'gpt-5.1-codex-max', input: 1.25, cached_input: 0.125, output: 10.00 },
  { pattern: 'gpt-5.1-codex-mini', input: 0.25, cached_input: 0.025, output: 2.00 },
  { pattern: 'gpt-5.1-codex', input: 1.25, cached_input: 0.125, output: 10.00 },
  { pattern: 'gpt-5.1', input: 1.25, cached_input: 0.125, output: 10.00 },
  { pattern: 'gpt-5-chat-latest', input: 1.25, cached_input: 0.125, output: 10.00 },
  { pattern: 'gpt-5-codex', input: 1.25, cached_input: 0.125, output: 10.00 },
  { pattern: 'gpt-5-mini', input: 0.25, cached_input: 0.025, output: 2.00 },
  { pattern: 'gpt-5-nano', input: 0.05, cached_input: 0.005, output: 0.40 },
  { pattern: 'gpt-5', input: 1.25, cached_input: 0.125, output: 10.00 },
  { pattern: 'gpt-4.5', input: 75.00, cached_input: null, output: 150.00 },
  { pattern: 'gpt-4.1-mini', input: 0.40, cached_input: 0.10, output: 1.60 },
  { pattern: 'gpt-4.1-nano', input: 0.10, cached_input: 0.025, output: 0.40 },
  { pattern: 'gpt-4.1', input: 2.00, cached_input: 0.50, output: 8.00 },
  { pattern: 'gpt-4o-mini', input: 0.15, cached_input: 0.075, output: 0.60 },
  { pattern: 'gpt-4o', input: 2.50, cached_input: 1.25, output: 10.00 },
  { pattern: 'o4-mini', input: 1.10, cached_input: 0.275, output: 4.40 },
  { pattern: 'o3', input: 2.00, cached_input: 0.50, output: 8.00 },
  { pattern: 'gpt-3.5', input: 0.50, cached_input: null, output: 1.50 },
  { pattern: 'claude-3-5-haiku', input: 0.80, cached_input: null, output: 4.00 },
  { pattern: 'claude-3-5-sonnet', input: 3.00, cached_input: null, output: 15.00 },
  { pattern: 'claude-3-7-sonnet', input: 3.00, cached_input: null, output: 15.00 },
];

const IMAGE_PRICE_TABLE = [
  { pattern: 'fal-ai/flux/schnell', unit_price: 0.003, billing_unit: 'image' },
  { pattern: 'fal-ai/flux/dev', unit_price: 0.025, billing_unit: 'image' },
  { pattern: 'fal-ai/flux-pro', unit_price: 0.050, billing_unit: 'image' },
  { pattern: 'fal-ai/flux-realism', unit_price: 0.025, billing_unit: 'image' },
  { pattern: 'dall-e-3', unit_price: 0.040, billing_unit: 'image' },
  { pattern: 'gpt-image-1', unit_price: 0.040, billing_unit: 'image' },
];

const VIDEO_PRICE_TABLE = [
  // Confirmed from fal official pricing on 2026-05-04.
  { pattern: 'fal-ai/wan/v2.7/reference-to-video', unit_price: 0.10, billing_unit: 'second' },
  { pattern: 'fal-ai/wan/reference-to-video', unit_price: 0.10, billing_unit: 'second' },
  { pattern: 'fal-ai/wan/v2.7/text-to-video', unit_price: 0.10, billing_unit: 'second' },
  { pattern: 'fal-ai/wan-t2v', unit_price: 0.40, billing_unit: 'video' },
];

const TTS_PRICE_TABLE = [
  { pattern: 'fish_audio', unit_price: 15.00, billing_unit: 'utf8_bytes_per_1m' },
  { pattern: 'openai', unit_price: 15.00, billing_unit: 'chars_per_1m' },
  { pattern: 'smallest_ai', unit_price: 0.50, billing_unit: 'chars_per_1m' },
];

function roundUsd(value) {
  return Number(Number(value || 0).toFixed(6));
}

function normalizeModel(value) {
  return String(value || '').trim().toLowerCase();
}

function matchPriceRow(table, lookupValue) {
  const value = normalizeModel(lookupValue);
  // Exact match first, then prefix match separated by '-', '/', or ':' so that
  // e.g. "gpt-5.4" does not accidentally match the "gpt-5" entry.
  return (
    table.find((entry) => value === entry.pattern) ??
    table.find((entry) => value.startsWith(entry.pattern + '-') ||
                          value.startsWith(entry.pattern + '/') ||
                          value.startsWith(entry.pattern + ':')) ??
    null
  );
}

function normalizeLlmUsage(usageOrInputTokens, outputTokensMaybe) {
  if (usageOrInputTokens && typeof usageOrInputTokens === 'object' && !Array.isArray(usageOrInputTokens)) {
    const usage = usageOrInputTokens;
    const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
    const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
    const cachedTokens = Number(
      usage.input_cached_tokens
      ?? usage.cached_tokens
      ?? usage.prompt_tokens_details?.cached_tokens
      ?? 0,
    );
    const totalTokens = Number(usage.total_tokens ?? (inputTokens + outputTokens));
    return {
      input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
      output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
      total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
      input_cached_tokens: Number.isFinite(cachedTokens) ? cachedTokens : 0,
      input_audio_tokens: Number(usage.input_audio_tokens ?? usage.prompt_tokens_details?.audio_tokens ?? 0) || 0,
      output_audio_tokens: Number(usage.output_audio_tokens ?? usage.completion_tokens_details?.audio_tokens ?? 0) || 0,
      reasoning_tokens: Number(usage.completion_tokens_details?.reasoning_tokens ?? 0) || 0,
    };
  }

  const inputTokens = Number(usageOrInputTokens ?? 0);
  const outputTokens = Number(outputTokensMaybe ?? 0);
  return {
    input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    total_tokens: Number.isFinite(inputTokens + outputTokens) ? inputTokens + outputTokens : 0,
    input_cached_tokens: 0,
    input_audio_tokens: 0,
    output_audio_tokens: 0,
    reasoning_tokens: 0,
  };
}

export function computeLlmCost(model, usageOrInputTokens, outputTokensMaybe, provider = 'openai') {
  const usage = normalizeLlmUsage(usageOrInputTokens, outputTokensMaybe);
  const price = matchPriceRow(LLM_PRICE_TABLE, model);
  const cachedInputTokens = Math.max(0, usage.input_cached_tokens);
  const totalInputTokens = Math.max(0, usage.input_tokens);
  const nonCachedInputTokens = Math.max(0, totalInputTokens - cachedInputTokens);
  const billedCachedRate = price?.cached_input ?? price?.input ?? null;
  const inputCost = price ? (nonCachedInputTokens / 1_000_000) * price.input : 0;
  const cachedInputCost = price && billedCachedRate != null ? (cachedInputTokens / 1_000_000) * billedCachedRate : 0;
  const outputCost = price ? (usage.output_tokens / 1_000_000) * price.output : 0;

  return {
    type: 'llm',
    provider: String(provider || 'openai'),
    model: String(model || ''),
    input_tokens: totalInputTokens,
    input_cached_tokens: cachedInputTokens,
    input_non_cached_tokens: nonCachedInputTokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    input_audio_tokens: usage.input_audio_tokens,
    output_audio_tokens: usage.output_audio_tokens,
    reasoning_tokens: usage.reasoning_tokens,
    price_per_1m_input: price?.input ?? null,
    price_per_1m_cached_input: billedCachedRate,
    price_per_1m_output: price?.output ?? null,
    input_cost_usd: roundUsd(inputCost),
    cached_input_cost_usd: roundUsd(cachedInputCost),
    output_cost_usd: roundUsd(outputCost),
    total_usd: roundUsd(inputCost + cachedInputCost + outputCost),
    billing_basis: 'token_usage',
    estimated_from_usage: true,
    priced: price !== null,
  };
}

export function computeImageCost(provider, model, imageCount) {
  const price = matchPriceRow(IMAGE_PRICE_TABLE, model);
  const count = Number(imageCount || 0);
  const total = price ? price.unit_price * count : 0;
  return {
    type: 'image',
    provider: String(provider || ''),
    model: String(model || ''),
    image_count: count,
    billing_unit: price?.billing_unit ?? 'image',
    price_per_image: price?.unit_price ?? null,
    total_usd: roundUsd(total),
    estimated_from_usage: true,
    priced: price !== null,
  };
}

function normalizeVideoUsage(usageOrCount) {
  if (usageOrCount && typeof usageOrCount === 'object' && !Array.isArray(usageOrCount)) {
    const videoCount = Number(
      usageOrCount.video_count
      ?? usageOrCount.items
      ?? usageOrCount.count
      ?? 0,
    );
    const totalDurationSeconds = Number(
      usageOrCount.total_duration_seconds
      ?? usageOrCount.duration_seconds
      ?? usageOrCount.seconds
      ?? 0,
    );
    return {
      video_count: Number.isFinite(videoCount) ? Math.max(0, videoCount) : 0,
      total_duration_seconds: Number.isFinite(totalDurationSeconds) ? Math.max(0, totalDurationSeconds) : 0,
    };
  }

  const videoCount = Number(usageOrCount || 0);
  return {
    video_count: Number.isFinite(videoCount) ? Math.max(0, videoCount) : 0,
    total_duration_seconds: 0,
  };
}

export function computeVideoCost(provider, model, usageOrCount) {
  const usage = normalizeVideoUsage(usageOrCount);
  const lookup = String(model || provider || '').trim().toLowerCase();
  const price = matchPriceRow(VIDEO_PRICE_TABLE, lookup);
  const billingUnit = price?.billing_unit ?? 'video';
  const billableQuantity = billingUnit === 'second'
    ? usage.total_duration_seconds
    : usage.video_count;
  const total = price ? billableQuantity * price.unit_price : 0;

  return {
    type: 'video',
    provider: String(provider || ''),
    model: String(model || ''),
    video_count: usage.video_count,
    total_duration_seconds: roundUsd(usage.total_duration_seconds),
    billing_unit: billingUnit,
    price_per_video: billingUnit === 'video' ? price?.unit_price ?? null : null,
    price_per_second: billingUnit === 'second' ? price?.unit_price ?? null : null,
    total_usd: roundUsd(total),
    estimated_from_usage: true,
    priced: price !== null,
  };
}

function normalizeTtsUsage(usageOrCount) {
  if (usageOrCount && typeof usageOrCount === 'object' && !Array.isArray(usageOrCount)) {
    const byteCount = Number(
      usageOrCount.utf8_bytes
      ?? usageOrCount.byte_count
      ?? usageOrCount.input_utf8_bytes
      ?? 0,
    );
    const charCount = Number(
      usageOrCount.char_count
      ?? usageOrCount.characters
      ?? 0,
    );
    return {
      utf8_bytes: Number.isFinite(byteCount) ? byteCount : 0,
      char_count: Number.isFinite(charCount) ? charCount : 0,
    };
  }
  const charCount = Number(usageOrCount || 0);
  return {
    utf8_bytes: 0,
    char_count: Number.isFinite(charCount) ? charCount : 0,
  };
}

export function computeTtsCost(provider, usageOrCount, model = '') {
  const usage = normalizeTtsUsage(usageOrCount);
  const lookup = String(provider || model || '').toLowerCase().replace(/[^a-z0-9_/-]/g, '_');
  const price = matchPriceRow(TTS_PRICE_TABLE, lookup);
  const billingUnit = price?.billing_unit ?? 'chars_per_1m';
  const billableQuantity = billingUnit === 'utf8_bytes_per_1m' ? usage.utf8_bytes : usage.char_count;
  const total = price ? (billableQuantity / 1_000_000) * price.unit_price : 0;
  return {
    type: 'tts',
    provider: String(provider || ''),
    model: String(model || ''),
    char_count: usage.char_count,
    utf8_bytes: usage.utf8_bytes,
    billing_unit: billingUnit,
    price_per_1m_units: price?.unit_price ?? null,
    total_usd: roundUsd(total),
    estimated_from_usage: true,
    priced: price !== null,
  };
}
