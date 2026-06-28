#!/usr/bin/env node

import { providerNotImplemented, selectNarrationApiKey, selectNarrationProvider } from './adapter_config.mjs';

function fail(message) {
  throw new Error(message);
}

function ensureString(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    fail(`${name} is required.`);
  }
  return normalized;
}

function normalizeSpeechSpeed(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(4, Math.max(0.25, Number(parsed.toFixed(2))));
}

function clampNumber(value, fallback, min, max, precision = 2) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, Number(normalized.toFixed(precision))));
}

function estimateDurationSeconds(text, speed = 1) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  if (!words) {
    return 0;
  }
  const effectiveWordsPerMinute = Math.max(60, 150 * normalizeSpeechSpeed(speed));
  return Math.max(1, Number(((words / effectiveWordsPerMinute) * 60).toFixed(2)));
}

function parseErrorPayload(text) {
  let errorMessage = text || 'unknown error';
  try {
    const parsed = JSON.parse(text);
    errorMessage = parsed?.error?.message || parsed?.message || parsed?.detail || errorMessage;
  } catch {}
  return errorMessage;
}

async function generateWithOpenAi(payload, fallbackInstructionsLoader) {
  const apiKey = String(selectNarrationApiKey('openai')).trim();
  if (!apiKey) {
    fail('Set NARRATION_OPENAI_API_KEY, TTS_OPENAI_API_KEY, or OPENAI_API_KEY before running wf_narration_generation. For backward compatibility, LLL_API_KEY is also accepted.');
  }

  const request = payload.openai_tts_request ?? {};
  const model = ensureString('openai_tts_request.model', request.model);
  const input = ensureString('narration_script', payload.narration_script);
  const speed = normalizeSpeechSpeed(request.speed);
  const promptInstructions = String(await fallbackInstructionsLoader()).trim();
  const manualInstructions = [
    String(request.instructions || '').trim(),
    String(process.env.NARRATION_INSTRUCTIONS || '').trim(),
    String(process.env.TTS_INSTRUCTIONS || '').trim(),
    String(process.env.OPENAI_TTS_INSTRUCTIONS || '').trim(),
  ].filter(Boolean);
  const instructions = [promptInstructions, ...manualInstructions]
    .filter(Boolean)
    .join('\n\n');
  const body = {
    model,
    voice: ensureString('openai_tts_request.voice', request.voice),
    input,
    response_format: ensureString('openai_tts_request.response_format', request.response_format || 'mp3'),
    speed,
  };
  if (instructions) {
    body.instructions = instructions;
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const errorMessage = parseErrorPayload(errorText);
    fail(`OpenAI speech generation failed (${response.status || 'no status'}): ${errorMessage}`);
  }

  const binary = Buffer.from(await response.arrayBuffer());
  if (!binary.length) {
    fail('OpenAI speech generation returned an empty audio payload.');
  }

  return {
    provider: 'openai',
    request: body,
    binary,
    estimatedDurationSeconds: estimateDurationSeconds(input, speed),
  };
}

async function generateWithFishAudio(payload) {
  const apiKey = String(selectNarrationApiKey('fish_audio')).trim();
  if (!apiKey) {
    fail('Set NARRATION_FISH_AUDIO_API_KEY, TTS_FISH_AUDIO_API_KEY, or FISH_AUDIO_API_KEY before running wf_narration_generation with Fish Audio.');
  }

  const request = payload.tts_request ?? {};
  const model = String(
    request.model
    || process.env.FISH_AUDIO_TTS_MODEL
    || process.env.FISH_AUDIO_MODEL
    || 's2-pro',
  ).trim() || 's2-pro';
  const input = ensureString('narration_script', payload.narration_script);
  // reference_id is optional — omit it when using a custom model ID (e.g. voice_XXXXX)
  // that is passed as the model header rather than a voice reference in the body.
  // payload.voice_reference_id (resolved by director voice_role mapping) takes precedence over env.
  const referenceId = String(
    payload.voice_reference_id
    || request.voice_reference_id
    || process.env.FISH_AUDIO_REFERENCE_ID
    || process.env.FISH_AUDIO_VOICE_ID
    || '',
  ).trim();
  const speed = clampNumber(
    request.speed ?? process.env.NARRATION_SPEED ?? process.env.TTS_SPEED,
    1,
    0.5,
    2,
  );
  const responseFormat = String(request.response_format || process.env.FISH_AUDIO_FORMAT || 'mp3').trim().toLowerCase() || 'mp3';
  const mp3Bitrate = Number.parseInt(String(process.env.FISH_AUDIO_MP3_BITRATE || '128').trim(), 10);
  const volume = clampNumber(process.env.FISH_AUDIO_PROSODY_VOLUME, 0, -20, 20);
  const temperature = clampNumber(process.env.FISH_AUDIO_TEMPERATURE, 0.7, 0, 1);
  const topP = clampNumber(process.env.FISH_AUDIO_TOP_P, 0.7, 0, 1);
  const chunkLength = Number.parseInt(String(process.env.FISH_AUDIO_CHUNK_LENGTH || '300').trim(), 10);
  const minChunkLength = Number.parseInt(String(process.env.FISH_AUDIO_MIN_CHUNK_LENGTH || '50').trim(), 10);

  const body = {
    text: input,
    temperature,
    top_p: topP,
    prosody: {
      speed,
      volume,
      normalize_loudness: true,
    },
    chunk_length: Number.isFinite(chunkLength) ? Math.min(300, Math.max(100, chunkLength)) : 300,
    normalize: true,
    format: responseFormat,
    latency: String(process.env.FISH_AUDIO_LATENCY || 'normal').trim() || 'normal',
    min_chunk_length: Number.isFinite(minChunkLength) ? Math.min(100, Math.max(0, minChunkLength)) : 50,
    condition_on_previous_chunks: true,
  };
  if (referenceId) {
    body.reference_id = referenceId;
  }
  if (responseFormat === 'mp3') {
    body.sample_rate = 44100;
    body.mp3_bitrate = [64, 128, 192].includes(mp3Bitrate) ? mp3Bitrate : 128;
  }

  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const errorMessage = parseErrorPayload(errorText);
    fail(`Fish Audio speech generation failed (${response.status || 'no status'}): ${errorMessage}`);
  }

  const binary = Buffer.from(await response.arrayBuffer());
  if (!binary.length) {
    fail('Fish Audio speech generation returned an empty audio payload.');
  }

  return {
    provider: 'fish_audio',
    request: {
      ...body,
      model,
      voice: model,
      speed,
      response_format: responseFormat,
    },
    binary,
    estimatedDurationSeconds: estimateDurationSeconds(input, speed),
  };
}

function splitTextIntoChunks(text, maxChunkChars = 230) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxChunkChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      const sentences = trimmed.split(/(?<=[.!?—])\s+/);
      for (const sentence of sentences) {
        if (current && current.length + 1 + sentence.length > maxChunkChars) {
          chunks.push(current.trim());
          current = sentence;
        } else {
          current = current ? `${current} ${sentence}` : sentence;
        }
      }
    } else if (current && current.length + 2 + trimmed.length > maxChunkChars) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function findWavDataOffset(buf) {
  if (buf.length < 12) return -1;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return -1;
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return -1;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'data') return off + 8;
    off += 8 + sz + (sz % 2 !== 0 ? 1 : 0);
  }
  return -1;
}

function concatenateWavBuffers(buffers) {
  if (!buffers.length) throw new Error('No WAV buffers to concatenate');
  if (buffers.length === 1) return buffers[0];

  const firstDataOff = findWavDataOffset(buffers[0]);
  if (firstDataOff < 0) throw new Error('First WAV chunk has invalid header');

  const header = Buffer.from(buffers[0].slice(0, firstDataOff));
  const pcmParts = [buffers[0].slice(firstDataOff)];

  for (let i = 1; i < buffers.length; i++) {
    const off = findWavDataOffset(buffers[i]);
    if (off < 0) throw new Error(`WAV chunk ${i} has invalid header`);
    pcmParts.push(buffers[i].slice(off));
  }

  const pcmData = Buffer.concat(pcmParts);
  const out = Buffer.alloc(header.length + pcmData.length);
  header.copy(out);
  pcmData.copy(out, header.length);
  out.writeUInt32LE(pcmData.length, firstDataOff - 4);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

async function generateWithSmallestAi(payload) {
  const apiKey = String(selectNarrationApiKey('smallest_ai')).trim();
  if (!apiKey) {
    fail('Set NARRATION_SMALLEST_AI_API_KEY, TTS_SMALLEST_AI_API_KEY, or SMALLEST_AI_API_KEY before running wf_narration_generation with Smallest AI.');
  }

  const request = payload.tts_request ?? {};
  const rawModel = String(
    request.model
    || process.env.SMALLEST_AI_TTS_MODEL
    || process.env.SMALLEST_AI_MODEL
    || process.env.NARRATION_MODEL
    || process.env.TTS_MODEL
    || 'lightning-v3.1',
  ).trim().toLowerCase() || 'lightning-v3.1';
  const input = ensureString('narration_script', payload.narration_script);
  const voiceId = ensureString(
    'tts_request.voice',
    request.voice
    || process.env.SMALLEST_AI_TTS_VOICE
    || process.env.SMALLEST_AI_VOICE_ID
    || process.env.NARRATION_VOICE
    || process.env.TTS_VOICE,
  );
  const speed = clampNumber(
    request.speed ?? process.env.NARRATION_SPEED ?? process.env.TTS_SPEED,
    1,
    0.5,
    2,
  );
  const sampleRate = Number.parseInt(String(
    request.sample_rate
    || process.env.SMALLEST_AI_SAMPLE_RATE
    || process.env.V2_NARRATION_SAMPLE_RATE
    || '24000',
  ).trim(), 10);
  const normalizedSampleRate = Number.isFinite(sampleRate) ? Math.min(44100, Math.max(8000, sampleRate)) : 24000;
  const outputFormat = String(
    request.output_format
    || request.response_format
    || process.env.SMALLEST_AI_OUTPUT_FORMAT
    || process.env.V2_NARRATION_OUTPUT_FORMAT
    || 'mp3',
  ).trim().toLowerCase() || 'mp3';
  const normalizeModelEndpoint = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 'lightning-v3.1';
    if (
      normalized === 'lightning'
      || normalized === 'lightning-v3.1'
      || normalized === 'lightning_v3.1'
      || normalized === 'lightning 3.1'
      || normalized === 'lightning-3.1'
    ) {
      return 'lightning-v3.1';
    }
    return normalized;
  };
  const model = normalizeModelEndpoint(rawModel);
  const endpoint = `https://api.smallest.ai/waves/v1/${model}/get_speech`;
  const acceptHeader = outputFormat === 'wav' ? 'audio/wav' : outputFormat === 'mp3' ? 'audio/mpeg' : '*/*';
  const body = {
    text: input,
    voice_id: voiceId,
    sample_rate: normalizedSampleRate,
    speed,
    output_format: outputFormat,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: acceptHeader,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const errorMessage = parseErrorPayload(errorText);
    fail(`Smallest AI speech generation failed (${response.status || 'no status'}): ${errorMessage}`);
  }

  const contentType = String(response.headers.get('content-type') || '').trim().toLowerCase();
  let binary;
  if (contentType.includes('application/json')) {
    const parsed = await response.json().catch(() => null);
    const base64Audio = String(
      parsed?.audio_base64
      || parsed?.audio
      || parsed?.data?.audio_base64
      || parsed?.data?.audio
      || '',
    ).trim();
    if (!base64Audio) {
      fail('Smallest AI returned JSON instead of audio, but no audio payload was present.');
    }
    binary = Buffer.from(base64Audio, 'base64');
  } else {
    binary = Buffer.from(await response.arrayBuffer());
  }
  if (!binary.length) {
    fail('Smallest AI speech generation returned an empty audio payload.');
  }

  const baseBody = {
    voice_id: voiceId,
    sample_rate: normalizedSampleRate,
    speed,
    output_format: outputFormat,
  };

  return {
    provider: 'smallest_ai',
    request: {
      ...baseBody,
      model,
      voice: voiceId,
      speed,
      response_format: outputFormat,
    },
    binary,
    estimatedDurationSeconds: estimateDurationSeconds(input, speed),
  };
}

export async function generateNarrationAudio(payload, fallbackInstructionsLoader) {
  const provider = String(
    payload.tts_request?.provider
    || payload.openai_tts_request?.provider
    || selectNarrationProvider(),
  ).trim().toLowerCase();
  if (provider === 'openai') {
    return generateWithOpenAi(payload, fallbackInstructionsLoader);
  }
  if (provider === 'fish' || provider === 'fish_audio' || provider === 'fishaudio') {
    return generateWithFishAudio(payload);
  }
  if (provider === 'smallest_ai' || provider === 'smallest-ai' || provider === 'smallest') {
    return generateWithSmallestAi(payload);
  }

  providerNotImplemented('tts', provider, 'narration');
}
