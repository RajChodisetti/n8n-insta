#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assetHostAliases, firstEnv, selectAssetHostProvider } from '../workflows/scripts/adapter_config.mjs';
import { deleteHostedObject, uploadBinaryAsset } from '../workflows/scripts/asset_host_adapters.mjs';
import { computeImageCost, computeLlmCost, computeTtsCost, computeVideoCost } from '../workflows/scripts/cost_calculator.mjs';
import { getPromptBuilderHardRules } from '../workflows/scripts/prompt_hard_rules.mjs';
import { buildRuntimePromptDraft, readRuntimePromptBuilderConfig } from '../workflows/scripts/prompt_utils.mjs';
import {
  PROMPT_PROFILE_STAGE_KEYS,
  hasPromptProfileOverrides,
  normalizePromptProfile,
} from '../workflows/scripts/prompt_profile_contract.mjs';
import {
  PIPELINE_ACTION_LABELS,
  REEL_TYPE_LABELS,
  REEL_TYPES,
  createPipelineRun,
  getDefaultReelType,
  getPipelineRunById,
  listPipelineRuns,
  normalizeReelType,
} from '../pipeline/runs.mjs';
import { ensurePipelineSchema } from '../pipeline/schema.mjs';
import {
  approvePipelineReview,
  getPipelineReviewById,
  listPipelineReviews,
} from '../pipeline/reviews.mjs';

const require = createRequire(import.meta.url);

function loadPgModule() {
  try {
    return require('/usr/local/lib/node_modules/n8n/node_modules/pg');
  } catch {
    return require('pg');
  }
}

const { Pool } = loadPgModule();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const STATIC_ROOT = path.join(__dirname, 'public');
const PROMPTS_ROOT = path.join(REPO_ROOT, 'prompts');
const ENV_FILE = path.join(REPO_ROOT, '.env');
const PORT = Number.parseInt(String(process.env.STUDIO_UI_PORT || '7780'), 10) || 7780;
const field = (key, label, description, examples = [], options = {}) => ({
  key,
  label,
  description,
  examples,
  ...options,
});
const TOPIC_CONFIDENCE_LABELS = Object.freeze(['unverified', 'legend', 'disputed', 'likely', 'confirmed']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHARACTER_REFERENCE_MAX_BYTES = 20 * 1024 * 1024;
const CHARACTER_REFERENCE_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PUBLISH_APPROVAL_SCHEMA_SQL = `
create table if not exists publish_approvals (
  approval_id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items(content_id) on delete cascade,
  platform text not null default 'instagram',
  platform_account_id text not null,
  platform_account_username text,
  package_type text not null default 'instagram_reel',
  selected_video_id uuid references renders(render_id) on delete set null,
  selected_asset_id uuid references assets(asset_id) on delete set null,
  qa_status text not null default 'unknown',
  qa_result_json jsonb not null default '{}'::jsonb,
  approval_status text not null default 'pending',
  approved_by text,
  approved_at timestamptz,
  approval_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, platform, package_type)
);
create index if not exists idx_publish_approvals_content_id on publish_approvals (content_id);
create index if not exists idx_publish_approvals_status on publish_approvals (platform, package_type, approval_status);
`;
const CLIENT_ACCOUNT_CONTEXT_SCHEMA_SQL = `
create table if not exists client_account_contexts (
  account_context_id uuid primary key default gen_random_uuid(),
  account_context_key text not null unique,
  client_name text not null default 'Default Client',
  brand_profile text not null default 'default',
  platform text not null default 'instagram',
  platform_account_id text,
  platform_account_username text,
  context_json jsonb not null default '{}'::jsonb,
  context_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_client_account_contexts_platform
  on client_account_contexts (platform, platform_account_id);
create table if not exists content_account_contexts (
  content_id uuid primary key references content_items(content_id) on delete cascade,
  account_context_id uuid references client_account_contexts(account_context_id) on delete set null,
  account_context_key text not null,
  context_snapshot_json jsonb not null default '{}'::jsonb,
  snapshot_version text not null default '1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_content_account_contexts_key
  on content_account_contexts (account_context_key);
`;

const PROMPT_STEP_GROUPS = Object.freeze([
  {
    stepKey: 'idea_ingest',
    stepTitle: 'Idea Ingest',
    files: [
      { path: 'idea_ingest/system.md', label: 'System Prompt' },
      { path: 'idea_ingest/user.md', label: 'User Prompt' },
      { path: 'idea_ingest/response-schema.json', label: 'Response Schema' },
    ],
  },
  {
    stepKey: 'story_package_generation',
    stepTitle: 'Story Package V2',
    files: [
      { path: 'story_package_generation/system.md', label: 'System Prompt' },
      { path: 'story_package_generation/user.md', label: 'User Prompt' },
      { path: 'story_package_generation/response-schema.json', label: 'Response Schema' },
    ],
  },
  {
    stepKey: 'research_and_script',
    stepTitle: 'Research & Script',
    files: [
      { path: 'research_and_script/system.md', label: 'System Prompt' },
      { path: 'research_and_script/user.md', label: 'User Prompt' },
      { path: 'research_and_script/response-schema.json', label: 'Response Schema' },
    ],
  },
  {
    stepKey: 'director_contract',
    stepTitle: 'Director Contract',
    files: [
      { path: 'director/system.md', label: 'System Prompt' },
      { path: 'director/user.md', label: 'User Prompt' },
      { path: 'director/response-schema.json', label: 'Response Schema' },
    ],
  },
  {
    stepKey: 'storyboard_and_prompts',
    stepTitle: 'Storyboard & Prompts',
    files: [
      { path: 'storyboard_and_prompts/system.md', label: 'System Prompt' },
      { path: 'storyboard_and_prompts/user.md', label: 'User Prompt' },
      { path: 'storyboard_and_prompts/response-schema.json', label: 'Response Schema' },
    ],
  },
  {
    stepKey: 'caption_and_hashtags',
    stepTitle: 'Caption & Hashtags',
    files: [
      { path: 'caption_and_hashtags/system.md', label: 'System Prompt' },
      { path: 'caption_and_hashtags/user.md', label: 'User Prompt' },
      { path: 'caption_and_hashtags/response-schema.json', label: 'Response Schema' },
    ],
  },
  {
    stepKey: 'scene_asset_generation',
    stepTitle: 'Scene Image Generation',
    files: [
      { path: 'scene_asset_generation/prompt.md', label: 'Image Prompt' },
    ],
  },
  {
    stepKey: 'narration_generation',
    stepTitle: 'Narration Generation',
    files: [
      { path: 'narration_generation/instructions.md', label: 'Voice Instructions' },
    ],
  },
  {
    stepKey: 'post_image_generation',
    stepTitle: 'Post Image Generation',
    files: [
      { path: 'post_image_generation/prompt.md', label: 'Image Prompt' },
    ],
  },
]);
const ACTIVE_PROMPT_FILES = Object.freeze(PROMPT_STEP_GROUPS.flatMap((group) => group.files.map((file) => file.path)));
const ACTIVE_PROMPT_FILE_SET = new Set(ACTIVE_PROMPT_FILES);
const PROMPT_STEP_BY_PATH = new Map(
  PROMPT_STEP_GROUPS.flatMap((group) => group.files.map((file) => [
    file.path,
    {
      stepKey: group.stepKey,
      stepTitle: group.stepTitle,
      fileLabel: file.label,
    },
  ])),
);
const PLACEHOLDER_HELP = Object.freeze({
  idea_ingest: {
    abstract_idea: { label: 'Abstract Idea', description: 'The raw user text that should become a valid topic injection payload.', examples: ['A village that reappears when the lake dries up', 'A political compromise that changed a state capital'] },
    allowed_confidence_labels_json: { label: 'Allowed Confidence Labels', description: 'The exact confidence labels the model must choose from.', examples: ['["unverified","legend","disputed","likely","confirmed"]'] },
    target_duration_min_seconds: { label: 'Min Duration', description: 'The minimum allowed runtime for injected topic rows.', examples: ['15', '150'] },
    target_duration_max_seconds: { label: 'Max Duration', description: 'The maximum allowed runtime for injected topic rows.', examples: ['180'] },
    target_duration_default_seconds: { label: 'Default Duration', description: 'The default runtime to use when the abstract idea does not imply a different length.', examples: ['45', '160'] },
  },
  research_and_script: {
    topic: { label: 'Topic', description: 'The core topic title for the Reel.', examples: ['The Dyatlov Pass Incident', 'Why Kurnool became Andhra’s capital'] },
    category: { label: 'Category', description: 'The content bucket used to shape tone and framing.', examples: ['mystery', 'history'] },
    content_language: { label: 'Content Language', description: 'The language the written output should use. This pipeline currently resolves to English only.', examples: ['English'] },
    target_duration_seconds: { label: 'Target Duration', description: 'Desired runtime for the main narration package.', examples: ['45', '160'] },
    confidence_context: { label: 'Confidence Context', description: 'How cautiously the story should treat disputed facts.', examples: ['Current stored confidence label: disputed.', 'Current stored confidence label: confirmed.'] },
    source_notes: { label: 'Source Notes', description: 'The factual boundary for research and scripting.', examples: ['Tent found cut open from the inside.', 'Kurnool was selected after regional negotiations.'] },
    brand_tone: { label: 'Brand Tone', description: 'The channel voice for this writing stage.', examples: ['cinematic, concise, credible', 'measured, suspenseful, grounded'] },
    narrator_style: { label: 'Narrator Style', description: 'How the spoken script should feel when read aloud.', examples: ['calm, serious, engaging', 'measured, eerie, intimate'] },
    ending_signature_family: { label: 'Ending Signature', description: 'The flavor of the closing line.', examples: ['thought-provoking close', 'quiet unresolved ending'] },
    creative_defaults_json: { label: 'Creative Defaults JSON', description: 'Idea-ingest creative defaults that replace the old v1 prompt-profile call.', examples: ['{"narrative_perspective":"first-person survivor","visual_strategy":"intimate, indirect, non-graphic"}'] },
    narrative_perspective: { label: 'Narrative Perspective', description: 'The point of view the script must preserve.', examples: ['first-person survivor narration', 'investigative documentary narration'] },
    voice_role_hint: { label: 'Voice Role Hint', description: 'Idea-level voice performance preference.', examples: ['calm female, intimate', 'documentary narrator, measured'] },
    visual_strategy: { label: 'Visual Strategy', description: 'High-level visual approach from idea ingest.', examples: ['respectful indirect visuals, closed doors, support office details', 'archival realism with restrained camera distance'] },
    music_mood: { label: 'Music Mood', description: 'Idea-level music mood for the script and director contract.', examples: ['soft tense piano, intimate, no vocals', 'low investigative pulse, restrained strings'] },
    language_guidance: { label: 'Language Guidance', description: 'Extra instruction for how English should be used.', examples: ['Keep the wording natural and voiceover-friendly in English.', 'Use plain spoken English with clean sentence rhythm.'] },
    timing_guidance: { label: 'Timing Guidance', description: 'Specific pacing guidance for the narration package.', examples: ['Aim for roughly 110 spoken words total.', 'Keep the main narration under 160 seconds without rushing.'] },
  },
  director_contract: {
    title: { label: 'Title', description: 'Story title used to anchor the director contract.', examples: ['The Mary Celeste Mystery', 'A Survivor Tells Her Story'] },
    category: { label: 'Category', description: 'Category context for voice, visual style, and pacing.', examples: ['mystery', 'social issue'] },
    target_duration_seconds: { label: 'Target Duration', description: 'Desired Reel runtime.', examples: ['45', '160'] },
    scene_count: { label: 'Scene Count', description: 'Number of timed script scenes the contract must match.', examples: ['5', '7'] },
    narration_script: { label: 'Narration Script', description: 'Final script that the contract directs without rewriting.', examples: ['I learned to speak only when the room was empty...'] },
    script_scene_guidance_json: { label: 'Script Scene Guidance JSON', description: 'Timed scene beats from research_and_script.', examples: ['[{"scene_number":1,"visual_beat":"a survivor alone at a window"}]'] },
    creative_defaults_json: { label: 'Creative Defaults JSON', description: 'Idea-ingest defaults for perspective, tone, visuals, pacing, mood, and avoid rules.', examples: ['{"voice_role_hint":"calm female","music_mood":"soft tense piano"}'] },
    language_guidance: { label: 'Language Guidance', description: 'Language guidance injected for prompt consistency.', examples: ['Keep the output aligned to natural English.'] },
  },
  storyboard_and_prompts: {
    title: { label: 'Title', description: 'Story title used to anchor the storyboard.', examples: ['The Mary Celeste Mystery', 'Andhra Capital politics in 1952'] },
    category: { label: 'Category', description: 'Category context for visual style decisions.', examples: ['mystery', 'history'] },
    content_language: { label: 'Content Language', description: 'Language context for subtitle and storyboard planning. This pipeline currently resolves to English only.', examples: ['English'] },
    target_duration_seconds: { label: 'Target Duration', description: 'Desired overall Reel runtime for scene planning.', examples: ['45', '160'] },
    narration_script: { label: 'Narration Script', description: 'The final narration that the storyboard must follow.', examples: ['What if the crew vanished without a trace?', 'In 1952, Kurnool became Andhra’s capital...'] },
    script_scene_guidance_json: { label: 'Script Scene Guidance JSON', description: 'Timed scene beat guide generated during the script stage; storyboard turns these into final visual prompts.', examples: ['[{\"scene_number\":1,\"beat_label\":\"classified files\",\"start_time_seconds\":0,\"end_time_seconds\":10,\"duration_seconds\":10,\"narration_text\":\"The experiment began in secret.\",\"visual_beat\":\"sealed files on a desk under a dim bulb\"}]'] },
    brand_tone: { label: 'Brand Tone', description: 'The overall storytelling tone for the visual plan.', examples: ['cinematic, concise, credible', 'somber, historical, restrained'] },
    visual_style_rules: { label: 'Visual Style Rules', description: 'Reusable visual rules for scene prompts.', examples: ['dark, atmospheric, documentary-realistic', 'bright archival realism, clean focal framing'] },
    subtitle_style_rules: { label: 'Subtitle Style Rules', description: 'Subtitle readability and placement rules.', examples: ['short lines, centered safe zone', 'two-line max, high contrast, mobile readable'] },
    language_guidance: { label: 'Language Guidance', description: 'How English subtitle and storyboard phrasing should be handled.', examples: ['Keep subtitles in concise English.', 'Use short, mobile-readable English subtitle phrasing.'] },
    storyboard_timing_guidance: { label: 'Storyboard Timing Guidance', description: 'How scene durations should be planned against the target runtime.', examples: ['Keep most scenes between 4 and 10 seconds.', 'Stay within about 5% of the target duration.'] },
    narration_alignment_guidance: { label: 'Narration Alignment Guidance', description: 'How tightly scenes should map to spoken beats.', examples: ['One clear spoken beat per scene.', 'Do not let a single image cover multiple unrelated narration turns.'] },
    render_timing_guidance: { label: 'Render Timing Guidance', description: 'How scene timing should behave for the downstream render timeline.', examples: ['Use clean timing for a 30fps vertical cut.', 'Avoid chaotic micro-beats under 2 seconds.'] },
  },
  caption_and_hashtags: {
    title: { label: 'Title', description: 'Story title that anchors the caption strategy.', examples: ['The Lost Colony of Roanoke', 'The Mary Celeste Mystery'] },
    category: { label: 'Category', description: 'Category context for caption tone.', examples: ['history', 'mystery'] },
    content_language: { label: 'Content Language', description: 'Language the caption should be written in. This pipeline currently resolves to English only.', examples: ['English'] },
    content_status: { label: 'Content Status', description: 'Current pipeline stage for the content item.', examples: ['render_complete', 'storyboard_complete'] },
    selected_hook: { label: 'Selected Hook', description: 'The winning hook from the research stage.', examples: ['What if the crew vanished without a trace?', 'In 1952, one political choice changed Andhra forever.'] },
    narration_script: { label: 'Narration Script', description: 'Narration context for caption generation.', examples: ['What if the ship was never meant to be found?', 'In 1952, Kurnool became Andhra’s capital...'] },
    caption_draft_or_none: { label: 'Caption Draft', description: 'Earlier draft caption, if available.', examples: ['A ship found intact, but the crew was gone.', 'None'] },
    cta_line_or_none: { label: 'CTA Seed', description: 'Optional CTA seed from the script stage.', examples: ['Would you have believed it?', 'None'] },
    cover_prompt_or_none: { label: 'Cover Prompt Context', description: 'Cover-image context that can inform caption framing.', examples: ['Stormy abandoned ship at dusk', 'None'] },
    brand_tone: { label: 'Brand Tone', description: 'Tone used for caption generation.', examples: ['cinematic, concise, credible', 'curious, restrained, high-retention'] },
    language_guidance: { label: 'Language Guidance', description: 'Specific instruction for the English caption style.', examples: ['Keep the final caption in plain English.', 'Use crisp conversational English while keeping hashtags relevant.'] },
  },
  scene_asset_generation: {
    title: { label: 'Title', description: 'Story title for scene-image context.', examples: ['Andhra Capital politics in 1952', 'The Dyatlov Pass Incident'] },
    category: { label: 'Category', description: 'Category context for visual treatment.', examples: ['history', 'mystery'] },
    content_language: { label: 'Content Language', description: 'Language context for any implied cultural details. This pipeline currently resolves to English only.', examples: ['English'] },
    scene_number: { label: 'Scene Number', description: 'The scene index inside the storyboard.', examples: ['1', '5'] },
    scene_duration_seconds: { label: 'Scene Duration', description: 'How long that single scene will stay on screen.', examples: ['5', '11.5'] },
    selected_hook: { label: 'Selected Hook', description: 'Hook context for the visual mood.', examples: ['What if the truth was stranger?', 'One political choice changed Andhra forever.'] },
    narration_text: { label: 'Narration Text', description: 'The exact spoken beat the image should represent.', examples: ['The ship was found drifting, fully stocked.', 'Kurnool was chosen after a hard regional compromise.'] },
    visual_prompt: { label: 'Visual Prompt', description: 'Direct scene direction from the storyboard.', examples: ['Abandoned ship at dawn with still water', 'Historic assembly hall under tense debate'] },
    mood: { label: 'Mood', description: 'The emotional color of the scene.', examples: ['uneasy', 'tense but dignified'] },
    transition: { label: 'Transition', description: 'How the scene hands off to the next one.', examples: ['slow dissolve', 'hard cut'] },
    narration_script_excerpt: { label: 'Narration Excerpt', description: 'Broader story context beyond the single beat.', examples: ['Overall story context for scene sequencing', 'Short excerpt from the main narration'] },
    style_notes: { label: 'Style Notes', description: 'Reusable image-style notes for scene generation.', examples: ['cinematic, moody, realistic', 'archival realism, warm historic tones'] },
    scene_timing_guidance: { label: 'Scene Timing Guidance', description: 'Specific timing instruction for this single scene image.', examples: ['The image should read instantly within 5 seconds.', 'Keep the focal subject clear for an 11-second hold.'] },
    story_alignment_guidance: { label: 'Story Alignment Guidance', description: 'Instruction to keep the image tied to the exact spoken beat.', examples: ['Represent the exact narration beat, not a generic mood board.', 'Keep the frame anchored to the political debate being described.'] },
  },
  narration_generation: {
    title: { label: 'Title', description: 'Story title passed to the TTS instruction prompt.', examples: ['The Mary Celeste Mystery', 'Andhra Capital politics in 1952'] },
    narration_script: { label: 'Narration Script', description: 'The exact text that the narration stage reads aloud.', examples: ['What if the crew vanished without a trace?', 'In 1952, Kurnool became Andhra’s capital...'] },
    content_language: { label: 'Content Language', description: 'Language the spoken narration should use. This pipeline currently resolves to English only.', examples: ['English'] },
    target_duration_seconds: { label: 'Target Duration', description: 'Desired total narration runtime.', examples: ['45', '160'] },
    narration_style: { label: 'Narration Style', description: 'Delivery style for the spoken narration instructions.', examples: ['calm, human, emotionally grounded, clear', 'measured, eerie, intimate, restrained'] },
    narration_timing_guidance: { label: 'Narration Timing Guidance', description: 'Specific pacing instruction for the voice performance.', examples: ['Keep the hook crisp and scene boundaries clear.', 'Finish close to 160 seconds with short pauses between major beats.'] },
    background_music_direction: { label: 'Background Music Direction', description: 'Short direction for the ideal subtle instrumental bed under the narration.', examples: ['subtle low strings and restrained war drums, no vocals', 'soft eerie drone with sparse piano, no vocals'] },
    scene_timing_plan: { label: 'Scene Timing Plan', description: 'Per-scene schedule that the narrator should respect.', examples: ['Scene 1: 0s to 6s | abandoned ship revealed', 'Scene 4: 42s to 58s | political compromise enters focus'] },
  },
  post_image_generation: {
    title: { label: 'Title', description: 'Story title used for post-image generation.', examples: ['The Lost Colony of Roanoke', 'Andhra Capital politics in 1952'] },
    category: { label: 'Category', description: 'Category context for image style.', examples: ['history', 'mystery'] },
    content_language: { label: 'Content Language', description: 'Language context for any implied cultural details in the image. This pipeline currently resolves to English only.', examples: ['English'] },
    selected_hook: { label: 'Selected Hook', description: 'The winning hook used to focus the single-image concept.', examples: ['What if a whole colony vanished?', 'What did Kurnool becoming the capital really mean?'] },
    caption_final: { label: 'Final Caption', description: 'Publish-ready caption that can influence the cover direction.', examples: ['The colony was gone. Only one word remained.', 'Kurnool became Andhra’s capital in 1952.'] },
    narration_script_excerpt: { label: 'Narration Excerpt', description: 'Narration context that informs the cover image.', examples: ['Short excerpt from the Reel narration', 'Condensed political-historical framing'] },
    cover_prompt_direction: { label: 'Cover Prompt Direction', description: 'High-level visual direction for the post image.', examples: ['Use a cinematic mystery-documentary composition.', 'Historic political assembly with cinematic realism.'] },
    style_notes: { label: 'Style Notes', description: 'Stylistic notes for the post image.', examples: ['dark, atmospheric, realistic', 'clean historic realism, editorial lighting'] },
    story_alignment_guidance: { label: 'Story Alignment Guidance', description: 'Instruction to keep the single image tied to the real story beat.', examples: ['Represent the main story beat, not a generic mystery collage.', 'Match the hook and caption instead of inventing a new angle.'] },
  },
});
const DEFAULT_TOPIC_DURATION_CONFIG = Object.freeze({
  min: 15,
  max: 180,
  defaultValue: 45,
});

const pool = new Pool({
  host: String(process.env.DB_POSTGRESDB_HOST || process.env.POSTGRES_HOST || 'postgres').trim(),
  port: Number.parseInt(String(process.env.DB_POSTGRESDB_PORT || '5432'), 10) || 5432,
  database: String(process.env.DB_POSTGRESDB_DATABASE || process.env.POSTGRES_DB || '').trim(),
  user: String(process.env.DB_POSTGRESDB_USER || process.env.POSTGRES_USER || '').trim(),
  password: String(process.env.DB_POSTGRESDB_PASSWORD || process.env.POSTGRES_PASSWORD || '').trim(),
});

const WORKFLOWS = [
  {
    key: 'wf_end_to_end_reel_generate_and_publish',
    name: 'One-Click Reel Generate + Publish',
    description: 'Runs the full narrated Reel path from idea-approved topic through live Instagram publish.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_end_to_end_reel_generate_and_publish.json'),
  },
  {
    key: 'wf_end_to_end_reel_generate_and_publish_v2',
    name: 'Generate + Inject + Publish Video',
    description: 'Runs the premium one-call story package path, then video scene generation, narration, render, caption, and publish.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_end_to_end_reel_generate_and_publish_v2.json'),
  },
  {
    key: 'wf_story_package_generation',
    name: 'Story Package Generation V2',
    description: 'Uses one premium model call to create creative direction, script, storyboard, scene prompts, and render seed.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_story_package_generation.json'),
  },
  {
    key: 'wf_research_and_script',
    name: 'Research and Script',
    description: 'Turns an idea-approved topic into hooks, narration, caption draft, CTA, on-screen text metadata, and timed scene beats.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_research_and_script.json'),
  },
  {
    key: 'wf_director_contract',
    name: 'Director Contract',
    description: 'Creates the voice, TTS, style, pacing, music, mood, energy, and avoid-rule contract for v1.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_director.json'),
  },
  {
    key: 'wf_storyboard_and_prompts',
    name: 'Storyboard and Prompts',
    description: 'Builds storyboard scenes, subtitle lines, cover direction, and render-manifest seed.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_storyboard_and_prompts.json'),
  },
  {
    key: 'wf_validation_check',
    name: 'Validation Check',
    description: 'Checks storyboard timing, title-card duration, text rules, TTS instructions, and render seed before asset generation.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_validation_check.json'),
  },
  {
    key: 'wf_asset_generation',
    name: 'Scene Asset Generation',
    description: 'Generates scene images for storyboard scenes.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_asset_generation.json'),
  },
  {
    key: 'wf_narration_generation',
    name: 'Narration Generation',
    description: 'Generates narration audio and rehosts it.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_narration_generation.json'),
  },
  {
    key: 'wf_render_manifest_construction',
    name: 'Render Manifest Construction',
    description: 'Builds the canonical render manifest from scenes and narration.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_render_manifest_construction.json'),
  },
  {
    key: 'wf_render_worker_dispatch',
    name: 'Render Worker Dispatch',
    description: 'Queues a render request for the worker.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_render_worker_dispatch.json'),
  },
  {
    key: 'wf_caption_and_hashtags',
    name: 'Caption Metadata',
    description: 'Runs caption-and-hashtags metadata generation for publish-ready copy.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_caption_and_hashtags.json'),
  },
  {
    key: 'wf_instagram_reel_publish',
    name: 'Instagram Reel Publish',
    description: 'Publishes the latest render-complete Reel candidate to Instagram.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_instagram_reel_publish.json'),
  },
  {
    key: 'wf_simple_post_image_asset',
    name: 'Simple Post Image Asset',
    description: 'Generates the static feed post image asset.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_simple_post_image_asset.json'),
  },
  {
    key: 'wf_content_approval',
    name: 'Content Approval',
    description: 'Advances or rejects the simple-post manual approval gate.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_content_approval.json'),
  },
  {
    key: 'wf_instagram_simple_post_publish',
    name: 'Instagram Simple Post Publish',
    description: 'Publishes the latest ready image post candidate to Instagram.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_instagram_simple_post_publish.json'),
  },
  {
    key: 'wf_instagram_metrics_collection',
    name: 'Instagram Metrics Collection',
    description: 'Fetches live or stub Instagram metrics for published content.',
    file: path.join(REPO_ROOT, 'workflows/n8n/wf_instagram_metrics_collection.json'),
  },
];
const DEFAULT_ABSTRACT_IDEA_WORKFLOW_KEY = 'wf_end_to_end_reel_generate_and_publish';
const SECRET_VALUE_MASK = '********';
const TEXT_PROVIDER_OPTIONS = Object.freeze([
  { value: 'anthropic', label: 'Anthropic Claude', key_env: ['ANTHROPIC_API_KEY', 'TEXT_ANTHROPIC_API_KEY', 'PREMIUM_TEXT_ANTHROPIC_API_KEY'] },
  { value: 'openai', label: 'OpenAI', key_env: ['OPENAI_API_KEY', 'TEXT_OPENAI_API_KEY', 'PREMIUM_TEXT_OPENAI_API_KEY', 'LLL_API_KEY'] },
]);
const MODEL_SUGGESTIONS = Object.freeze({
  openai_text: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
  anthropic_text: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5', 'claude-sonnet-4-5-20250929', 'claude-opus-4-1', 'claude-sonnet-4-20250514', 'claude-sonnet-4-6'],
  openai_image: ['gpt-image-1', 'gpt-image-1-mini'],
  fal_image: ['fal-ai/flux/schnell', 'fal-ai/flux/dev', 'fal-ai/imagen4/preview'],
  fal_video: ['fal-ai/wan-t2v', 'fal-ai/wan/v2.7/reference-to-video'],
  tts_fish_audio: ['s2-pro', 's1', 'speech-1.6'],
  tts_openai: ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'],
  tts_smallest_ai: ['lightning-v3.1', 'lightning-v3'],
  render: ['remotion', 'local_ffmpeg'],
});
const MODEL_ROUTE_GROUPS = Object.freeze([
  {
    id: 'defaults',
    title: 'Fallback Defaults',
    description: 'Used when a task-specific route is blank.',
    routes: [
      { label: 'Text fallback', providerKey: 'TEXT_LLM_PROVIDER', openaiModelKey: 'TEXT_MODEL', anthropicModelKey: 'TEXT_ANTHROPIC_MODEL', description: 'General fallback for structured text calls.' },
      { label: 'Premium text fallback', providerKey: 'PREMIUM_TEXT_LLM_PROVIDER', openaiModelKey: 'PREMIUM_TEXT_MODEL', anthropicModelKey: 'PREMIUM_TEXT_ANTHROPIC_MODEL', description: 'Higher-quality fallback for creative and QA-heavy stages.' },
      { label: 'Prompt builder fallback', providerKey: 'PROMPT_BUILDER_LLM_PROVIDER', openaiModelKey: 'PROMPT_BUILDER_MODEL', anthropicModelKey: 'PROMPT_BUILDER_ANTHROPIC_MODEL', description: 'Used by the Studio prompt/profile generator.' },
    ],
  },
  {
    id: 'story',
    title: 'Story, Script, and Direction',
    description: 'Creative text stages that shape the Reel.',
    routes: [
      { label: 'Idea ingest', providerKey: 'IDEA_INGEST_LLM_PROVIDER', openaiModelKey: 'IDEA_INGEST_MODEL', anthropicModelKey: 'IDEA_INGEST_ANTHROPIC_MODEL', description: 'Turns an abstract idea into a pipeline topic.' },
      { label: 'Research script', providerKey: 'RESEARCH_LLM_PROVIDER', openaiModelKey: 'RESEARCH_MODEL', anthropicModelKey: 'RESEARCH_ANTHROPIC_MODEL', description: 'Research/script generation path.' },
      { label: 'Story package', providerKey: 'STORY_PACKAGE_LLM_PROVIDER', openaiModelKey: 'STORY_PACKAGE_MODEL', anthropicModelKey: 'STORY_PACKAGE_ANTHROPIC_MODEL', description: 'Main one-pass story package generation.' },
      { label: 'Story package V2', providerKey: 'STORY_PACKAGE_V2_LLM_PROVIDER', openaiModelKey: 'STORY_PACKAGE_V2_MODEL', anthropicModelKey: 'STORY_PACKAGE_V2_ANTHROPIC_MODEL', description: 'Optional V2 story package route.' },
      { label: 'Director contract', providerKey: 'DIRECTOR_LLM_PROVIDER', openaiModelKey: 'DIRECTOR_CONTRACT_MODEL', anthropicModelKey: 'DIRECTOR_CONTRACT_ANTHROPIC_MODEL', description: 'Direction, style, voice, risk, and edit contract.' },
      { label: 'Storyboard', providerKey: 'STORYBOARD_LLM_PROVIDER', openaiModelKey: 'STORYBOARD_MODEL', anthropicModelKey: 'STORYBOARD_ANTHROPIC_MODEL', description: 'Storyboard and prompt generation when that legacy stage is active.' },
    ],
  },
  {
    id: 'media',
    title: 'Visual, Voice, Avatar, QA',
    description: 'Stages where quality and consistency matter most.',
    routes: [
      { label: 'Visual prompt builder', providerKey: 'VISUAL_PROMPT_LLM_PROVIDER', openaiModelKey: 'VISUAL_PROMPT_MODEL', anthropicModelKey: 'VISUAL_PROMPT_ANTHROPIC_MODEL', description: 'Refines image/video prompts before provider calls.' },
      { label: 'Voice performance', providerKey: 'VOICE_PERFORMANCE_LLM_PROVIDER', openaiModelKey: 'VOICE_PERFORMANCE_MODEL', anthropicModelKey: 'VOICE_PERFORMANCE_ANTHROPIC_MODEL', description: 'Adds human delivery direction without rewriting clean narration.' },
      { label: 'Avatar selector', providerKey: 'AVATAR_LLM_PROVIDER', openaiModelKey: 'AVATAR_MODEL', anthropicModelKey: 'AVATAR_ANTHROPIC_MODEL', description: 'Avatar route, consent, fallback, disclosure, and presenter direction.' },
      { label: 'Caption', providerKey: 'CAPTION_LLM_PROVIDER', openaiModelKey: 'CAPTION_MODEL', anthropicModelKey: 'CAPTION_ANTHROPIC_MODEL', description: 'Caption and hashtag generation when LLM captioning is active.' },
      { label: 'Final QA', providerKey: 'FINAL_QA_LLM_PROVIDER', openaiModelKey: 'FINAL_QA_MODEL', anthropicModelKey: 'FINAL_QA_ANTHROPIC_MODEL', description: 'Strict publish-readiness validation.' },
      { label: 'Performance feedback', providerKey: 'PERFORMANCE_FEEDBACK_LLM_PROVIDER', openaiModelKey: 'PERFORMANCE_FEEDBACK_MODEL', anthropicModelKey: 'PERFORMANCE_FEEDBACK_ANTHROPIC_MODEL', description: 'Reusable learnings from previous performance.' },
    ],
  },
]);
const NON_TEXT_MODEL_GROUPS = Object.freeze([
  {
    id: 'media-adapters',
    title: 'Media, Voice, and Render Adapters',
    description: 'Provider/model selectors outside structured text.',
    routes: [
      { label: 'Image fallback', providerKey: 'IMAGE_GENERATION_PROVIDER', modelKey: 'IMAGE_MODEL', providerOptions: ['openai', 'fal_ai'], modelSuggestions: { openai: MODEL_SUGGESTIONS.openai_image, fal_ai: MODEL_SUGGESTIONS.fal_image }, description: 'Global image generation fallback.' },
      { label: 'Scene images', providerKey: 'SCENE_IMAGE_PROVIDER', modelKey: 'SCENE_IMAGE_MODEL', providerOptions: ['openai', 'fal_ai'], modelSuggestions: { openai: MODEL_SUGGESTIONS.openai_image, fal_ai: MODEL_SUGGESTIONS.fal_image }, description: 'Scene image provider and model.' },
      { label: 'Reference images', providerKey: 'SCENE_REFERENCE_IMAGE_PROVIDER', modelKey: 'SCENE_REFERENCE_IMAGE_MODEL', providerOptions: ['openai'], modelSuggestions: { openai: MODEL_SUGGESTIONS.openai_image }, description: 'Reference-image path for character/reference workflows.' },
      { label: 'Post image', providerKey: 'POST_IMAGE_PROVIDER', modelKey: 'POST_IMAGE_MODEL', providerOptions: ['openai', 'fal_ai'], modelSuggestions: { openai: MODEL_SUGGESTIONS.openai_image, fal_ai: MODEL_SUGGESTIONS.fal_image }, description: 'Single post or cover image generation.' },
      { label: 'Scene video', providerKey: '', modelKey: 'WAN_VIDEO_MODEL', providerOptions: ['fal_ai'], modelSuggestions: { fal_ai: MODEL_SUGGESTIONS.fal_video }, description: 'Fal/Wan text-to-video scene generation.' },
      { label: 'Reference video', providerKey: '', modelKey: 'WAN_REFERENCE_VIDEO_MODEL', providerOptions: ['fal_ai'], modelSuggestions: { fal_ai: MODEL_SUGGESTIONS.fal_video }, description: 'Fal/Wan reference-to-video model.' },
      { label: 'Narration TTS', providerKey: 'NARRATION_PROVIDER', modelKey: 'NARRATION_MODEL', providerOptions: ['fish_audio', 'openai', 'smallest_ai'], modelSuggestions: { fish_audio: MODEL_SUGGESTIONS.tts_fish_audio, openai: MODEL_SUGGESTIONS.tts_openai, smallest_ai: MODEL_SUGGESTIONS.tts_smallest_ai }, description: 'Narration provider override.' },
      { label: 'TTS fallback', providerKey: 'TTS_PROVIDER', modelKey: 'TTS_MODEL', providerOptions: ['fish_audio', 'openai', 'smallest_ai'], modelSuggestions: { fish_audio: MODEL_SUGGESTIONS.tts_fish_audio, openai: MODEL_SUGGESTIONS.tts_openai, smallest_ai: MODEL_SUGGESTIONS.tts_smallest_ai }, description: 'Global TTS fallback.' },
      { label: 'Renderer', providerKey: '', modelKey: 'RENDER_PROVIDER', providerOptions: ['remotion', 'local_ffmpeg'], modelSuggestions: { remotion: MODEL_SUGGESTIONS.render, local_ffmpeg: MODEL_SUGGESTIONS.render }, description: 'Renderer used by code-first runs.' },
    ],
  },
]);
const CREDENTIAL_GROUPS = Object.freeze([
  {
    id: 'openai',
    title: 'OpenAI',
    description: 'Use the global key unless a component needs a separate billing/project boundary.',
    primary: ['OPENAI_API_KEY', 'TEXT_OPENAI_API_KEY', 'IMAGE_OPENAI_API_KEY', 'TTS_OPENAI_API_KEY'],
    advanced: ['LLL_API_KEY', 'PREMIUM_TEXT_OPENAI_API_KEY', 'IDEA_INGEST_OPENAI_API_KEY', 'IDEA_PROMPT_PROFILE_OPENAI_API_KEY', 'PROMPT_BUILDER_OPENAI_API_KEY', 'RESEARCH_OPENAI_API_KEY', 'DIRECTOR_OPENAI_API_KEY', 'DIRECTOR_CONTRACT_OPENAI_API_KEY', 'STORY_PACKAGE_OPENAI_API_KEY', 'STORY_PACKAGE_V2_OPENAI_API_KEY', 'STORYBOARD_OPENAI_API_KEY', 'CAPTION_OPENAI_API_KEY', 'VISUAL_PROMPT_OPENAI_API_KEY', 'VOICE_PERFORMANCE_OPENAI_API_KEY', 'AVATAR_OPENAI_API_KEY', 'FINAL_QA_OPENAI_API_KEY', 'PERFORMANCE_FEEDBACK_OPENAI_API_KEY', 'SCENE_IMAGE_OPENAI_API_KEY', 'POST_IMAGE_OPENAI_API_KEY', 'NARRATION_OPENAI_API_KEY'],
  },
  {
    id: 'anthropic',
    title: 'Anthropic Claude',
    description: 'One Anthropic key is enough for all Claude text stages unless you intentionally override by task.',
    primary: ['ANTHROPIC_API_KEY', 'TEXT_ANTHROPIC_API_KEY', 'PREMIUM_TEXT_ANTHROPIC_API_KEY'],
    advanced: ['IDEA_INGEST_ANTHROPIC_API_KEY', 'IDEA_PROMPT_PROFILE_ANTHROPIC_API_KEY', 'PROMPT_BUILDER_ANTHROPIC_API_KEY', 'RESEARCH_ANTHROPIC_API_KEY', 'DIRECTOR_ANTHROPIC_API_KEY', 'DIRECTOR_CONTRACT_ANTHROPIC_API_KEY', 'STORY_PACKAGE_ANTHROPIC_API_KEY', 'STORY_PACKAGE_V2_ANTHROPIC_API_KEY', 'STORYBOARD_ANTHROPIC_API_KEY', 'CAPTION_ANTHROPIC_API_KEY', 'VISUAL_PROMPT_ANTHROPIC_API_KEY', 'VOICE_PERFORMANCE_ANTHROPIC_API_KEY', 'AVATAR_ANTHROPIC_API_KEY', 'FINAL_QA_ANTHROPIC_API_KEY', 'PERFORMANCE_FEEDBACK_ANTHROPIC_API_KEY'],
  },
  {
    id: 'fal',
    title: 'Fal AI',
    description: 'Fal powers Flux images and Wan video. Use the global key first, then scene-specific keys only when needed.',
    primary: ['FAL_AI_API_KEY', 'IMAGE_FAL_AI_API_KEY', 'SCENE_VIDEO_FAL_AI_API_KEY'],
    advanced: ['SCENE_IMAGE_FAL_AI_API_KEY', 'POST_IMAGE_FAL_AI_API_KEY', 'WAN_REFERENCE_VIDEO_FAL_AI_API_KEY'],
  },
  {
    id: 'voice-avatar',
    title: 'Voice and Avatar',
    description: 'Narration and HeyGen avatar credentials.',
    primary: ['FISH_AUDIO_API_KEY', 'SMALLEST_AI_API_KEY', 'HEYGEN_API_KEY'],
    advanced: ['TTS_FISH_AUDIO_API_KEY', 'NARRATION_FISH_AUDIO_API_KEY', 'TTS_SMALLEST_AI_API_KEY', 'NARRATION_SMALLEST_AI_API_KEY'],
  },
]);

function isSensitiveConfigKey(key) {
  const normalized = String(key || '').trim().toUpperCase();
  if (!normalized) return false;
  if (normalized.endsWith('_KEY_PATH')) return false;
  return normalized.includes('API_KEY')
    || normalized.endsWith('_TOKEN')
    || normalized.includes('ACCESS_TOKEN')
    || normalized.includes('PASSWORD')
    || normalized.includes('SECRET')
    || normalized.includes('ENCRYPTION_KEY');
}
const workflowJobs = new Map();

const CONFIG_SECTIONS = [
  {
    id: 'studio-ui',
    title: 'Studio UI',
    description: 'These settings control browser-side defaults and validation in the studio.',
    fields: [
      field('STUDIO_TOPIC_TARGET_DURATION_MIN_SECONDS', 'Topic Duration Min', 'Minimum target duration allowed in the New Idea form.', ['15', '30']),
      field('STUDIO_TOPIC_TARGET_DURATION_MAX_SECONDS', 'Topic Duration Max', 'Maximum target duration allowed in the New Idea form.', ['180', '240']),
      field('STUDIO_TOPIC_TARGET_DURATION_DEFAULT_SECONDS', 'Topic Duration Default', 'Default target duration shown in the New Idea form.', ['45', '90']),
    ],
  },
  {
    id: 'global-prompt-defaults',
    title: 'Global Prompt Defaults',
    description: 'These defaults feed prompt placeholders across multiple stages unless a stage-specific override is set.',
    fields: [
      field('CONTENT_LANGUAGE', 'Default Content Language', 'Global prompt language. Non-English values are ignored at runtime because this pipeline is English-only.', ['English']),
    ],
  },
  {
    id: 'research-script',
    title: 'Research & Script Placeholders',
    description: 'These values feed the research-and-script prompt placeholders.',
    fields: [
      field('RESEARCH_LANGUAGE', 'Research Language Override', 'Retained for compatibility. Non-English values are ignored at runtime because this pipeline is English-only.', ['English']),
      field('RESEARCH_BRAND_TONE', 'Research Brand Tone', 'Fallback brand tone injected into the research/script prompt.', ['cinematic, concise, credible', 'measured, suspenseful, grounded']),
      field('RESEARCH_NARRATOR_STYLE', 'Research Narrator Style', 'Fallback narrator delivery style for the research/script prompt.', ['calm, serious, engaging', 'quiet, eerie, intimate']),
      field('RESEARCH_ENDING_SIGNATURE_FAMILY', 'Research Ending Signature', 'Fallback ending signature family for the research/script prompt.', ['thought-provoking close', 'quiet unresolved ending']),
      field('RESEARCH_TIMING_GUIDANCE', 'Research Timing Guidance', 'Optional custom pacing guidance for the research prompt.', ['Aim for roughly 110 spoken words.', 'Keep the narration under 160 seconds without rushing.']),
    ],
  },
  {
    id: 'storyboard',
    title: 'Storyboard & Timing Placeholders',
    description: 'These values guide how storyboard prompts are parameterized for timing and subtitle alignment.',
    fields: [
      field('STORYBOARD_LANGUAGE', 'Storyboard Language Override', 'Retained for compatibility. Non-English values are ignored at runtime because this pipeline is English-only.', ['English']),
      field('STORYBOARD_BRAND_TONE', 'Storyboard Brand Tone', 'Fallback brand tone for storyboard generation.', ['cinematic, concise, credible', 'historical, restrained, vivid']),
      field('STORYBOARD_VISUAL_STYLE_RULES', 'Storyboard Visual Style Rules', 'Fallback visual rules for storyboard generation.', ['dark, atmospheric, documentary-realistic', 'warm archival realism, strong focal point']),
      field('STORYBOARD_SUBTITLE_STYLE_RULES', 'Storyboard Subtitle Style Rules', 'Fallback subtitle rules for storyboard generation.', ['short lines, centered safe zone, high contrast', 'two-line max, mobile readable, clean spacing']),
      field('STORYBOARD_TIMING_GUIDANCE', 'Storyboard Timing Guidance', 'Optional custom timing guidance for storyboard scene durations.', ['Keep most scenes between 4 and 10 seconds.', 'Stay within 5% of the target runtime.']),
      field('STORYBOARD_NARRATION_ALIGNMENT_GUIDANCE', 'Narration Alignment Guidance', 'Optional custom guidance for scene-to-narration matching.', ['One clear spoken beat per scene.', 'Do not let one image cover multiple unrelated narration turns.']),
      field('STORYBOARD_RENDER_TIMING_GUIDANCE', 'Render Timing Guidance', 'Optional custom guidance for how scene timing should behave in the render timeline.', ['Use clean 30fps-friendly durations.', 'Avoid micro-beats under 2 seconds.']),
    ],
  },
  {
    id: 'scene-images',
    title: 'Scene Image Placeholders',
    description: 'These values influence how the storyboard scenes become generated scene images.',
    fields: [
      field('SCENE_IMAGE_LANGUAGE', 'Scene Image Language Override', 'Retained for compatibility. Non-English values are ignored at runtime because this pipeline is English-only.', ['English']),
      field('SCENE_STYLE_NOTES_DEFAULT', 'Scene Style Notes Default', 'Fallback style notes for scene-image generation.', ['cinematic, moody, realistic, vertical-frame storytelling', 'bright archival realism, strong silhouette, mobile-safe framing']),
      field('SCENE_IMAGE_TIMING_GUIDANCE', 'Scene Timing Guidance', 'Optional custom timing guidance injected into each scene-image prompt.', ['Make the focal subject readable instantly within the hold time.', 'Anchor the frame to the exact spoken beat for the scene window.']),
      field('SCENE_IMAGE_STORY_ALIGNMENT_GUIDANCE', 'Scene Story Alignment Guidance', 'Optional custom guidance to keep each scene image tied to the exact storyboard beat.', ['Represent the exact narration beat, not a generic mood board.', 'Keep the image anchored to the current scene only.']),
    ],
  },
  {
    id: 'narration',
    title: 'Narration & Voice',
    description: 'Narration-specific placeholders and voice controls. Voice stays here instead of in the adapter section.',
    studio_visible: true,
    fields: [
      field('NARRATION_LANGUAGE', 'Narration Language Override', 'Retained for compatibility. Non-English values are ignored at runtime because this pipeline is English-only.', ['English']),
      field('NARRATION_STYLE', 'Narration Style Default', 'Fallback narration delivery style used when the prompt builder does not provide a better idea-specific override.', ['calm, human, emotionally grounded, clear', 'measured, eerie, intimate, restrained']),
      field('TTS_VOICE', 'Default TTS Voice', 'Global narration voice fallback.', ['marin', 'cedar', 'onyx', 'echo']),
      field('NARRATION_VOICE', 'Narration Voice Override', 'Narration-stage voice override.', ['marin', 'cedar', 'onyx', 'echo']),
      field('TTS_SPEED', 'Default TTS Speed', 'Global narration speed multiplier. `1.0` is neutral; slightly above `1.0` makes the read a bit faster.', ['1.05', '1.08', '1.0']),
      field('NARRATION_SPEED', 'Narration Speed Override', 'Narration-stage speed multiplier override.', ['1.05', '1.08', '1.0']),
      field('NARRATION_TIMING_GUIDANCE', 'Narration Timing Guidance', 'Optional custom pacing guidance for the TTS instruction prompt.', ['Keep the hook crisp and scene boundaries clear.', 'Finish close to 160 seconds with short pauses between major beats.']),
      field('NARRATION_INSTRUCTIONS', 'Narration Extra Instructions', 'Optional extra instructions appended after the file-backed narration prompt.', ['Softer pauses on historical dates.', 'Slightly deepen the emotional tone near the ending.']),
    ],
  },
  {
    id: 'caption',
    title: 'Caption & Hashtags Placeholders',
    description: 'These values guide the final caption-and-hashtags prompt.',
    fields: [
      field('CAPTION_LANGUAGE', 'Caption Language Override', 'Retained for compatibility. Non-English values are ignored at runtime because this pipeline is English-only.', ['English']),
      field('CAPTION_BRAND_TONE', 'Caption Brand Tone', 'Fallback brand tone for caption generation.', ['cinematic, concise, credible', 'curious, restrained, high-retention']),
      field('CAPTION_LANGUAGE_GUIDANCE', 'Caption Language Guidance', 'Optional custom guidance for English caption style.', ['Keep the final caption in plain English.', 'Use crisp conversational English while keeping discoverable tags relevant.']),
    ],
  },
  {
    id: 'post-image',
    title: 'Post Image Placeholders',
    description: 'These values feed the single-image post prompt path.',
    fields: [
      field('POST_IMAGE_LANGUAGE', 'Post Image Language Override', 'Retained for compatibility. Non-English values are ignored at runtime because this pipeline is English-only.', ['English']),
      field('POST_IMAGE_COVER_PROMPT_DIRECTION_DEFAULT', 'Post Cover Prompt Default', 'Fallback direction for single-image post generation.', ['Use a cinematic mystery-documentary composition.', 'Historic assembly room with one strong focal subject.']),
      field('POST_IMAGE_STYLE_NOTES_DEFAULT', 'Post Image Style Default', 'Fallback style notes for single-image post generation.', ['dark, atmospheric, realistic, cinematic lighting', 'editorial realism, crisp silhouette, warm archival tones']),
      field('POST_IMAGE_STORY_ALIGNMENT_GUIDANCE', 'Post Image Story Alignment Guidance', 'Optional custom guidance to keep the post image tied to the real story beat.', ['Represent the exact story beat instead of a generic mood board.', 'Match the hook and caption, not a new unrelated visual.']),
    ],
  },
  {
    id: 'adapters',
    title: 'Adapters & Models',
    description: 'These settings choose which adapter path and model each stage uses. Studio-saved values are read by new model calls from the local env file.',
    studio_visible: true,
    fields: [
      field('TEXT_LLM_PROVIDER', 'Text LLM Provider', 'Global text provider fallback. Structured text stages support openai and anthropic.', ['openai', 'anthropic']),
      field('PREMIUM_TEXT_LLM_PROVIDER', 'Premium Text Provider', 'Higher-quality fallback for story, visual, voice, avatar, QA, and performance stages.', ['anthropic', 'openai']),
      field('IDEA_INGEST_LLM_PROVIDER', 'Idea Ingest Provider', 'Optional idea-ingest provider override. Leave blank to use Text LLM Provider.', ['openai', 'anthropic']),
      field('IDEA_PROMPT_PROFILE_LLM_PROVIDER', 'Idea Prompt Profile Provider', 'Optional idea prompt-profile provider override. Leave blank to use Prompt Builder or Text provider.', ['openai', 'anthropic']),
      field('PROMPT_BUILDER_LLM_PROVIDER', 'Prompt Builder Provider', 'Optional prompt-builder provider override for the Studio UI generator.', ['openai', 'anthropic']),
      field('RESEARCH_LLM_PROVIDER', 'Research Provider', 'Optional research-stage provider override.', ['openai', 'anthropic']),
      field('DIRECTOR_LLM_PROVIDER', 'Director Provider', 'Optional director-contract provider override.', ['openai', 'anthropic']),
      field('STORY_PACKAGE_LLM_PROVIDER', 'Story Package Provider', 'Optional story-package provider override.', ['anthropic', 'openai']),
      field('STORY_PACKAGE_V2_LLM_PROVIDER', 'Story Package V2 Provider', 'Optional story-package-v2 provider override.', ['anthropic', 'openai']),
      field('STORYBOARD_LLM_PROVIDER', 'Storyboard Provider', 'Optional storyboard-stage provider override.', ['openai', 'anthropic']),
      field('CAPTION_LLM_PROVIDER', 'Caption Provider', 'Optional caption-stage provider override.', ['openai', 'anthropic']),
      field('VISUAL_PROMPT_LLM_PROVIDER', 'Visual Prompt Provider', 'Provider for visual prompt refinement before image/video generation.', ['anthropic', 'openai']),
      field('VOICE_PERFORMANCE_LLM_PROVIDER', 'Voice Performance Provider', 'Provider for narration script performance enrichment before TTS.', ['anthropic', 'openai']),
      field('AVATAR_LLM_PROVIDER', 'Avatar Selector Provider', 'Provider for avatar route, consent, disclosure, and presenter-direction decisions.', ['anthropic', 'openai']),
      field('FINAL_QA_LLM_PROVIDER', 'Final QA Provider', 'Provider for final safety and publish-readiness QA.', ['anthropic', 'openai']),
      field('PERFORMANCE_FEEDBACK_LLM_PROVIDER', 'Performance Feedback Provider', 'Provider for reusable performance-guidance analysis.', ['anthropic', 'openai']),
      field('TEXT_MODEL', 'Text Model', 'Global text model fallback.', ['gpt-4o-mini', 'gpt-4.1-mini']),
      field('PREMIUM_TEXT_MODEL', 'Premium Text Model', 'Higher-quality OpenAI fallback for premium text stages.', ['gpt-4.1', 'gpt-4.1-mini']),
      field('TEXT_ANTHROPIC_MODEL', 'Anthropic Text Model', 'Global Anthropic model fallback for text stages.', ['claude-sonnet-4-6']),
      field('PREMIUM_TEXT_ANTHROPIC_MODEL', 'Premium Anthropic Model', 'Higher-quality Anthropic fallback for premium text stages.', ['claude-sonnet-4-6']),
      field('ANTHROPIC_VERSION', 'Anthropic API Version', 'Anthropic API version header used for Claude structured text requests.', ['2023-06-01']),
      field('ANTHROPIC_MAX_TOKENS', 'Anthropic Max Tokens', 'Maximum tokens for Anthropic structured text responses.', ['4096', '8192']),
      field('IDEA_INGEST_MODEL', 'Idea Ingest Model', 'Model used to turn an abstract idea into a topic payload.', ['gpt-4.1-mini', 'gpt-4o-mini']),
      field('IDEA_INGEST_ANTHROPIC_MODEL', 'Idea Ingest Anthropic Model', 'Anthropic model used to turn an abstract idea into a topic payload.', ['claude-sonnet-4-6']),
      field('IDEA_PROMPT_PROFILE_MODEL', 'Idea Prompt Profile Model', 'Model used for idea prompt profile generation when that stage is enabled.', ['gpt-4.1-mini', 'gpt-4o-mini']),
      field('IDEA_PROMPT_PROFILE_ANTHROPIC_MODEL', 'Idea Prompt Profile Anthropic Model', 'Anthropic model used for idea prompt profile generation when that stage is enabled.', ['claude-sonnet-4-6']),
      field('PROMPT_BUILDER_MODEL', 'Prompt Builder Model', 'Optional prompt-builder model override for the Studio UI generator.', ['gpt-4o-mini', 'gpt-4.1-mini']),
      field('PROMPT_BUILDER_ANTHROPIC_MODEL', 'Prompt Builder Anthropic Model', 'Anthropic model used by the Studio UI prompt generator.', ['claude-sonnet-4-6']),
      field('RESEARCH_MODEL', 'Research Model', 'Research-stage model override.', ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini']),
      field('RESEARCH_ANTHROPIC_MODEL', 'Research Anthropic Model', 'Anthropic model for research/script generation.', ['claude-sonnet-4-6']),
      field('DIRECTOR_CONTRACT_MODEL', 'Director Contract Model', 'Director-contract model override before Director Model.', ['gpt-4.1-mini', 'gpt-4.1']),
      field('DIRECTOR_CONTRACT_ANTHROPIC_MODEL', 'Director Contract Anthropic Model', 'Anthropic model for director-contract generation before Director Anthropic Model.', ['claude-sonnet-4-6']),
      field('DIRECTOR_MODEL', 'Director Model', 'Director-contract model override.', ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1']),
      field('DIRECTOR_ANTHROPIC_MODEL', 'Director Anthropic Model', 'Anthropic model for director stages.', ['claude-sonnet-4-6']),
      field('STORY_PACKAGE_MODEL', 'Story Package Model', 'One-pass story package model override.', ['gpt-4.1', 'gpt-4.1-mini']),
      field('STORY_PACKAGE_ANTHROPIC_MODEL', 'Story Package Anthropic Model', 'Anthropic model for one-pass story package generation.', ['claude-sonnet-4-6']),
      field('STORY_PACKAGE_V2_MODEL', 'Story Package V2 Model', 'V2 story package model override.', ['gpt-4.1', 'gpt-4.1-mini']),
      field('STORY_PACKAGE_V2_ANTHROPIC_MODEL', 'Story Package V2 Anthropic Model', 'Anthropic model for story package V2 generation.', ['claude-sonnet-4-6']),
      field('STORYBOARD_MODEL', 'Storyboard Model', 'Storyboard-stage model override.', ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini']),
      field('STORYBOARD_ANTHROPIC_MODEL', 'Storyboard Anthropic Model', 'Anthropic model for storyboard/prompt generation.', ['claude-sonnet-4-6']),
      field('CAPTION_MODEL', 'Caption Model', 'Caption-stage model override.', ['gpt-4o-mini', 'gpt-4.1-mini']),
      field('CAPTION_ANTHROPIC_MODEL', 'Caption Anthropic Model', 'Anthropic model for caption and hashtag generation.', ['claude-sonnet-4-6']),
      field('VISUAL_PROMPT_MODEL', 'Visual Prompt Model', 'OpenAI model for visual prompt refinement.', ['gpt-4.1-mini', 'gpt-4.1']),
      field('VISUAL_PROMPT_ANTHROPIC_MODEL', 'Visual Prompt Anthropic Model', 'Anthropic model for visual prompt refinement.', ['claude-sonnet-4-6']),
      field('VOICE_PERFORMANCE_MODEL', 'Voice Performance Model', 'OpenAI model for narration performance enrichment.', ['gpt-4.1-mini', 'gpt-4.1']),
      field('VOICE_PERFORMANCE_ANTHROPIC_MODEL', 'Voice Performance Anthropic Model', 'Anthropic model for narration performance enrichment.', ['claude-sonnet-4-6']),
      field('AVATAR_MODEL', 'Avatar Selector Model', 'OpenAI model for avatar route and presenter-direction decisions.', ['gpt-4.1-mini', 'gpt-4.1']),
      field('AVATAR_ANTHROPIC_MODEL', 'Avatar Selector Anthropic Model', 'Anthropic model for avatar route and presenter-direction decisions.', ['claude-sonnet-4-6']),
      field('FINAL_QA_MODEL', 'Final QA Model', 'OpenAI model for final QA.', ['gpt-4.1', 'gpt-4.1-mini']),
      field('FINAL_QA_ANTHROPIC_MODEL', 'Final QA Anthropic Model', 'Anthropic model for final QA.', ['claude-sonnet-4-6']),
      field('PERFORMANCE_FEEDBACK_MODEL', 'Performance Feedback Model', 'OpenAI model for performance feedback analysis.', ['gpt-4.1-mini', 'gpt-4.1']),
      field('PERFORMANCE_FEEDBACK_ANTHROPIC_MODEL', 'Performance Feedback Anthropic Model', 'Anthropic model for performance feedback analysis.', ['claude-sonnet-4-6']),
      field('IMAGE_GENERATION_PROVIDER', 'Image Provider', 'Global image generation provider fallback.', ['openai', 'fal_ai']),
      field('SCENE_IMAGE_PROVIDER', 'Scene Image Provider', 'Scene-image provider override.', ['openai', 'fal_ai']),
      field('SCENE_REFERENCE_IMAGE_PROVIDER', 'Reference Image Provider', 'Provider used when scene images have uploaded reference images.', ['openai']),
      field('POST_IMAGE_PROVIDER', 'Post Image Provider', 'Single-post image provider override.', ['openai', 'fal_ai']),
      field('IMAGE_MODEL', 'Image Model', 'Global image model fallback.', ['gpt-image-1', 'gpt-image-1-mini']),
      field('SCENE_IMAGE_MODEL', 'Scene Image Model', 'Scene-image model override.', ['gpt-image-1-mini', 'gpt-image-1']),
      field('SCENE_REFERENCE_IMAGE_MODEL', 'Reference Image Model', 'Image model used when uploaded references are passed into scene image generation.', ['gpt-image-1', 'gpt-image-1-mini']),
      field('POST_IMAGE_MODEL', 'Post Image Model', 'Single-post image model override.', ['gpt-image-1', 'gpt-image-1-mini']),
      field('WAN_VIDEO_MODEL', 'Wan Video Model', 'Fal/Wan text-to-video model used by video reels.', ['fal-ai/wan-t2v']),
      field('WAN_REFERENCE_VIDEO_MODEL', 'Wan Reference Video Model', 'Fal/Wan reference-to-video model used when character reference video generation is needed.', ['fal-ai/wan/v2.7/reference-to-video']),
      field('ALLOW_VIDEO_TO_IMAGE_FALLBACK', 'Allow Video-To-Image Fallback', 'Set true only when provider-video failures may intentionally degrade into still images with Remotion motion. Default false keeps video reels from silently becoming image reels.', ['false', 'true']),
      field('TTS_PROVIDER', 'TTS Provider', 'Global narration/TTS provider fallback.', ['fish_audio', 'openai', 'smallest_ai']),
      field('NARRATION_PROVIDER', 'Narration Provider', 'Narration provider override.', ['fish_audio', 'openai', 'smallest_ai']),
      field('TTS_MODEL', 'TTS Model', 'Global TTS model fallback.', ['s2-pro', 'gpt-4o-mini-tts', 'lightning-v3.1']),
      field('NARRATION_MODEL', 'Narration Model', 'Narration model override.', ['s2-pro', 'gpt-4o-mini-tts', 'lightning-v3.1']),
      field('DEFAULT_REEL_TYPE', 'Default Reel Type', 'Default run type when Studio/API payloads omit reel_type.', ['video', 'image', 'avatar']),
      field('RENDER_PROVIDER', 'Render Provider', 'Renderer used by the code-first worker.', ['remotion', 'local_ffmpeg']),
    ],
  },
  {
    id: 'provider-keys',
    title: 'Provider API Keys',
    description: 'Collapsed secret inputs for the LLM, image, video, and narration providers used by the pipeline. Leave a stage key blank to use the component/global fallback.',
    studio_visible: true,
    collapsed: true,
    variant: 'secrets',
    fields: [
      field('OPENAI_API_KEY', 'OpenAI API Key', 'Global fallback for OpenAI text, image, and TTS calls.', ['']),
      field('LLL_API_KEY', 'Legacy OpenAI Key', 'Backward-compatible OpenAI key fallback used by older workflow paths.', ['']),
      field('TEXT_OPENAI_API_KEY', 'Text OpenAI API Key', 'Fallback for all OpenAI text stages before OPENAI_API_KEY.', ['']),
      field('PREMIUM_TEXT_OPENAI_API_KEY', 'Premium Text OpenAI Key', 'Fallback for premium OpenAI text stages before TEXT_OPENAI_API_KEY.', ['']),
      field('IDEA_INGEST_OPENAI_API_KEY', 'Idea Ingest OpenAI Key', 'OpenAI key used only for abstract idea ingestion.', ['']),
      field('IDEA_PROMPT_PROFILE_OPENAI_API_KEY', 'Idea Prompt Profile OpenAI Key', 'OpenAI key used only for idea prompt profile generation when that stage is enabled.', ['']),
      field('PROMPT_BUILDER_OPENAI_API_KEY', 'Prompt Builder OpenAI Key', 'OpenAI key used by runtime prompt builder text rewrites.', ['']),
      field('RESEARCH_OPENAI_API_KEY', 'Research OpenAI Key', 'OpenAI key used only for research/script generation when that stage is active.', ['']),
      field('DIRECTOR_OPENAI_API_KEY', 'Director OpenAI Key', 'OpenAI key used for director contract generation.', ['']),
      field('DIRECTOR_CONTRACT_OPENAI_API_KEY', 'Director Contract OpenAI Key', 'OpenAI key used before Director OpenAI Key for director contract generation.', ['']),
      field('STORY_PACKAGE_OPENAI_API_KEY', 'Story Package OpenAI Key', 'OpenAI key used only for story package generation.', ['']),
      field('STORY_PACKAGE_V2_OPENAI_API_KEY', 'Story Package V2 OpenAI Key', 'OpenAI key used only for story package V2 generation.', ['']),
      field('STORYBOARD_OPENAI_API_KEY', 'Storyboard OpenAI Key', 'OpenAI key used only for storyboard/prompt generation when that stage is active.', ['']),
      field('CAPTION_OPENAI_API_KEY', 'Caption OpenAI Key', 'OpenAI key used only for caption/hashtag generation when that stage is active.', ['']),
      field('VISUAL_PROMPT_OPENAI_API_KEY', 'Visual Prompt OpenAI Key', 'OpenAI key used only for visual prompt refinement.', ['']),
      field('VOICE_PERFORMANCE_OPENAI_API_KEY', 'Voice Performance OpenAI Key', 'OpenAI key used only for narration performance enrichment.', ['']),
      field('AVATAR_OPENAI_API_KEY', 'Avatar OpenAI Key', 'OpenAI key used only for avatar route selection.', ['']),
      field('FINAL_QA_OPENAI_API_KEY', 'Final QA OpenAI Key', 'OpenAI key used only for final QA.', ['']),
      field('PERFORMANCE_FEEDBACK_OPENAI_API_KEY', 'Performance Feedback OpenAI Key', 'OpenAI key used only for performance feedback analysis.', ['']),
      field('ANTHROPIC_API_KEY', 'Anthropic API Key', 'Global fallback for Claude/Anthropic text calls.', ['']),
      field('TEXT_ANTHROPIC_API_KEY', 'Text Anthropic API Key', 'Fallback for all Anthropic text stages before ANTHROPIC_API_KEY.', ['']),
      field('PREMIUM_TEXT_ANTHROPIC_API_KEY', 'Premium Text Anthropic Key', 'Fallback for premium Anthropic text stages before TEXT_ANTHROPIC_API_KEY.', ['']),
      field('IDEA_INGEST_ANTHROPIC_API_KEY', 'Idea Ingest Anthropic Key', 'Anthropic key used only for abstract idea ingestion.', ['']),
      field('IDEA_PROMPT_PROFILE_ANTHROPIC_API_KEY', 'Idea Prompt Profile Anthropic Key', 'Anthropic key used only for idea prompt profile generation.', ['']),
      field('PROMPT_BUILDER_ANTHROPIC_API_KEY', 'Prompt Builder Anthropic Key', 'Anthropic key used by runtime prompt builder text rewrites.', ['']),
      field('RESEARCH_ANTHROPIC_API_KEY', 'Research Anthropic Key', 'Anthropic key used only for research/script generation.', ['']),
      field('DIRECTOR_ANTHROPIC_API_KEY', 'Director Anthropic Key', 'Anthropic key used for director contract generation.', ['']),
      field('DIRECTOR_CONTRACT_ANTHROPIC_API_KEY', 'Director Contract Anthropic Key', 'Anthropic key used before Director Anthropic Key for director contract generation.', ['']),
      field('STORY_PACKAGE_ANTHROPIC_API_KEY', 'Story Package Anthropic Key', 'Anthropic key used only for story package generation.', ['']),
      field('STORY_PACKAGE_V2_ANTHROPIC_API_KEY', 'Story Package V2 Anthropic Key', 'Anthropic key used only for story package V2 generation.', ['']),
      field('STORYBOARD_ANTHROPIC_API_KEY', 'Storyboard Anthropic Key', 'Anthropic key used only for storyboard/prompt generation.', ['']),
      field('CAPTION_ANTHROPIC_API_KEY', 'Caption Anthropic Key', 'Anthropic key used only for caption/hashtag generation.', ['']),
      field('VISUAL_PROMPT_ANTHROPIC_API_KEY', 'Visual Prompt Anthropic Key', 'Anthropic key used only for visual prompt refinement.', ['']),
      field('VOICE_PERFORMANCE_ANTHROPIC_API_KEY', 'Voice Performance Anthropic Key', 'Anthropic key used only for narration performance enrichment.', ['']),
      field('AVATAR_ANTHROPIC_API_KEY', 'Avatar Anthropic Key', 'Anthropic key used only for avatar route selection.', ['']),
      field('FINAL_QA_ANTHROPIC_API_KEY', 'Final QA Anthropic Key', 'Anthropic key used only for final QA.', ['']),
      field('PERFORMANCE_FEEDBACK_ANTHROPIC_API_KEY', 'Performance Feedback Anthropic Key', 'Anthropic key used only for performance feedback analysis.', ['']),
      field('IMAGE_OPENAI_API_KEY', 'Image OpenAI Key', 'Fallback for OpenAI image generation before OPENAI_API_KEY.', ['']),
      field('SCENE_IMAGE_OPENAI_API_KEY', 'Scene Image OpenAI Key', 'OpenAI key used only for scene image generation.', ['']),
      field('POST_IMAGE_OPENAI_API_KEY', 'Post Image OpenAI Key', 'OpenAI key used only for post/cover image generation.', ['']),
      field('FAL_AI_API_KEY', 'Fal AI API Key', 'Global fallback for Fal image/video providers.', ['']),
      field('IMAGE_FAL_AI_API_KEY', 'Image Fal AI Key', 'Fallback for Fal image generation before FAL_AI_API_KEY.', ['']),
      field('SCENE_IMAGE_FAL_AI_API_KEY', 'Scene Image Fal AI Key', 'Fal key used only for scene image generation.', ['']),
      field('POST_IMAGE_FAL_AI_API_KEY', 'Post Image Fal AI Key', 'Fal key used only for post/cover image generation.', ['']),
      field('SCENE_VIDEO_FAL_AI_API_KEY', 'Scene Video Fal AI Key', 'Fal key used only for Wan scene-video generation.', ['']),
      field('WAN_REFERENCE_VIDEO_FAL_AI_API_KEY', 'Wan Reference Video Fal AI Key', 'Fal key used only for reference-to-video generation.', ['']),
      field('TTS_OPENAI_API_KEY', 'OpenAI TTS Key', 'OpenAI key used for narration when TTS provider is openai.', ['']),
      field('NARRATION_OPENAI_API_KEY', 'Narration OpenAI Key', 'OpenAI key used only for narration before TTS/global OpenAI fallbacks.', ['']),
      field('FISH_AUDIO_API_KEY', 'Fish Audio API Key', 'Global fallback for Fish Audio narration.', ['']),
      field('TTS_FISH_AUDIO_API_KEY', 'TTS Fish Audio Key', 'Fish Audio key used by all TTS calls before the global Fish key.', ['']),
      field('NARRATION_FISH_AUDIO_API_KEY', 'Narration Fish Audio Key', 'Fish Audio key used only for narration before the global Fish key.', ['']),
      field('SMALLEST_AI_API_KEY', 'Smallest AI API Key', 'Global fallback for Smallest AI narration.', ['']),
      field('TTS_SMALLEST_AI_API_KEY', 'TTS Smallest AI Key', 'Smallest AI key used by all TTS calls before the global Smallest key.', ['']),
      field('NARRATION_SMALLEST_AI_API_KEY', 'Narration Smallest AI Key', 'Smallest AI key used only for narration before the global Smallest key.', ['']),
      field('HEYGEN_API_KEY', 'HeyGen API Key', 'Secret API key for HeyGen Direct Video API.', ['']),
    ],
  },
  {
    id: 'hosting-publish',
    title: 'Hosting & Publish',
    description: 'These control public asset delivery and live Instagram behavior.',
    fields: [
      field('ASSET_HOST_PROVIDER', 'Asset Host Provider', 'Global asset-host provider fallback.', ['google_cloud_storage', 'object_storage']),
      field('SCENE_IMAGE_HOST_PROVIDER', 'Scene Image Host Provider', 'Scene-image host override.', ['google_cloud_storage', 'object_storage']),
      field('POST_IMAGE_HOST_PROVIDER', 'Post Image Host Provider', 'Post-image host override.', ['google_cloud_storage', 'object_storage']),
      field('NARRATION_HOST_PROVIDER', 'Narration Host Provider', 'Narration host override.', ['google_cloud_storage', 'object_storage']),
      field('RENDER_OUTPUT_HOST_PROVIDER', 'Render Output Host Provider', 'Render output host override.', ['google_cloud_storage', 'object_storage']),
      field('GOOGLE_CLOUD_STORAGE_BUCKET', 'GCS Bucket', 'Bucket name used for public object delivery.', ['my-instagram-pipeline-assets', 'project-reels-public']),
      field('GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY_PATH', 'GCS Service Account Key Path', 'Container path to the mounted Google Cloud service-account JSON key used for OAuth token exchange.', ['/secrets/google/sa-key.json', '/run/secrets/gcs-service-account.json']),
      field('GOOGLE_CLOUD_STORAGE_ENDPOINT', 'GCS Endpoint', 'Upload endpoint for the GCS JSON API.', ['https://storage.googleapis.com', 'https://storage.googleapis.com']),
      field('GOOGLE_CLOUD_STORAGE_PUBLIC_BASE_URL', 'GCS Public Base URL', 'Public base URL used to build the final object URL served to Meta.', ['https://storage.googleapis.com', 'https://storage.googleapis.com']),
      field('REELS_STORAGE_PUBLIC_BASE_URL', 'Object Storage Public Base URL', 'Public base URL used only for the generic object-storage adapter.', ['https://cdn.example.com', 'https://bucket.example.net']),
      field('INSTAGRAM_PUBLISH_ENABLED', 'Instagram Publish Enabled', 'Safety switch for live publishing.', ['true', 'false']),
      field('INSTAGRAM_IG_USER_ID', 'Instagram Account ID', 'Instagram professional account ID that approval records must match before Reel publish.', ['17841400000000000']),
      field('INSTAGRAM_USERNAME', 'Instagram Username', 'Optional display username stored with publish approvals.', ['story_account']),
      field('STUDIO_APPROVER_NAME', 'Default Approver Name', 'Default reviewer name used when approving selected renders from Studio UI.', ['reviewer@example.com', 'local reviewer']),
      field('INSTAGRAM_INSIGHTS_COLLECTION_MODE', 'Metrics Collection Mode', 'Stub or live metrics collection mode.', ['stub', 'live']),
      field('PG_CREDENTIAL_NAME', 'n8n Postgres Credential Name', 'Credential name used when activating or executing workflows from the studio UI.', ['Postgres account', 'Local Postgres']),
    ],
  },
  {
    id: 'render',
    title: 'Render Timing',
    description: 'These settings control how the render manifest aligns storyboard timing to the real narration track.',
    fields: [
      field('RENDER_OUTPUT_WIDTH', 'Render Width', 'Final render width in pixels.', ['1080', '720']),
      field('RENDER_OUTPUT_HEIGHT', 'Render Height', 'Final render height in pixels.', ['1920', '1280']),
      field('RENDER_OUTPUT_FPS', 'Render FPS', 'Frames per second for the output timeline.', ['30', '24']),
      field('RENDER_OUTPUT_FORMAT', 'Render Format', 'Container format for the final render.', ['mp4', 'mov']),
      field('RENDER_WORKER_SYNC_URL', 'Render Worker Sync URL', 'Internal sync render endpoint used by pipeline-worker.', ['http://remotion-renderer:8081/render-sync', 'http://render-worker:8080/render-sync']),
      field('REMOTION_RENDER_STUB', 'Remotion Stub Mode', 'Return a synthetic Remotion render response without invoking Chromium. Use only for offline smoke checks.', ['false', 'true']),
      field('RENDER_SUBTITLE_STYLE', 'Render Subtitle Style', 'Subtitle style preset for the manifest.', ['cinematic_center_safe', 'clean_bottom_safe']),
      field('RENDER_TIMELINE_MODE', 'Render Timeline Mode', 'How scene durations should align to narration audio.', ['fit_to_narration', 'storyboard_exact']),
      field('RENDER_SCENE_MIN_SECONDS', 'Render Scene Min Seconds', 'Minimum scene duration used when rescaling a storyboard to match narration length.', ['2.5', '3']),
      field('BACKGROUND_MUSIC_ENABLED', 'Background Music Enabled', 'Enable subtle instrumental music under the narration when a matching track exists in the local library.', ['true', 'false']),
      field('BACKGROUND_MUSIC_LIBRARY_JSON', 'Background Music Library', 'Path to the local music catalog JSON mounted inside the containers.', ['/workflows/assets/music/library.json']),
      field('BACKGROUND_MUSIC_DEFAULT_VOLUME', 'Background Music Volume', 'Default background music level under narration.', ['0.12', '0.1', '0.15']),
      field('BACKGROUND_MUSIC_FADE_IN_SECONDS', 'Background Music Fade In', 'Seconds for the music bed to ease in.', ['0.8', '1.2']),
      field('BACKGROUND_MUSIC_FADE_OUT_SECONDS', 'Background Music Fade Out', 'Seconds for the music bed to ease out.', ['2.5', '3']),
    ],
  },
  {
    id: 'avatar',
    title: 'HeyGen Avatar Video',
    description: 'HeyGen avatar settings. HEYGEN_AVATAR_ID and HEYGEN_VOICE_ID from env are the authoritative runtime IDs. Avatar runs auto-downgrade to normal video when policy, consent, disclosure, or provider config is incomplete.',
    studio_visible: true,
    fields: [
      field('HEYGEN_AVATAR_ID', 'HeyGen Avatar ID', 'Provider avatar ID used for avatar reel generation.', ['']),
      field('HEYGEN_VOICE_ID', 'HeyGen Voice ID', 'Provider voice ID used for avatar reel generation.', ['']),
      field('HEYGEN_CALLBACK_URL', 'HeyGen Callback URL', 'Optional provider callback URL. Polling is still supported without this.', ['']),
      field('HEYGEN_POLL_INTERVAL_SECONDS', 'HeyGen Poll Interval', 'Seconds between provider status polls.', ['10', '15']),
      field('HEYGEN_TIMEOUT_SECONDS', 'HeyGen Timeout Seconds', 'Maximum seconds to wait for a provider video completion.', ['900', '1200']),
      field('STUDIO_AVATAR_ALLOWED', 'Studio Avatar Allowed', 'Optional account-level default. Avatar Reel form consent can also set per-run permission.', ['false', 'true']),
      field('STUDIO_AVATAR_CONSENT_STATUS', 'Studio Avatar Consent Status', 'Optional account-level avatar consent status. Use approved/current/documented when account consent is on file.', ['approved', 'current', 'documented']),
      field('HEYGEN_AVATAR_CONSENT_RECORD_URI', 'Avatar Consent Record URI', 'Optional fallback consent record URI. Account policy must still allow avatar usage.', ['']),
      field('HEYGEN_MOCK_COMPLETED_URL', 'HeyGen Mock Completed URL', 'Offline test URL for a hosted MP4. Provider env, consent, and avatar selector approval still apply.', ['']),
      field('HEYGEN_MOCK_THUMBNAIL_URL', 'HeyGen Mock Thumbnail URL', 'Optional offline thumbnail URL paired with the mock completed video.', ['']),
      field('HEYGEN_MOCK_DURATION_SECONDS', 'HeyGen Mock Duration Seconds', 'Optional offline duration override paired with the mock completed video.', ['45', '60']),
    ],
  },
];

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function sendText(response, statusCode, payload, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function fail(statusCode, message, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  throw error;
}

async function parseJsonBody(request) {
  const rawBody = await readRequestBody(request);
  if (!rawBody) {
    return {};
  }
  try {
    return JSON.parse(rawBody);
  } catch (error) {
    fail(400, `Request body must be valid JSON: ${error.message}`);
  }
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

function extractAbstractIdeaValue(payload = {}) {
  return String(
    payload.abstract_idea
    || payload.idea
    || payload.message
    || payload.text
    || '',
  ).trim();
}

function extractReelTypeValue(payload = {}) {
  return String(
    payload.reel_type
    || payload.reelType
    || payload.source_payload_json?.reel_type
    || '',
  ).trim();
}

function normalizeReelTypeForRequest(value, { fallback = getDefaultReelType() } = {}) {
  try {
    return normalizeReelType(value, { fallback });
  } catch (error) {
    fail(400, error.message);
  }
}

function avatarRuntimeRequirements() {
  const requiredEnv = ['HEYGEN_API_KEY', 'HEYGEN_AVATAR_ID', 'HEYGEN_VOICE_ID'];
  const missing = requiredEnv.filter((key) => !String(firstEnv([key]) || '').trim());
  return {
    configured: missing.length === 0,
    required_env: requiredEnv,
    missing_env: missing,
    consent_required: true,
    fallback_behavior: 'Avatar generate runs auto-downgrade to video when HeyGen config or consent is incomplete.',
  };
}

async function parseAbstractIdeaWebhookRequest(request, url) {
  const rawBody = await readRequestBody(request);
  const queryIdea = String(
    url.searchParams.get('abstract_idea')
    || url.searchParams.get('idea')
    || url.searchParams.get('message')
    || '',
  ).trim();
  const queryWorkflowKey = String(url.searchParams.get('workflow_key') || '').trim();
  const queryReelType = String(url.searchParams.get('reel_type') || url.searchParams.get('reelType') || '').trim();
  const contentType = String(request.headers['content-type'] || '').trim().toLowerCase();

  if (!rawBody) {
    return {
      abstractIdea: queryIdea,
      workflowKey: queryWorkflowKey,
      reelType: queryReelType,
    };
  }

  if (contentType.includes('application/json') || /^[\[{]/.test(rawBody)) {
    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch (error) {
      fail(400, `Webhook body must be valid JSON when sending JSON payloads: ${error.message}`);
    }
    return {
      abstractIdea: extractAbstractIdeaValue(parsed) || queryIdea,
      workflowKey: String(parsed.workflow_key || queryWorkflowKey || '').trim(),
      reelType: extractReelTypeValue(parsed) || queryReelType,
    };
  }

  return {
    abstractIdea: rawBody,
    workflowKey: queryWorkflowKey,
    reelType: queryReelType,
  };
}

function extractPlaceholders(content) {
  return Array.from(new Set(
    String(content || '')
      .match(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)?.map((match) => match.replace(/[{}]/g, '').trim()) || [],
  )).sort();
}

function describePlaceholder(promptPath, placeholder) {
  const step = PROMPT_STEP_BY_PATH.get(promptPath);
  const stepHelp = step ? PLACEHOLDER_HELP[step.stepKey] || {} : {};
  const details = stepHelp[placeholder] || {};
  return {
    key: placeholder,
    label: details.label || placeholder,
    description: details.description || 'This placeholder is injected at runtime before the workflow sends the prompt to a model.',
    examples: Array.isArray(details.examples) ? details.examples : [],
  };
}

function serializePromptFile(relativePath, content) {
  const step = PROMPT_STEP_BY_PATH.get(relativePath) || {};
  const placeholders = extractPlaceholders(content);
  return {
    path: relativePath,
    step_key: step.stepKey || 'unknown',
    step_title: step.stepTitle || 'Unknown',
    label: step.fileLabel || path.basename(relativePath),
    placeholders,
    placeholder_details: placeholders.map((placeholder) => describePlaceholder(relativePath, placeholder)),
    hard_rules: getPromptBuilderHardRules(relativePath),
  };
}

async function walkPromptFiles(root, prefix = '') {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkPromptFiles(absolutePath, relativePath));
    } else if (/\.(md|json)$/i.test(entry.name)) {
      const content = await fs.readFile(absolutePath, 'utf8');
      files.push(serializePromptFile(relativePath, content));
    }
  }
  return files;
}

function assertActivePromptPath(relativePath) {
  const clean = String(relativePath || '').trim().replace(/^\/+/, '');
  if (!ACTIVE_PROMPT_FILE_SET.has(clean)) {
    fail(404, `Prompt '${clean || '<empty>'}' is not part of the active Studio UI prompt set.`);
  }
  return clean;
}

async function listActivePromptFiles() {
  const files = await walkPromptFiles(PROMPTS_ROOT);
  return files
    .filter((file) => ACTIVE_PROMPT_FILE_SET.has(file.path))
    .sort((left, right) => ACTIVE_PROMPT_FILES.indexOf(left.path) - ACTIVE_PROMPT_FILES.indexOf(right.path));
}

function resolvePromptPath(relativePath) {
  const clean = assertActivePromptPath(relativePath);
  if (!clean) {
    fail(400, 'prompt_path is required.');
  }
  const absolute = path.resolve(PROMPTS_ROOT, clean);
  const rootWithSep = `${PROMPTS_ROOT}${path.sep}`;
  if (absolute !== PROMPTS_ROOT && !absolute.startsWith(rootWithSep)) {
    fail(400, 'prompt_path must stay inside the prompts directory.');
  }
  return absolute;
}

function normalizeStringArray(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
}

function normalizeCreativeDefaults(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const normalized = {
    narrative_perspective: String(value.narrative_perspective || '').trim(),
    voice_role_hint: String(value.voice_role_hint || '').trim(),
    tone: String(value.tone || '').trim(),
    narrator_style: String(value.narrator_style || '').trim(),
    visual_strategy: String(value.visual_strategy || '').trim(),
    pacing_strategy: String(value.pacing_strategy || '').trim(),
    mood_curve: String(value.mood_curve || '').trim(),
    energy_curve: String(value.energy_curve || '').trim(),
    music_mood: String(value.music_mood || '').trim(),
    avoid_rules: normalizeStringArray(value.avoid_rules),
  };
  return Object.fromEntries(
    Object.entries(normalized).filter(([, entry]) => Array.isArray(entry) ? entry.length > 0 : Boolean(entry)),
  );
}

function normalizeCharacterReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const normalized = {
    role: 'primary_character',
    character_name: String(value.character_name || value.name || '').trim(),
    character_description: String(value.character_description || value.description || '').trim(),
    source_url: String(value.source_url || value.storage_url || '').trim(),
    storage_url: String(value.storage_url || value.source_url || '').trim(),
    mime_type: String(value.mime_type || '').trim().toLowerCase(),
    file_name: String(value.file_name || value.filename || '').trim(),
    file_size_bytes: Number.parseInt(String(value.file_size_bytes || value.size_bytes || '').trim(), 10) || 0,
    uploaded_at: String(value.uploaded_at || '').trim(),
    asset_host_provider: String(value.asset_host_provider || value.host_provider || '').trim().toLowerCase(),
  };

  const googleCloudStorage = parseJsonObject(value.google_cloud_storage);
  if (googleCloudStorage.bucket && googleCloudStorage.object_key) {
    normalized.google_cloud_storage = {
      bucket: String(googleCloudStorage.bucket || '').trim(),
      endpoint: String(googleCloudStorage.endpoint || '').trim(),
      public_base_url: String(googleCloudStorage.public_base_url || '').trim(),
      region: String(googleCloudStorage.region || '').trim(),
      object_key: String(googleCloudStorage.object_key || '').trim(),
      size: Number.parseInt(String(googleCloudStorage.size || '').trim(), 10) || 0,
    };
  } else if (value.storage_bucket && value.storage_object_key) {
    normalized.storage_bucket = String(value.storage_bucket || '').trim();
    normalized.storage_endpoint = String(value.storage_endpoint || '').trim();
    normalized.storage_public_base_url = String(value.storage_public_base_url || '').trim();
    normalized.storage_region = String(value.storage_region || '').trim();
    normalized.storage_object_key = String(value.storage_object_key || '').trim();
  }

  if (!normalized.storage_url || !normalized.mime_type || !normalized.file_name) {
    return null;
  }

  return normalized;
}

function parseDataUrlImage(dataUrl) {
  const value = String(dataUrl || '').trim();
  const match = value.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    fail(400, 'character reference upload must be a base64 image data URL.');
  }

  const mimeType = String(match[1] || '').trim().toLowerCase();
  if (!CHARACTER_REFERENCE_ALLOWED_MIME_TYPES.has(mimeType)) {
    fail(400, `character reference image must be one of: ${Array.from(CHARACTER_REFERENCE_ALLOWED_MIME_TYPES).join(', ')}.`);
  }

  const binary = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!binary.length) {
    fail(400, 'character reference image was empty after decoding.');
  }
  if (binary.length > CHARACTER_REFERENCE_MAX_BYTES) {
    fail(400, `character reference image must be ${Math.floor(CHARACTER_REFERENCE_MAX_BYTES / (1024 * 1024))}MB or smaller.`);
  }

  return {
    mimeType,
    binary,
  };
}

function extensionForMimeType(mimeType) {
  switch (String(mimeType || '').trim().toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

function sanitizeFileStem(value, fallback = 'character-reference') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback;
}

function buildCharacterReferenceObjectKey(filename, characterName, mimeType) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const prefix = String(process.env.REELS_STORAGE_KEY_PREFIX || 'generated/instagram-posts')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const baseName = sanitizeFileStem(characterName || filename || 'character-reference');
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const extension = extensionForMimeType(mimeType);
  return `${prefix}/character-references/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${baseName}-${randomSuffix}.${extension}`;
}

async function uploadCharacterReference(payload = {}) {
  const { mimeType, binary } = parseDataUrlImage(payload.data_url);
  const fileName = String(payload.file_name || payload.filename || '').trim() || `character-reference.${extensionForMimeType(mimeType)}`;
  const objectKey = buildCharacterReferenceObjectKey(fileName, payload.character_name, mimeType);
  const storage = await uploadBinaryAsset('scene_image', binary, {
    objectKey,
    contentType: mimeType,
    fileName,
  });

  const characterReference = normalizeCharacterReference({
    role: 'primary_character',
    character_name: String(payload.character_name || '').trim(),
    character_description: String(payload.character_description || '').trim(),
    source_url: storage.url,
    storage_url: storage.url,
    mime_type: mimeType,
    file_name: fileName,
    file_size_bytes: binary.length,
    uploaded_at: new Date().toISOString(),
    asset_host_provider: storage.mode,
    ...(storage.mode === 'google_cloud_storage' ? {
      google_cloud_storage: {
        bucket: storage.bucket,
        endpoint: storage.endpoint,
        public_base_url: storage.publicBaseUrl,
        region: storage.region,
        object_key: storage.objectKey,
        size: storage.size,
      },
    } : {
      storage_bucket: storage.bucket,
      storage_endpoint: storage.endpoint,
      storage_public_base_url: storage.publicBaseUrl,
      storage_region: storage.region,
      storage_object_key: storage.objectKey,
    }),
  });

  if (!characterReference) {
    fail(500, 'character reference upload succeeded but could not be normalized.');
  }

  return characterReference;
}

function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function runStructuredTextStage(stageKey, payload) {
  const scriptPath = path.join(REPO_ROOT, 'workflows/scripts/invoke_structured_text_adapter.mjs');
  const result = spawnSync(
    'node',
    [scriptPath, stageKey, encodeBase64Json(payload)],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
      },
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    fail(500, result.stderr.trim() || `Structured text stage '${stageKey}' failed.`);
  }

  try {
    return JSON.parse(String(result.stdout || '').trim() || '{}');
  } catch (error) {
    fail(500, `Structured text stage '${stageKey}' returned invalid JSON: ${error.message}`);
  }
}

function runtimePromptBuilderConfigPath() {
  return path.join(PROMPTS_ROOT, '.runtime-prompt-builder.json');
}

async function saveRuntimePromptBuilderConfig(payload = {}) {
  const targets = normalizeStringArray(payload.targets);
  const idea = String(payload.idea || '').trim();
  const next = {
    enabled: Boolean(payload.enabled),
    idea,
    instructions: String(payload.instructions || '').trim(),
    targets: targets.length ? targets : undefined,
    updated_at: new Date().toISOString(),
  };

  if (next.enabled && !next.idea) {
    fail(400, 'Runtime prompt builder requires an idea when enabled.');
  }

  await fs.writeFile(runtimePromptBuilderConfigPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return readRuntimePromptBuilderConfig();
}

async function disableRuntimePromptBuilderConfig() {
  await fs.rm(runtimePromptBuilderConfigPath(), { force: true });
  return readRuntimePromptBuilderConfig();
}

async function generatePromptBuilderDraft(payload) {
  const promptPath = assertActivePromptPath(payload.path);
  if (!/\.md$/i.test(promptPath)) {
    fail(400, 'Prompt builder only supports Markdown prompt files.');
  }

  const currentPrompt = String(payload.content || '').replace(/\r\n/g, '\n');
  if (!currentPrompt.trim()) {
    fail(400, 'Prompt builder requires the current prompt content.');
  }

  const idea = String(payload.idea || '').trim();
  if (!idea) {
    fail(400, 'Prompt builder requires an idea.');
  }

  const promptMeta = serializePromptFile(promptPath, currentPrompt);
  const previewConfig = {
    enabled: true,
    idea,
    instructions: String(payload.instructions || '').trim(),
    targets: normalizeStringArray(payload.targets),
  };
  const preview = await buildRuntimePromptDraft(promptPath, currentPrompt, previewConfig);

  return {
    path: promptPath,
    label: promptMeta.label,
    step_key: promptMeta.step_key,
    step_title: promptMeta.step_title,
    placeholders: promptMeta.placeholders,
    placeholder_details: promptMeta.placeholder_details,
    hard_rules: promptMeta.hard_rules,
    idea,
    instructions: String(payload.instructions || '').trim(),
    draft: preview.draft,
    summary: preview.summary,
    locked_rules_applied: promptMeta.hard_rules,
    placeholders_preserved: promptMeta.placeholders,
    generation_provider: preview.generation_provider,
    generation_model: preview.generation_model,
    generated_at: new Date().toISOString(),
  };
}

function normalizeGeneratedIdeaPayload(payload = {}) {
  return {
    title: String(payload.title || '').trim(),
    category: String(payload.category || 'general').trim() || 'general',
    confidence_label: String(payload.confidence_label || 'unverified').trim() || 'unverified',
    target_duration_seconds: Number.parseInt(String(payload.target_duration_seconds || '').trim(), 10),
    summary: String(payload.summary || '').trim(),
    notes: normalizeStringArray(payload.notes),
    source_urls: normalizeStringArray(payload.source_urls),
    context: String(payload.context || '').trim(),
    creative_defaults: normalizeCreativeDefaults(payload.creative_defaults),
  };
}

async function generateTopicPayloadFromAbstractIdea(abstractIdea) {
  const idea = String(abstractIdea || '').trim();
  if (!idea) {
    fail(400, 'abstract idea text is required.');
  }

  const envContent = await fs.readFile(ENV_FILE, 'utf8').catch(() => '');
  const parsedEnv = parseEnvFile(envContent);
  const topicDurationConfig = normalizeTopicDurationConfig(parsedEnv.values);
  const result = runStructuredTextStage('idea_ingest', {
    abstract_idea: idea,
    prompt_template_data: {
      abstract_idea: idea,
      allowed_confidence_labels_json: JSON.stringify(TOPIC_CONFIDENCE_LABELS, null, 2),
      target_duration_min_seconds: String(topicDurationConfig.min),
      target_duration_max_seconds: String(topicDurationConfig.max),
      target_duration_default_seconds: String(topicDurationConfig.defaultValue),
    },
  });
  const generatedPayload = normalizeGeneratedIdeaPayload(result.idea_ingest_response ?? {});

  if (!generatedPayload.title) {
    fail(500, 'Idea ingest returned an empty title.');
  }
  if (!Number.isFinite(generatedPayload.target_duration_seconds)) {
    fail(500, 'Idea ingest returned an invalid target_duration_seconds.');
  }

  return {
    abstract_idea: idea,
    generated_payload: generatedPayload,
    generation_provider: String(result.generation_provider || result.llm_provider || 'openai').trim() || 'openai',
    generation_model: String(result.generation_model || '').trim(),
    provider_metadata: result.provider_metadata ?? {},
  };
}

function extractCharacterReferenceFromPayload(payload = {}) {
  return normalizeCharacterReference(
    payload.character_reference
      ?? payload.source_payload_json?.character_reference
      ?? null,
  );
}

async function createTopicFromAbstractIdea(abstractIdea, options = {}) {
  const generated = await generateTopicPayloadFromAbstractIdea(abstractIdea);
  const topic = await createTopic({
    ...generated.generated_payload,
    abstract_idea: generated.abstract_idea,
    reel_type: options.reel_type ?? options.reelType,
    character_reference: extractCharacterReferenceFromPayload(options),
    client_account_context: options.client_account_context ?? options.source_payload_json?.client_account_context,
  });
  return {
    ...generated,
    prompt_profile: null,
    prompt_profile_generation_provider: '',
    prompt_profile_generation_model: '',
    prompt_profile_provider_metadata: {},
    topic,
  };
}

async function createTopicFromAbstractIdeaV2(abstractIdea, options = {}) {
  const generated = await generateTopicPayloadFromAbstractIdea(abstractIdea);
  const topic = await createTopic({
    ...generated.generated_payload,
    abstract_idea: generated.abstract_idea,
    reel_type: options.reel_type ?? options.reelType,
    character_reference: extractCharacterReferenceFromPayload(options),
    client_account_context: options.client_account_context ?? options.source_payload_json?.client_account_context,
  });
  return {
    ...generated,
    prompt_profile: null,
    prompt_profile_generation_provider: '',
    prompt_profile_generation_model: '',
    prompt_profile_provider_metadata: {},
    topic,
  };
}

async function createTopicFromAbstractIdeaAndStartWorkflow(abstractIdea, workflowKey = DEFAULT_ABSTRACT_IDEA_WORKFLOW_KEY, options = {}) {
  const created = await createTopicFromAbstractIdea(abstractIdea, options);
  const pipelineRun = await createPipelineRun(pool, {
    contentId: created.topic.content_id,
    requestedAction: 'generate_reel',
    reelType: options.reel_type ?? options.reelType ?? created.topic.reel_type,
    source: 'studio_abstract_idea_fast_path',
    reviewMode: options.review_mode === true || String(options.review_mode || '').trim().toLowerCase() === 'true',
  });

  return {
    ...created,
    automation_mode: 'code_first_generate_reel',
    legacy_workflow_key: String(workflowKey || DEFAULT_ABSTRACT_IDEA_WORKFLOW_KEY).trim() || DEFAULT_ABSTRACT_IDEA_WORKFLOW_KEY,
    pipeline_run: pipelineRun,
    pipeline_run_status_path: `/api/pipeline-runs/${encodeURIComponent(pipelineRun.pipeline_run_id)}`,
  };
}

async function createTopicFromAbstractIdeaAndStartWorkflowV2(abstractIdea, options = {}) {
  const created = await createTopicFromAbstractIdeaV2(abstractIdea, options);
  const pipelineRun = await createPipelineRun(pool, {
    contentId: created.topic.content_id,
    requestedAction: 'generate_reel',
    reelType: options.reel_type ?? options.reelType ?? created.topic.reel_type,
    source: 'studio_abstract_idea_v2_fast_path',
    reviewMode: options.review_mode === true || String(options.review_mode || '').trim().toLowerCase() === 'true',
  });

  return {
    ...created,
    automation_mode: 'code_first_generate_reel_v2',
    legacy_workflow_key: 'wf_end_to_end_reel_generate_and_publish_v2',
    pipeline_run: pipelineRun,
    pipeline_run_status_path: `/api/pipeline-runs/${encodeURIComponent(pipelineRun.pipeline_run_id)}`,
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'idea';
}

function buildIdeaSlug(title) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').toLowerCase();
  return `${slugify(title)}-${stamp}`;
}

function parseTextareaLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEnvFile(content) {
  const lines = String(content || '').split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }
    values[match[1]] = match[2];
  }
  return { lines, values };
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeTopicDurationConfig(values = {}) {
  const min = parsePositiveInteger(values.STUDIO_TOPIC_TARGET_DURATION_MIN_SECONDS)
    ?? DEFAULT_TOPIC_DURATION_CONFIG.min;
  const requestedMax = parsePositiveInteger(values.STUDIO_TOPIC_TARGET_DURATION_MAX_SECONDS)
    ?? DEFAULT_TOPIC_DURATION_CONFIG.max;
  const max = Math.max(min, requestedMax);
  const requestedDefault = parsePositiveInteger(values.STUDIO_TOPIC_TARGET_DURATION_DEFAULT_SECONDS)
    ?? DEFAULT_TOPIC_DURATION_CONFIG.defaultValue;
  const defaultValue = Math.min(max, Math.max(min, requestedDefault));
  return { min, max, defaultValue };
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseBooleanFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = normalizeHostedString(value).toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'approved', 'active', 'current'].includes(normalized);
}

function normalizeHostedString(value) {
  return String(value ?? '').trim();
}

async function ensurePublishApprovalSchema(clientOrPool = pool) {
  await clientOrPool.query(PUBLISH_APPROVAL_SCHEMA_SQL);
}

async function ensureClientAccountContextSchema(clientOrPool = pool) {
  await clientOrPool.query(CLIENT_ACCOUNT_CONTEXT_SCHEMA_SQL);
}

async function ensurePipelineSchemaForPool() {
  const client = await pool.connect();
  try {
    await ensurePipelineSchema(client);
  } finally {
    client.release();
  }
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = normalizeHostedString(value);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function normalizePolicyStringArray(value, fallback = []) {
  const entries = Array.isArray(value) ? value : parseTextareaLines(value);
  const normalized = entries.map((entry) => normalizeHostedString(entry)).filter(Boolean);
  return normalized.length ? normalized : fallback;
}

function nullableString(value) {
  const normalized = normalizeHostedString(value);
  return normalized || null;
}

function normalizeClientAccountContext(value = {}, envValues = {}) {
  const raw = parseJsonObject(value);
  const rawClient = parseJsonObject(raw.client);
  const rawPlatformAccount = parseJsonObject(raw.platform_account);
  const rawBrand = parseJsonObject(raw.brand_policy);
  const rawStyle = parseJsonObject(raw.style_policy);
  const rawVoice = parseJsonObject(raw.voice_policy);
  const rawMusic = parseJsonObject(raw.music_policy);
  const rawAvatar = parseJsonObject(raw.avatar_policy);
  const rawPublishing = parseJsonObject(raw.publishing_policy);
  const rawSafety = parseJsonObject(raw.safety_policy);

  const accountContextKey = firstNonEmptyString(
    raw.account_context_key,
    envValues.STUDIO_ACCOUNT_CONTEXT_KEY,
    envValues.CLIENT_ACCOUNT_CONTEXT_KEY,
    'default_instagram_account',
  );
  const platformAccountId = nullableString(
    rawPlatformAccount.platform_account_id
      ?? rawPublishing.platform_account_id
      ?? envValues.INSTAGRAM_IG_USER_ID
      ?? envValues.INSTAGRAM_TARGET_IG_USER_ID,
  );
  const platformAccountUsername = nullableString(
    rawPlatformAccount.platform_account_username
      ?? rawPublishing.platform_account_username
      ?? envValues.INSTAGRAM_USERNAME,
  );
  const brandProfile = firstNonEmptyString(rawBrand.brand_profile, raw.brand_profile, envValues.STUDIO_BRAND_PROFILE, 'default');
  const brandTone = firstNonEmptyString(rawBrand.brand_tone, envValues.STUDIO_BRAND_TONE, 'cinematic, concise, credible');
  const preferredStylePackId = firstNonEmptyString(rawStyle.preferred_style_pack_id, envValues.DEFAULT_STYLE_PACK_ID, 'founder_explainer');
  const allowedStylePackIds = normalizePolicyStringArray(rawStyle.allowed_style_pack_ids, [preferredStylePackId]);
  if (!allowedStylePackIds.includes(preferredStylePackId)) {
    allowedStylePackIds.unshift(preferredStylePackId);
  }
  const allowedMusicLicenseStatuses = normalizePolicyStringArray(rawMusic.allowed_music_license_statuses, ['documented', 'licensed', 'public_domain', 'cc0'])
    .filter((status) => ['documented', 'licensed', 'public_domain', 'cc0'].includes(status));
  const publishingPackageTypes = normalizePolicyStringArray(rawPublishing.package_types, ['instagram_reel'])
    .filter((packageType) => ['instagram_reel', 'instagram_image_post'].includes(packageType));

  return {
    client_account_context_version: '1.0',
    source_stage: 'client_account_context',
    account_context_key: accountContextKey,
    client: {
      client_id: firstNonEmptyString(rawClient.client_id, envValues.STUDIO_CLIENT_ID, 'default-client'),
      display_name: firstNonEmptyString(rawClient.display_name, envValues.STUDIO_CLIENT_NAME, 'Default Client'),
      industry: nullableString(rawClient.industry),
      notes: nullableString(rawClient.notes),
    },
    platform_account: {
      platform: 'instagram',
      platform_account_id: platformAccountId,
      platform_account_username: platformAccountUsername,
      region: nullableString(rawPlatformAccount.region ?? envValues.STUDIO_ACCOUNT_REGION),
    },
    brand_policy: {
      brand_profile: brandProfile,
      brand_tone: brandTone,
      audience: firstNonEmptyString(rawBrand.audience, envValues.STUDIO_BRAND_AUDIENCE, 'general Instagram audience'),
      value_props: normalizePolicyStringArray(rawBrand.value_props),
      forbidden_claims: normalizePolicyStringArray(rawBrand.forbidden_claims),
      required_disclosures: normalizePolicyStringArray(rawBrand.required_disclosures),
    },
    style_policy: {
      preferred_style_pack_id: preferredStylePackId,
      allowed_style_pack_ids: allowedStylePackIds,
      disallowed_style_pack_ids: normalizePolicyStringArray(rawStyle.disallowed_style_pack_ids),
      visual_style_notes: firstNonEmptyString(rawStyle.visual_style_notes, envValues.STORYBOARD_VISUAL_STYLE_RULES, 'documentary-realistic, cinematic, strong focal point, no visible text'),
      color_or_brand_asset_notes: nullableString(rawStyle.color_or_brand_asset_notes),
      text_policy: firstNonEmptyString(rawStyle.text_policy, 'Generated image/video assets should stay text-free; renderer-owned overlays may contain approved short titles.'),
    },
    voice_policy: {
      narrator_style: firstNonEmptyString(rawVoice.narrator_style, envValues.RESEARCH_NARRATOR_STYLE, envValues.NARRATION_STYLE, 'calm, human, emotionally grounded, clear'),
      allowed_voice_roles: normalizePolicyStringArray(rawVoice.allowed_voice_roles),
      pronunciation_notes: normalizePolicyStringArray(rawVoice.pronunciation_notes),
      language_policy: firstNonEmptyString(rawVoice.language_policy, 'Use natural spoken English.'),
    },
    music_policy: {
      music_mood: firstNonEmptyString(rawMusic.music_mood, 'subtle instrumental bed, no vocals'),
      allowed_music_license_statuses: allowedMusicLicenseStatuses.length
        ? allowedMusicLicenseStatuses
        : ['documented', 'licensed', 'public_domain', 'cc0'],
      publish_allowed_required: rawMusic.publish_allowed_required !== false,
      vocals_policy: firstNonEmptyString(rawMusic.vocals_policy, 'No vocals under narration.'),
      disallowed_music: normalizePolicyStringArray(rawMusic.disallowed_music),
    },
    avatar_policy: {
      avatar_allowed: rawAvatar.avatar_allowed === true
        || parseBooleanFlag(rawAvatar.avatar_allowed)
        || parseBooleanFlag(envValues.STUDIO_AVATAR_ALLOWED),
      requires_consent: rawAvatar.requires_consent !== false,
      default_avatar_mode: ['none', 'synthetic', 'real_person_with_consent'].includes(rawAvatar.default_avatar_mode)
        ? rawAvatar.default_avatar_mode
        : parseBooleanFlag(rawAvatar.avatar_allowed) || parseBooleanFlag(envValues.STUDIO_AVATAR_ALLOWED)
          ? 'real_person_with_consent'
          : 'none',
      consent_status: nullableString(firstNonEmptyString(rawAvatar.consent_status, envValues.STUDIO_AVATAR_CONSENT_STATUS)),
      consent_record_uri: nullableString(rawAvatar.consent_record_uri ?? envValues.HEYGEN_AVATAR_CONSENT_RECORD_URI),
      disallowed_uses: normalizePolicyStringArray(rawAvatar.disallowed_uses, ['real-person likeness without consent metadata']),
    },
    publishing_policy: {
      platform: 'instagram',
      package_types: publishingPackageTypes.length ? publishingPackageTypes : ['instagram_reel'],
      platform_account_id: platformAccountId,
      platform_account_username: platformAccountUsername,
      approval_required: rawPublishing.approval_required !== false,
      default_caption_tone: firstNonEmptyString(rawPublishing.default_caption_tone, brandTone),
      hashtag_policy: firstNonEmptyString(rawPublishing.hashtag_policy, 'Use relevant, non-spammy hashtags.'),
      restricted_topics: normalizePolicyStringArray(rawPublishing.restricted_topics),
    },
    safety_policy: {
      global_rules_override_allowed: false,
      legal_review_required_topics: normalizePolicyStringArray(rawSafety.legal_review_required_topics),
      notes: firstNonEmptyString(rawSafety.notes, 'Client preferences never override global safety, license, consent, or platform rules.'),
    },
    context_notes: nullableString(raw.context_notes),
  };
}

function buildClientAccountContextRef(context = {}) {
  return {
    account_context_key: normalizeHostedString(context.account_context_key),
    snapshot_version: normalizeHostedString(context.client_account_context_version || '1.0') || '1.0',
    platform: normalizeHostedString(context.platform_account?.platform || 'instagram') || 'instagram',
    platform_account_id: nullableString(context.platform_account?.platform_account_id ?? context.publishing_policy?.platform_account_id),
    platform_account_username: nullableString(context.platform_account?.platform_account_username ?? context.publishing_policy?.platform_account_username),
  };
}

async function upsertClientAccountContextSnapshot(client, contentId, context) {
  const normalizedContext = normalizeClientAccountContext(context);
  const contextRef = buildClientAccountContextRef(normalizedContext);
  const accountContextResult = await client.query(
    `insert into client_account_contexts (
      account_context_key,
      client_name,
      brand_profile,
      platform,
      platform_account_id,
      platform_account_username,
      context_json,
      context_status,
      updated_at
    )
    values ($1,$2,$3,$4,$5,$6,$7::jsonb,'active',now())
    on conflict (account_context_key) do update set
      client_name = excluded.client_name,
      brand_profile = excluded.brand_profile,
      platform = excluded.platform,
      platform_account_id = excluded.platform_account_id,
      platform_account_username = excluded.platform_account_username,
      context_json = excluded.context_json,
      context_status = excluded.context_status,
      updated_at = now()
    returning account_context_id`,
    [
      contextRef.account_context_key,
      normalizedContext.client.display_name,
      normalizedContext.brand_policy.brand_profile,
      contextRef.platform,
      contextRef.platform_account_id,
      contextRef.platform_account_username,
      JSON.stringify(normalizedContext),
    ],
  );
  await client.query(
    `insert into content_account_contexts (
      content_id,
      account_context_id,
      account_context_key,
      context_snapshot_json,
      snapshot_version,
      updated_at
    )
    values ($1,$2,$3,$4::jsonb,$5,now())
    on conflict (content_id) do update set
      account_context_id = excluded.account_context_id,
      account_context_key = excluded.account_context_key,
      context_snapshot_json = excluded.context_snapshot_json,
      snapshot_version = excluded.snapshot_version,
      updated_at = now()`,
    [
      contentId,
      accountContextResult.rows[0]?.account_context_id ?? null,
      contextRef.account_context_key,
      JSON.stringify(normalizedContext),
      contextRef.snapshot_version,
    ],
  );
  return { context: normalizedContext, ref: contextRef };
}

function componentForAssetRole(assetRole) {
  const normalizedRole = normalizeHostedString(assetRole);
  if (normalizedRole === 'narration_audio') {
    return 'narration_audio';
  }
  if (normalizedRole === 'post_image') {
    return 'post_image';
  }
  return 'scene_image';
}

function defaultHostedBucketForComponent(component) {
  const provider = assetHostAliases(selectAssetHostProvider(component));
  if (provider === 'google_cloud_storage') {
    return normalizeHostedString(process.env.GOOGLE_CLOUD_STORAGE_BUCKET);
  }
  if (provider === 'object_storage') {
    return normalizeHostedString(process.env.REELS_STORAGE_BUCKET);
  }
  return '';
}

function inferRenderOutputObjectKey(contentItem) {
  const outputPrefix = normalizeHostedString(process.env.RENDER_OUTPUT_PATH_PREFIX)
    .replace(/^\/+|\/+$/g, '') || 'reels';
  const renderManifest = parseJsonObject(contentItem.render_manifest_json);
  const outputConfig = parseJsonObject(renderManifest.output);
  const outputUrlExtension = path.extname(normalizeHostedString(contentItem.output_video_url)).replace(/^\./, '');
  const format = normalizeHostedString(outputConfig.format || outputUrlExtension || 'mp4') || 'mp4';
  return `${outputPrefix}/${contentItem.content_id}/final.${format}`;
}

function addHostedObjectReference(references, seenKeys, reference) {
  const component = normalizeHostedString(reference.component || 'scene_image') || 'scene_image';
  const hostProvider = reference.hostProvider ? assetHostAliases(reference.hostProvider) : '';
  const bucket = normalizeHostedString(reference.bucket);
  const objectKey = normalizeHostedString(reference.objectKey).replace(/^\/+/, '');
  if (!bucket || !objectKey) {
    return;
  }

  const dedupeKey = [component, hostProvider || 'auto', bucket, objectKey].join('::');
  if (seenKeys.has(dedupeKey)) {
    return;
  }
  seenKeys.add(dedupeKey);
  references.push({
    label: normalizeHostedString(reference.label) || component,
    component,
    hostProvider: hostProvider || undefined,
    bucket,
    objectKey,
    endpoint: normalizeHostedString(reference.endpoint) || undefined,
    publicBaseUrl: normalizeHostedString(reference.publicBaseUrl) || undefined,
    region: normalizeHostedString(reference.region) || undefined,
  });
}

function collectHostedObjectReferences(contentItem, assetRows = []) {
  const references = [];
  const seenKeys = new Set();

  for (const asset of assetRows) {
    const metadata = parseJsonObject(asset.metadata_json);
    const googleCloudStorage = parseJsonObject(metadata.google_cloud_storage);
    const component = componentForAssetRole(asset.asset_role);

    if (googleCloudStorage.bucket && googleCloudStorage.object_key) {
      addHostedObjectReference(references, seenKeys, {
        label: `${normalizeHostedString(asset.asset_role) || 'asset'}:${normalizeHostedString(asset.asset_id)}`,
        component,
        hostProvider: 'google_cloud_storage',
        bucket: googleCloudStorage.bucket,
        objectKey: googleCloudStorage.object_key,
        endpoint: googleCloudStorage.endpoint,
        publicBaseUrl: googleCloudStorage.public_base_url,
        region: googleCloudStorage.region,
      });
      continue;
    }

    if (metadata.storage_bucket && metadata.storage_object_key) {
      addHostedObjectReference(references, seenKeys, {
        label: `${normalizeHostedString(asset.asset_role) || 'asset'}:${normalizeHostedString(asset.asset_id)}`,
        component,
        hostProvider: 'object_storage',
        bucket: metadata.storage_bucket,
        objectKey: metadata.storage_object_key,
        endpoint: metadata.storage_endpoint,
        publicBaseUrl: metadata.storage_public_base_url,
        region: metadata.storage_region,
      });
    }
  }

  const sourcePayload = parseJsonObject(contentItem.source_payload_json);
  const characterReference = normalizeCharacterReference(sourcePayload.character_reference);
  if (characterReference?.google_cloud_storage?.bucket && characterReference.google_cloud_storage.object_key) {
    addHostedObjectReference(references, seenKeys, {
      label: 'character_reference',
      component: 'scene_image',
      hostProvider: 'google_cloud_storage',
      bucket: characterReference.google_cloud_storage.bucket,
      objectKey: characterReference.google_cloud_storage.object_key,
      endpoint: characterReference.google_cloud_storage.endpoint,
      publicBaseUrl: characterReference.google_cloud_storage.public_base_url,
      region: characterReference.google_cloud_storage.region,
    });
  } else if (characterReference?.storage_bucket && characterReference.storage_object_key) {
    addHostedObjectReference(references, seenKeys, {
      label: 'character_reference',
      component: 'scene_image',
      hostProvider: 'object_storage',
      bucket: characterReference.storage_bucket,
      objectKey: characterReference.storage_object_key,
      endpoint: characterReference.storage_endpoint,
      publicBaseUrl: characterReference.storage_public_base_url,
      region: characterReference.storage_region,
    });
  }

  const outputVideoUrl = normalizeHostedString(contentItem.output_video_url);
  if (outputVideoUrl) {
    const renderComponent = 'render_output';
    addHostedObjectReference(references, seenKeys, {
      label: 'render_output',
      component: renderComponent,
      hostProvider: assetHostAliases(selectAssetHostProvider(renderComponent)),
      bucket: defaultHostedBucketForComponent(renderComponent),
      objectKey: inferRenderOutputObjectKey(contentItem),
    });
  }

  return references;
}

async function cleanupHostedObjects(references = []) {
  const summary = {
    attempted_count: references.length,
    deleted_count: 0,
    missing_count: 0,
    failed_count: 0,
    deleted: [],
    missing: [],
    failures: [],
  };

  if (!references.length) {
    return summary;
  }

  const cleanupResults = await Promise.all(references.map(async (reference) => {
    try {
      const result = await deleteHostedObject(reference.component, {
        hostProvider: reference.hostProvider,
        bucket: reference.bucket,
        objectKey: reference.objectKey,
        endpoint: reference.endpoint,
        publicBaseUrl: reference.publicBaseUrl,
        region: reference.region,
      });
      return { reference, result, error: null };
    } catch (error) {
      return { reference, result: null, error };
    }
  }));

  for (const entry of cleanupResults) {
    const item = {
      label: entry.reference.label,
      component: entry.reference.component,
      bucket: entry.reference.bucket,
      object_key: entry.reference.objectKey,
    };

    if (entry.error) {
      summary.failed_count += 1;
      summary.failures.push({
        ...item,
        error: entry.error.message || 'Hosted object cleanup failed.',
      });
      continue;
    }

    if (entry.result?.missing) {
      summary.missing_count += 1;
      summary.missing.push(item);
      continue;
    }

    summary.deleted_count += 1;
    summary.deleted.push(item);
  }

  return summary;
}

function renderEnvFile(existingContent, updates) {
  const { lines } = parseEnvFile(existingContent);
  const seen = new Set();
  const rendered = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      return line;
    }
    const key = match[1];
    if (!(key in updates)) {
      return line;
    }
    seen.add(key);
    const value = String(updates[key] ?? '').replace(/\r?\n/g, '\\n');
    return `${key}=${value}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      rendered.push(`${key}=${String(value ?? '').replace(/\r?\n/g, '\\n')}`);
    }
  }

  return `${rendered.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/g, '')}\n`;
}

function allConfigFieldDefinitions() {
  return CONFIG_SECTIONS.flatMap((section) => section.fields || []);
}

function configFieldDefinition(key) {
  return allConfigFieldDefinitions().find((item) => item.key === key)
    || field(key, key.replaceAll('_', ' '), key, ['']);
}

function configFieldValue(item, values = {}) {
  const sensitive = isSensitiveConfigKey(item.key);
  const rawValue = values[item.key] ?? '';
  return sensitive && rawValue ? SECRET_VALUE_MASK : rawValue;
}

function serializeConfigField(item, values = {}, extras = {}) {
  const sensitive = isSensitiveConfigKey(item.key);
  return {
    key: item.key,
    label: item.label,
    description: item.description,
    examples: item.examples,
    width: item.width || '',
    sensitive,
    value: configFieldValue(item, values),
    ...extras,
  };
}

function hasConfiguredEnv(values = {}, keys = []) {
  return keys.some((key) => normalizeHostedString(values[key]));
}

function providerKeyCandidates(provider) {
  const normalized = normalizeHostedString(provider).toLowerCase();
  if (normalized === 'anthropic') {
    return ['ANTHROPIC_API_KEY', 'TEXT_ANTHROPIC_API_KEY', 'PREMIUM_TEXT_ANTHROPIC_API_KEY'];
  }
  if (normalized === 'openai') {
    return ['OPENAI_API_KEY', 'TEXT_OPENAI_API_KEY', 'IMAGE_OPENAI_API_KEY', 'TTS_OPENAI_API_KEY', 'LLL_API_KEY'];
  }
  if (normalized === 'fal_ai') {
    return ['FAL_AI_API_KEY', 'IMAGE_FAL_AI_API_KEY', 'SCENE_VIDEO_FAL_AI_API_KEY', 'SCENE_IMAGE_FAL_AI_API_KEY'];
  }
  if (normalized === 'fish_audio') {
    return ['FISH_AUDIO_API_KEY', 'TTS_FISH_AUDIO_API_KEY', 'NARRATION_FISH_AUDIO_API_KEY'];
  }
  if (normalized === 'smallest_ai') {
    return ['SMALLEST_AI_API_KEY', 'TTS_SMALLEST_AI_API_KEY', 'NARRATION_SMALLEST_AI_API_KEY'];
  }
  if (normalized === 'heygen') {
    return ['HEYGEN_API_KEY'];
  }
  return [];
}

function providerLabel(provider) {
  return {
    anthropic: 'Anthropic Claude',
    openai: 'OpenAI',
    fal_ai: 'Fal AI',
    fish_audio: 'Fish Audio',
    smallest_ai: 'Smallest AI',
    remotion: 'Remotion',
    local_ffmpeg: 'Local FFmpeg',
  }[provider] || provider;
}

function providerOptions(values = {}, providers = []) {
  return providers.map((provider) => {
    const keys = providerKeyCandidates(provider);
    const needsKey = keys.length > 0;
    const configured = !needsKey || hasConfiguredEnv(values, keys);
    return {
      value: provider,
      label: providerLabel(provider),
      configured,
      needs_key: needsKey,
      key_env: keys,
      status_label: configured ? (needsKey ? 'key set' : 'built in') : 'key missing',
    };
  });
}

function modelSuggestionsFor(currentValue, suggestions = []) {
  const current = normalizeHostedString(currentValue);
  const unique = [...new Set([...suggestions, current].map((value) => normalizeHostedString(value)).filter(Boolean))];
  return unique;
}

function buildTextModelRouting(values = {}) {
  return MODEL_ROUTE_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    adapter_type: 'text',
    routes: group.routes.map((route) => {
      const providerField = serializeConfigField(configFieldDefinition(route.providerKey), values, {
        input_type: 'select',
        options: [
          { value: '', label: 'Use fallback chain' },
          ...providerOptions(values, TEXT_PROVIDER_OPTIONS.map((option) => option.value)).map((option) => ({
            value: option.value,
            label: `${option.label} (${option.status_label})`,
          })),
        ],
      });
      const openaiField = serializeConfigField(configFieldDefinition(route.openaiModelKey), values, {
        provider: 'openai',
        examples: modelSuggestionsFor(values[route.openaiModelKey], MODEL_SUGGESTIONS.openai_text),
      });
      const anthropicField = serializeConfigField(configFieldDefinition(route.anthropicModelKey), values, {
        provider: 'anthropic',
        examples: modelSuggestionsFor(values[route.anthropicModelKey], MODEL_SUGGESTIONS.anthropic_text),
      });
      return {
        label: route.label,
        description: route.description,
        provider_field: providerField,
        model_fields: [anthropicField, openaiField],
        active_provider: normalizeHostedString(values[route.providerKey]),
      };
    }),
  }));
}

function buildMediaModelRouting(values = {}) {
  return NON_TEXT_MODEL_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    adapter_type: 'media',
    routes: group.routes.map((route) => {
      const activeProvider = normalizeHostedString(values[route.providerKey]) || route.providerOptions[0] || '';
      const providerField = route.providerKey
        ? serializeConfigField(configFieldDefinition(route.providerKey), values, {
          input_type: 'select',
          options: [
            { value: '', label: 'Use fallback chain' },
            ...providerOptions(values, route.providerOptions).map((option) => ({
              value: option.value,
              label: `${option.label} (${option.status_label})`,
            })),
          ],
        })
        : null;
      const suggestions = Object.values(route.modelSuggestions || {}).flat();
      const modelField = serializeConfigField(configFieldDefinition(route.modelKey), values, {
        examples: modelSuggestionsFor(values[route.modelKey], suggestions),
      });
      return {
        label: route.label,
        description: route.description,
        provider_field: providerField,
        provider_options: providerOptions(values, route.providerOptions),
        model_fields: [modelField],
        active_provider: activeProvider,
      };
    }),
  }));
}

function buildModelRouting(values = {}) {
  return {
    title: 'Task Model Routing',
    description: 'Choose provider and model suggestions by pipeline task. Blank task providers inherit from the fallback chain.',
    adapter_inventory: [
      ...providerOptions(values, ['anthropic', 'openai', 'fal_ai', 'fish_audio', 'smallest_ai', 'heygen']),
      ...providerOptions(values, ['remotion', 'local_ffmpeg']),
    ],
    groups: [
      ...buildTextModelRouting(values),
      ...buildMediaModelRouting(values),
    ],
  };
}

function buildCredentialGroups(values = {}) {
  return CREDENTIAL_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    configured: hasConfiguredEnv(values, [...group.primary, ...group.advanced]),
    primary_fields: group.primary.map((key) => serializeConfigField(configFieldDefinition(key), values)),
    advanced_fields: group.advanced.map((key) => serializeConfigField(configFieldDefinition(key), values)),
  }));
}

async function readEnvConfig() {
  const content = await fs.readFile(ENV_FILE, 'utf8').catch(() => '');
  const parsed = parseEnvFile(content);
  return {
    topic_form: normalizeTopicDurationConfig(parsed.values),
    model_routing: buildModelRouting(parsed.values),
    credential_groups: buildCredentialGroups(parsed.values),
    sections: CONFIG_SECTIONS.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      studio_visible: section.studio_visible === true,
      collapsed: section.collapsed === true,
      variant: section.variant || '',
      fields: section.fields.map((item) => serializeConfigField(item, parsed.values)),
    })),
  };
}

async function updateEnvConfig(updates) {
  const sanitized = {};
  for (const item of allConfigFieldDefinitions()) {
    if (item.key in updates) {
      if (isSensitiveConfigKey(item.key) && String(updates[item.key] ?? '') === SECRET_VALUE_MASK) {
        continue;
      }
      sanitized[item.key] = updates[item.key];
    }
  }
  const existing = await fs.readFile(ENV_FILE, 'utf8').catch(() => '');
  const next = renderEnvFile(existing, sanitized);
  await fs.writeFile(ENV_FILE, next, 'utf8');
  return readEnvConfig();
}

async function listTopics(limit = 25) {
  await ensurePublishApprovalSchema();
  await ensureClientAccountContextSchema();
  await ensurePipelineSchemaForPool();
  const result = await pool.query(
    `select
      ci.content_id,
      ci.slug,
      ci.title,
      ci.reel_type,
      coalesce(ci.category, '') as category,
      coalesce(ci.brand_profile, '') as brand_profile,
      ci.status,
      coalesce(ci.confidence_label, '') as confidence_label,
      ci.target_duration_seconds,
      ci.created_at,
      ci.updated_at,
      coalesce(cac.account_context_key, '') as account_context_key,
      coalesce(cac.context_snapshot_json->'brand_policy'->>'brand_tone', '') as account_brand_tone,
      coalesce(cac.context_snapshot_json->'style_policy'->>'preferred_style_pack_id', '') as account_style_pack_id,
      coalesce(cac.context_snapshot_json->'publishing_policy'->>'platform_account_id', '') as account_platform_account_id,
      coalesce(p.publish_status, '') as publish_status,
      coalesce(r.render_status, '') as render_status,
      r.render_id as selected_video_id,
      coalesce(r.output_video_url, '') as output_video_url,
      r.duration_seconds as render_duration_seconds,
      coalesce(r.resolution, '') as render_resolution,
      coalesce(pa.approval_status, '') as approval_status,
      coalesce(pa.qa_status, '') as approval_qa_status,
      coalesce(pa.approved_by, '') as approved_by,
      pa.approved_at,
      coalesce(pa.platform_account_id, '') as approval_platform_account_id,
      coalesce(failed_run.workflow_name, '') as latest_failed_workflow_name,
      coalesce(failed_run.error_message, '') as latest_failed_error_message,
      failed_run.ended_at as latest_failed_at,
      latest_pipeline.pipeline_run_id as latest_pipeline_run_id,
      coalesce(latest_pipeline.requested_action, '') as latest_pipeline_action,
      coalesce(latest_pipeline.reel_type, '') as latest_pipeline_reel_type,
      coalesce(latest_pipeline.status, '') as latest_pipeline_status,
      coalesce(latest_pipeline.current_stage, '') as latest_pipeline_stage,
      coalesce(latest_pipeline.stage_plan, '[]'::jsonb) as latest_pipeline_stage_plan,
      coalesce(latest_pipeline.steps, '[]'::jsonb) as latest_pipeline_steps,
      pending_review.review_id as pending_review_id,
      coalesce(pending_review.stage_key, '') as pending_review_stage,
      coalesce(pending_review.title, '') as pending_review_title,
      (
        select coalesce(sum(((wr.details_json->'cost'->>'total_usd')::float)), 0)
        from workflow_runs wr
        where wr.content_id = ci.content_id and wr.run_status = 'success'
          and wr.details_json->'cost' is not null
      ) as total_cost_usd
    from content_items ci
    left join content_account_contexts cac on cac.content_id = ci.content_id
    left join publishes p on p.content_id = ci.content_id
    left join renders r on r.content_id = ci.content_id
    left join publish_approvals pa on pa.content_id = ci.content_id
      and pa.platform = 'instagram'
      and pa.package_type = 'instagram_reel'
    left join lateral (
      select
        wr.workflow_name,
        wr.error_message,
        coalesce(wr.ended_at, wr.started_at) as ended_at
      from workflow_runs wr
      where wr.content_id = ci.content_id
        and wr.run_status = 'failed'
        and coalesce(nullif(btrim(wr.error_message), ''), '') <> ''
      order by coalesce(wr.ended_at, wr.started_at) desc
      limit 1
    ) failed_run on true
    left join lateral (
      select
        pr.pipeline_run_id,
        pr.requested_action,
        pr.reel_type,
        pr.status,
        pr.current_stage,
        pr.stage_plan,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'pipeline_step_id', ps.pipeline_step_id,
            'stage_key', ps.stage_key,
            'stage_order', ps.stage_order,
            'step_status', ps.step_status,
            'error_message', coalesce(ps.error_message, '')
          ) order by ps.stage_order asc)
          from pipeline_steps ps
          where ps.pipeline_run_id = pr.pipeline_run_id
        ), '[]'::jsonb) as steps
      from pipeline_runs pr
      where pr.content_id = ci.content_id
      order by pr.created_at desc
      limit 1
    ) latest_pipeline on true
    left join lateral (
      select
        review_id,
        stage_key,
        title
      from pipeline_reviews prv
      where prv.pipeline_run_id = latest_pipeline.pipeline_run_id
        and prv.review_status = 'pending'
      order by prv.created_at asc
      limit 1
    ) pending_review on true
    order by ci.updated_at desc
    limit $1`,
    [Math.max(1, Math.min(Number(limit) || 25, 100))],
  );
  const rows = result.rows;
  await Promise.all(rows.map(async (row) => {
    const derived = await getReelCosts(row.content_id);
    row.total_cost_usd = derived.total_usd;
  }));
  return rows;
}

async function approveTopicForPublish(contentId, body = {}) {
  const normalizedContentId = normalizeHostedString(contentId);
  if (!UUID_PATTERN.test(normalizedContentId)) {
    fail(400, 'content_id must be a valid UUID.');
  }

  const approvedBy = normalizeHostedString(body.approved_by || process.env.STUDIO_APPROVER_NAME);
  if (!approvedBy) {
    fail(400, 'approved_by is required.');
  }

  const platformAccountId = normalizeHostedString(
    body.platform_account_id
    || process.env.INSTAGRAM_IG_USER_ID
    || process.env.INSTAGRAM_TARGET_IG_USER_ID,
  );
  if (!platformAccountId) {
    fail(400, 'platform_account_id is required. Set INSTAGRAM_IG_USER_ID or pass platform_account_id when approving.');
  }

  const platformAccountUsername = normalizeHostedString(body.platform_account_username || process.env.INSTAGRAM_USERNAME);
  const approvalNote = normalizeHostedString(body.approval_note || 'Selected render approved from Studio UI.');
  const qaResult = parseJsonObject(body.qa_result);
  const qaDecision = normalizeHostedString(qaResult.publish_decision || 'approved');
  const qaBlocksPublish = qaResult.summary?.blocks_publish === true
    || qaResult.publish_requirements?.blocks_publish === true
    || qaResult.blocks_publish === true;
  if (qaDecision !== 'approved' || qaBlocksPublish) {
    fail(400, 'Final QA must be approved and non-blocking before publish approval can be recorded.');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    await ensurePublishApprovalSchema(client);
    await ensureClientAccountContextSchema(client);

    const candidateResult = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.status as content_status,
        r.render_id,
        r.render_status,
        coalesce(r.output_video_url, '') as output_video_url,
        coalesce(p.caption_final, '') as caption_final,
        coalesce(p.publish_status, '') as publish_status,
        p.published_at,
        coalesce(cac.context_snapshot_json, '{}'::jsonb) as client_account_context
      from content_items ci
      join renders r on r.content_id = ci.content_id
      join publishes p on p.content_id = ci.content_id and p.platform = 'instagram'
      left join content_account_contexts cac on cac.content_id = ci.content_id
      where ci.content_id = $1
      for update of ci`,
      [normalizedContentId],
    );
    const candidate = candidateResult.rows[0];
    if (!candidate) {
      fail(404, `No rendered Instagram Reel package was found for content_id '${normalizedContentId}'.`);
    }
    if (normalizeHostedString(candidate.content_status) !== 'render_complete') {
      fail(409, `Content status must be render_complete before approval. Current status: ${candidate.content_status || '<empty>'}.`);
    }
    if (normalizeHostedString(candidate.render_status) !== 'success') {
      fail(409, `Render status must be success before approval. Current render_status: ${candidate.render_status || '<empty>'}.`);
    }
    if (!UUID_PATTERN.test(normalizeHostedString(candidate.render_id))) {
      fail(409, 'Selected render_id is missing or invalid.');
    }
    if (!normalizeHostedString(candidate.output_video_url)) {
      fail(409, 'Rendered output_video_url is required before approval.');
    }
    if (!normalizeHostedString(candidate.caption_final)) {
      fail(409, 'caption_final is required before approval. Run caption generation first.');
    }
    if (normalizeHostedString(candidate.publish_status) === 'published' || candidate.published_at) {
      fail(409, 'This content item has already been published.');
    }
    const clientAccountContext = parseJsonObject(candidate.client_account_context);
    const expectedPlatformAccountId = normalizeHostedString(
      clientAccountContext.publishing_policy?.platform_account_id
      || clientAccountContext.platform_account?.platform_account_id,
    );
    if (expectedPlatformAccountId && expectedPlatformAccountId !== platformAccountId) {
      fail(409, `Approval platform_account_id must match the content account context (${expectedPlatformAccountId}).`);
    }

    const qaResultJson = {
      source: normalizeHostedString(qaResult.source_stage || 'manual_review') || 'manual_review',
      publish_decision: 'approved',
      blocks_publish: false,
      checked_at: normalizeHostedString(qaResult.evaluated_at || qaResult.checked_at) || new Date().toISOString(),
      summary: normalizeHostedString(qaResult.summary?.notes || body.qa_summary || 'Reviewer confirmed final QA pass.'),
    };

    const approvalResult = await client.query(
      `insert into publish_approvals (
        content_id,
        platform,
        platform_account_id,
        platform_account_username,
        package_type,
        selected_video_id,
        selected_asset_id,
        qa_status,
        qa_result_json,
        approval_status,
        approved_by,
        approved_at,
        approval_note,
        updated_at
      )
      values (
        $1,
        'instagram',
        $2,
        nullif($3, ''),
        'instagram_reel',
        $4,
        null,
        'passed',
        $5::jsonb,
        'approved',
        $6,
        now(),
        nullif($7, ''),
        now()
      )
      on conflict (content_id, platform, package_type) do update set
        platform_account_id = excluded.platform_account_id,
        platform_account_username = excluded.platform_account_username,
        selected_video_id = excluded.selected_video_id,
        selected_asset_id = excluded.selected_asset_id,
        qa_status = excluded.qa_status,
        qa_result_json = excluded.qa_result_json,
        approval_status = excluded.approval_status,
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        approval_note = excluded.approval_note,
        updated_at = now()
      returning approval_id, content_id, platform, platform_account_id, platform_account_username, package_type,
        selected_video_id, qa_status, approval_status, approved_by, approved_at, approval_note`,
      [
        normalizedContentId,
        platformAccountId,
        platformAccountUsername,
        candidate.render_id,
        JSON.stringify(qaResultJson),
        approvedBy,
        approvalNote,
      ],
    );

    await client.query(
      `insert into workflow_runs (
        content_id,
        workflow_name,
        run_status,
        ended_at,
        details_json
      )
      values (
        $1,
        'studio_publish_approval',
        'success',
        now(),
        $2::jsonb
      )`,
      [
        normalizedContentId,
        JSON.stringify({
          approval: approvalResult.rows[0],
          selected_video_id: candidate.render_id,
          account_context_key: normalizeHostedString(clientAccountContext.account_context_key),
          approval_note: approvalNote,
        }),
      ],
    );

    await client.query('commit');
    return {
      approval: approvalResult.rows[0],
      selected_video: {
        render_id: candidate.render_id,
        output_video_url: candidate.output_video_url,
        render_status: candidate.render_status,
      },
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function getStoredWorkflowRunCosts(contentId) {
  const result = await pool.query(
    `select
      workflow_name,
      run_status,
      ended_at,
      details_json->'cost' as cost
    from workflow_runs
    where content_id = $1
      and run_status = 'success'
      and details_json->'cost' is not null
    order by ended_at asc`,
    [contentId],
  );
  return result.rows.map((r) => ({
    workflow: r.workflow_name,
    ended_at: r.ended_at,
    cost: r.cost,
  }));
}

async function getFallbackCostBreakdown(contentId, existingWorkflows = new Set()) {
  const breakdown = [];

  if (!existingWorkflows.has('wf_research_and_script') && !existingWorkflows.has('wf_story_package_generation')) {
    const scriptResult = await pool.query(
      `select generation_model, raw_response_json
       from scripts
       where content_id = $1`,
      [contentId],
    );
    if (scriptResult.rowCount > 0) {
      const row = scriptResult.rows[0];
      const raw = row.raw_response_json && typeof row.raw_response_json === 'object' ? row.raw_response_json : {};
      const usage = raw.provider_metadata?.usage ?? {};
      const scriptCost = computeLlmCost(
        String(row.generation_model || raw.generation_model || ''),
        usage,
        undefined,
        String(raw.provider || 'openai'),
      );
      if (scriptCost.priced && scriptCost.total_usd > 0) {
        breakdown.push({
          workflow: raw.v2_story_package ? 'wf_story_package_generation' : 'wf_research_and_script',
          ended_at: null,
          cost: scriptCost,
        });
      }
    }
  }

  const hasAssetWorkflowCost = existingWorkflows.has('wf_asset_generation') || existingWorkflows.has('wf_asset_generation_v3');
  const hasNarrationWorkflowCost = existingWorkflows.has('wf_narration_generation');

  if (!hasAssetWorkflowCost || !hasNarrationWorkflowCost) {
    const assetResult = await pool.query(
      `select
         asset_role,
         count(*)::int as asset_count,
         coalesce(metadata_json->>'generation_provider', metadata_json->>'provider', provider) as generation_provider,
         coalesce(metadata_json->>'generation_model', '') as generation_model,
         sum(coalesce(duration_seconds, 0))::float as total_duration_seconds,
         sum(length(coalesce(metadata_json->>'narration_script', '')))::int as total_chars,
         sum(octet_length(coalesce(metadata_json->>'narration_script', '')))::int as total_utf8_bytes
       from assets
       where content_id = $1
         and asset_role in ('scene_image', 'scene_video', 'scene_narration')
       group by asset_role, generation_provider, generation_model`,
      [contentId],
    );
    const assetCostComponents = [];
    let sawSceneVideo = false;
    for (const row of assetResult.rows) {
      if (row.asset_role === 'scene_image' && !hasAssetWorkflowCost) {
        const assetCost = computeImageCost(row.generation_provider || '', row.generation_model || '', Number(row.asset_count || 0));
        if (assetCost.priced && assetCost.total_usd > 0) {
          assetCostComponents.push(assetCost);
        }
      }
      if (row.asset_role === 'scene_video' && !hasAssetWorkflowCost) {
        const videoCost = computeVideoCost(
          row.generation_provider || '',
          row.generation_model || '',
          {
            video_count: Number(row.asset_count || 0),
            total_duration_seconds: Number(row.total_duration_seconds || 0),
          },
        );
        if (videoCost.priced && videoCost.total_usd > 0) {
          sawSceneVideo = true;
          assetCostComponents.push(videoCost);
        }
      }
      if (row.asset_role === 'scene_narration' && !hasNarrationWorkflowCost) {
        const narrationCost = computeTtsCost(
          row.generation_provider || '',
          {
            char_count: Number(row.total_chars || 0),
            utf8_bytes: Number(row.total_utf8_bytes || 0),
          },
          row.generation_model || '',
        );
        if (narrationCost.priced && narrationCost.total_usd > 0) {
          breakdown.push({
            workflow: 'wf_narration_generation',
            ended_at: null,
            cost: narrationCost,
          });
        }
      }
    }

    if (!hasAssetWorkflowCost && assetCostComponents.length > 0) {
      const assetTotalUsd = assetCostComponents.reduce((sum, component) => sum + Number(component.total_usd || 0), 0);
      const imageTotalUsd = assetCostComponents
        .filter((component) => component.type === 'image')
        .reduce((sum, component) => sum + Number(component.total_usd || 0), 0);
      const videoTotalUsd = assetCostComponents
        .filter((component) => component.type === 'video')
        .reduce((sum, component) => sum + Number(component.total_usd || 0), 0);
      breakdown.push({
        workflow: sawSceneVideo ? 'wf_asset_generation_v3' : 'wf_asset_generation',
        ended_at: null,
        cost: {
          type: 'asset_generation',
          provider: assetCostComponents.length === 1 ? String(assetCostComponents[0].provider || '') : 'mixed',
          model: assetCostComponents.length === 1 ? String(assetCostComponents[0].model || '') : 'mixed',
          image_total_usd: Number(imageTotalUsd.toFixed(6)),
          video_total_usd: Number(videoTotalUsd.toFixed(6)),
          total_usd: Number(assetTotalUsd.toFixed(6)),
          estimated_from_usage: true,
          priced: assetCostComponents.every((component) => component.priced === true),
          components: assetCostComponents,
        },
      });
    }
  }

  if (!existingWorkflows.has('wf_caption_and_hashtags')) {
    const captionResult = await pool.query(
      `select ended_at, details_json
       from workflow_runs
       where content_id = $1
         and workflow_name = 'wf_caption_and_hashtags'
         and run_status = 'success'
       order by ended_at desc
       limit 1`,
      [contentId],
    );
    if (captionResult.rowCount > 0) {
      const row = captionResult.rows[0];
      const details = row.details_json && typeof row.details_json === 'object' ? row.details_json : {};
      const singlePass = details.caption_iteration?.single_pass ?? {};
      const usage = singlePass.provider_metadata?.usage ?? {};
      const captionCost = computeLlmCost(
        String(details.generation_model || singlePass.model || ''),
        usage,
        undefined,
        String(singlePass.provider || details.provider || 'openai'),
      );
      if (captionCost.priced && captionCost.total_usd > 0) {
        breakdown.push({
          workflow: 'wf_caption_and_hashtags',
          ended_at: row.ended_at,
          cost: captionCost,
        });
      }
    }
  }

  return breakdown;
}

async function getReelCosts(contentId) {
  const normalizedId = String(contentId || '').trim();
  if (!UUID_PATTERN.test(normalizedId)) {
    fail(400, 'Invalid content_id.');
  }
  const storedBreakdown = await getStoredWorkflowRunCosts(normalizedId);
  const existingWorkflows = new Set(storedBreakdown.map((row) => row.workflow));
  const fallbackBreakdown = await getFallbackCostBreakdown(normalizedId, existingWorkflows);
  const breakdown = [...storedBreakdown, ...fallbackBreakdown];
  const total_usd = breakdown.reduce((sum, r) => sum + Number(r.cost?.total_usd ?? 0), 0);
  return {
    content_id: normalizedId,
    total_usd: Number(total_usd.toFixed(6)),
    breakdown,
  };
}

async function createTopic(payload) {
  const envContent = await fs.readFile(ENV_FILE, 'utf8').catch(() => '');
  const parsedEnv = parseEnvFile(envContent);
  const topicDurationConfig = normalizeTopicDurationConfig(parsedEnv.values);
  const title = String(payload.title || '').trim();
  if (!title) {
    fail(400, 'title is required.');
  }
  const category = String(payload.category || 'general').trim() || 'general';
  const confidenceLabel = String(payload.confidence_label || 'unverified').trim() || 'unverified';
  const reelType = normalizeReelTypeForRequest(
    payload.reel_type ?? payload.reelType ?? payload.source_payload_json?.reel_type,
    { fallback: getDefaultReelType() },
  );
  const rawTargetDuration = String(payload.target_duration_seconds || topicDurationConfig.defaultValue).trim();
  const targetDurationSeconds = Number.parseInt(rawTargetDuration, 10);
  if (!Number.isFinite(targetDurationSeconds)) {
    fail(400, 'target_duration_seconds must be a positive integer.');
  }
  if (
    targetDurationSeconds < topicDurationConfig.min
    || targetDurationSeconds > topicDurationConfig.max
  ) {
    fail(
      400,
      `target_duration_seconds must be between ${topicDurationConfig.min} and ${topicDurationConfig.max} seconds.`,
    );
  }
  const rawClientAccountContext = parseJsonObject(
    payload.client_account_context
      ?? payload.source_payload_json?.client_account_context
      ?? {},
  );
  const avatarConsentConfirmed = parseBooleanFlag(
    payload.avatar_consent_confirmed
      ?? payload.avatarConsentConfirmed
      ?? payload.source_payload_json?.avatar_consent_confirmed,
  );
  if (reelType === 'avatar' && avatarConsentConfirmed) {
    const rawAvatarPolicy = parseJsonObject(rawClientAccountContext.avatar_policy);
    rawClientAccountContext.avatar_policy = {
      ...rawAvatarPolicy,
      avatar_allowed: true,
      requires_consent: true,
      default_avatar_mode: 'real_person_with_consent',
      consent_status: firstNonEmptyString(rawAvatarPolicy.consent_status, 'approved'),
      consent_record_uri: firstNonEmptyString(
        rawAvatarPolicy.consent_record_uri,
        parsedEnv.values.HEYGEN_AVATAR_CONSENT_RECORD_URI,
        `studio://avatar-consent/${new Date().toISOString()}`,
      ),
    };
  }
  const clientAccountContext = normalizeClientAccountContext(rawClientAccountContext, parsedEnv.values);
  const clientAccountContextRef = buildClientAccountContextRef(clientAccountContext);

  const sourcePayloadJson = {
    reel_type: reelType,
    source_urls: Array.isArray(payload.source_urls) ? payload.source_urls.filter(Boolean) : parseTextareaLines(payload.source_urls),
    summary: String(payload.summary || '').trim(),
    notes: Array.isArray(payload.notes) ? payload.notes.filter(Boolean) : parseTextareaLines(payload.notes),
    context: String(payload.context || '').trim(),
    client_account_context: clientAccountContext,
    client_account_context_ref: clientAccountContextRef,
  };
  if (avatarConsentConfirmed) {
    sourcePayloadJson.avatar_consent_confirmed = true;
  }
  const creativeDefaults = normalizeCreativeDefaults(payload.creative_defaults ?? payload.source_payload_json?.creative_defaults);
  if (Object.keys(creativeDefaults).length > 0) {
    sourcePayloadJson.creative_defaults = creativeDefaults;
  }
  const characterReference = normalizeCharacterReference(
    payload.character_reference
      ?? payload.source_payload_json?.character_reference
      ?? null,
  );
  if (characterReference) {
    sourcePayloadJson.character_reference = characterReference;
  }
  const abstractIdea = String(payload.abstract_idea || '').trim();
  if (abstractIdea) {
    sourcePayloadJson.abstract_idea = abstractIdea;
  }
  const promptProfile = normalizePromptProfile(
    payload.prompt_profile
      ?? payload.source_payload_json?.prompt_profile
      ?? {},
  );
  if (promptProfile.profile_summary) {
    sourcePayloadJson.prompt_profile_summary = promptProfile.profile_summary;
  }
  if (hasPromptProfileOverrides(promptProfile)) {
    sourcePayloadJson.prompt_profile = Object.fromEntries(
      PROMPT_PROFILE_STAGE_KEYS.map((stageKey) => [stageKey, promptProfile[stageKey] ?? {}]),
    );
  }

  const slug = buildIdeaSlug(title);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await ensureClientAccountContextSchema(client);
    await ensurePipelineSchema(client);
    const result = await client.query(
      `insert into content_items (
        title,
        slug,
        category,
        reel_type,
        confidence_label,
        target_duration_seconds,
        brand_profile,
        source_payload_json,
        status,
        updated_at
      ) values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        'idea_approved',
        now()
      )
      returning content_id, title, slug, category, reel_type, confidence_label, target_duration_seconds, brand_profile, status, created_at, updated_at`,
      [
        title,
        slug,
        category,
        reelType,
        confidenceLabel,
        targetDurationSeconds,
        clientAccountContext.brand_policy.brand_profile,
        JSON.stringify(sourcePayloadJson),
      ],
    );
    await upsertClientAccountContextSnapshot(client, result.rows[0].content_id, clientAccountContext);
    await client.query('commit');
    return {
      ...result.rows[0],
      account_context_key: clientAccountContextRef.account_context_key,
      client_account_context: clientAccountContext,
      client_account_context_ref: clientAccountContextRef,
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function deleteTopic(contentId) {
  const normalizedContentId = normalizeHostedString(contentId);
  if (!UUID_PATTERN.test(normalizedContentId)) {
    fail(400, 'content_id must be a valid UUID.');
  }

  const client = await pool.connect();
  let contentRow;
  let assetRows = [];
  let relatedCounts = {};
  let deletedTopic = null;
  let deletedWorkflowRuns = 0;
  let deletedPipelineRuns = 0;

  try {
    await client.query('begin');
    await ensurePipelineSchema(client);

    const contentResult = await client.query(
      `select
        ci.content_id,
        ci.title,
        ci.slug,
        ci.status,
        coalesce(ci.source_payload_json, '{}'::jsonb) as source_payload_json,
        coalesce(p.publish_status, '') as publish_status,
        coalesce(p.instagram_media_id, '') as instagram_media_id,
        coalesce(r.output_video_url, '') as output_video_url,
        coalesce(r.cover_image_url, '') as cover_image_url,
        coalesce(r.render_manifest_json, '{}'::jsonb) as render_manifest_json
      from content_items ci
      left join publishes p on p.content_id = ci.content_id
      left join renders r on r.content_id = ci.content_id
      where ci.content_id = $1
      for update of ci`,
      [normalizedContentId],
    );
    contentRow = contentResult.rows[0];
    if (!contentRow) {
      fail(404, `Pipeline item '${normalizedContentId}' was not found.`);
    }

    const assetResult = await client.query(
      `select asset_id, asset_role, metadata_json
      from assets
      where content_id = $1
      order by created_at asc`,
      [normalizedContentId],
    );
    assetRows = assetResult.rows;

    const countsResult = await client.query(
      `select
        (select count(*)::int from content_sources where content_id = $1) as content_sources,
        (select count(*)::int from scripts where content_id = $1) as scripts,
        (select count(*)::int from storyboards where content_id = $1) as storyboards,
        (select count(*)::int from assets where content_id = $1) as assets,
        (select count(*)::int from renders where content_id = $1) as renders,
        (select count(*)::int from publishes where content_id = $1) as publishes,
        (select count(*)::int from insight_snapshots where content_id = $1) as insight_snapshots,
        (select count(*)::int from performance_reviews where content_id = $1) as performance_reviews,
        (select count(*)::int from pipeline_reviews where content_id = $1) as pipeline_reviews,
        (select count(*)::int from pipeline_runs where content_id = $1) as pipeline_runs,
        (select count(*)::int from workflow_runs where content_id = $1) as workflow_runs`,
      [normalizedContentId],
    );
    relatedCounts = countsResult.rows[0] || {};

    const workflowRunDeleteResult = await client.query(
      'delete from workflow_runs where content_id = $1',
      [normalizedContentId],
    );
    deletedWorkflowRuns = Number(workflowRunDeleteResult.rowCount || 0);

    const pipelineRunDeleteResult = await client.query(
      'delete from pipeline_runs where content_id = $1',
      [normalizedContentId],
    );
    deletedPipelineRuns = Number(pipelineRunDeleteResult.rowCount || 0);

    const deleteResult = await client.query(
      `delete from content_items
      where content_id = $1
      returning content_id, title, slug, status`,
      [normalizedContentId],
    );
    deletedTopic = deleteResult.rows[0] || null;
    if (!deletedTopic) {
      fail(404, `Pipeline item '${normalizedContentId}' was not found.`);
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const storageCleanup = await cleanupHostedObjects(
    collectHostedObjectReferences(contentRow, assetRows),
  );
  const notes = [];
  if (
    normalizeHostedString(contentRow.publish_status).toLowerCase() === 'published'
    || normalizeHostedString(contentRow.instagram_media_id)
  ) {
    notes.push('This removed local pipeline data only. It did not delete any already-published Instagram post.');
  }
  if (storageCleanup.failed_count > 0) {
    notes.push('Some hosted objects could not be deleted automatically. Review storage_cleanup.failures for the exact object keys.');
  }

  return {
    deleted: deletedTopic,
    deleted_records: {
      content_items: 1,
      content_sources: Number(relatedCounts.content_sources || 0),
      scripts: Number(relatedCounts.scripts || 0),
      storyboards: Number(relatedCounts.storyboards || 0),
      assets: Number(relatedCounts.assets || 0),
      renders: Number(relatedCounts.renders || 0),
      publishes: Number(relatedCounts.publishes || 0),
      insight_snapshots: Number(relatedCounts.insight_snapshots || 0),
      performance_reviews: Number(relatedCounts.performance_reviews || 0),
      pipeline_reviews: Number(relatedCounts.pipeline_reviews || 0),
      pipeline_runs: deletedPipelineRuns,
      workflow_runs: deletedWorkflowRuns,
    },
    storage_cleanup: storageCleanup,
    notes,
  };
}

function getWorkflowDefinition(key) {
  const workflow = WORKFLOWS.find((entry) => entry.key === key);
  if (!workflow) {
    fail(404, `Unknown workflow '${key}'.`);
  }
  return workflow;
}

function executeWorkflow(key) {
  const workflow = getWorkflowDefinition(key);
  const scriptPath = path.join(REPO_ROOT, 'workflows/scripts/execute_workflow_by_name.mjs');
  const result = spawnSync(
    'node',
    [scriptPath, workflow.key, workflow.file],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
      },
      timeout: 60 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  return {
    workflow_key: workflow.key,
    workflow_name: workflow.name,
    status: result.status ?? 1,
    success: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function trimJobOutput(value, maxChars = 20000) {
  const text = String(value || '');
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(text.length - maxChars);
}

function startWorkflowJob(key) {
  const workflow = getWorkflowDefinition(key);
  const jobId = crypto.randomUUID();
  const scriptPath = path.join(REPO_ROOT, 'workflows/scripts/execute_workflow_by_name.mjs');
  const child = spawn(
    'node',
    [scriptPath, workflow.key, workflow.file],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const job = {
    job_id: jobId,
    workflow_key: workflow.key,
    workflow_name: workflow.name,
    status: 'running',
    success: null,
    exit_code: null,
    started_at: new Date().toISOString(),
    ended_at: null,
    stdout: '',
    stderr: '',
  };
  workflowJobs.set(jobId, job);

  child.stdout.on('data', (chunk) => {
    job.stdout = trimJobOutput(job.stdout + String(chunk));
  });
  child.stderr.on('data', (chunk) => {
    job.stderr = trimJobOutput(job.stderr + String(chunk));
  });
  child.on('error', (error) => {
    job.status = 'failed';
    job.success = false;
    job.exit_code = -1;
    job.ended_at = new Date().toISOString();
    job.stderr = trimJobOutput(`${job.stderr}\n${error.message}`.trim());
  });
  child.on('close', (code) => {
    job.status = code === 0 ? 'completed' : 'failed';
    job.success = code === 0;
    job.exit_code = Number.isInteger(code) ? code : -1;
    job.ended_at = new Date().toISOString();
  });

  return job;
}

function getWorkflowJob(jobId) {
  const job = workflowJobs.get(jobId);
  if (!job) {
    fail(404, `Unknown workflow job '${jobId}'.`);
  }
  return job;
}

function contentTypeForFile(filePath) {
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (filePath.endsWith('.js')) {
    return 'application/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  return 'text/plain; charset=utf-8';
}

async function serveStatic(requestPath, response) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.resolve(STATIC_ROOT, `.${normalizedPath}`);
  const rootWithSep = `${STATIC_ROOT}${path.sep}`;
  if (filePath !== STATIC_ROOT && !filePath.startsWith(rootWithSep)) {
    sendText(response, 404, 'Not found');
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypeForFile(filePath),
      'Cache-Control': 'no-store',
      'Content-Length': body.length,
    });
    response.end(body);
  } catch {
    sendText(response, 404, 'Not found');
  }
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    const envContent = await fs.readFile(ENV_FILE, 'utf8').catch(() => '');
    const parsedEnv = parseEnvFile(envContent);
    sendJson(response, 200, {
      ok: true,
      service: 'studio-ui',
      timestamp: new Date().toISOString(),
      topic_form: normalizeTopicDurationConfig(parsedEnv.values),
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/workflows') {
    sendJson(response, 200, {
      workflows: WORKFLOWS,
      pipeline_actions: Object.entries(PIPELINE_ACTION_LABELS).map(([key, label]) => ({ key, label })),
      reel_types: REEL_TYPES.map((key) => ({
        key,
        label: REEL_TYPE_LABELS[key] || key,
        default: key === getDefaultReelType(),
        ...(key === 'avatar' ? { setup: avatarRuntimeRequirements() } : {}),
      })),
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/pipeline-reviews') {
    sendJson(response, 200, {
      reviews: await listPipelineReviews(pool, {
        status: url.searchParams.get('status') || '',
        limit: url.searchParams.get('limit') || 20,
      }),
    });
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/pipeline-reviews/')) {
    const reviewId = decodeURIComponent(url.pathname.slice('/api/pipeline-reviews/'.length).trim());
    sendJson(response, 200, { review: await getPipelineReviewById(pool, reviewId) });
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/pipeline-reviews/') && url.pathname.endsWith('/approve')) {
    const reviewId = decodeURIComponent(url.pathname.slice('/api/pipeline-reviews/'.length).replace(/\/approve$/, '').trim());
    const body = await parseJsonBody(request);
    const review = await approvePipelineReview(pool, reviewId, {
      editedJson: body.edited_json ?? body.editable_json,
      reviewer: body.reviewer || body.approved_by || process.env.STUDIO_APPROVER_NAME || '',
      reviewNote: body.review_note || body.approval_note || '',
    });
    sendJson(response, 200, {
      review: {
        review_id: review.review_id,
        pipeline_run_id: review.pipeline_run_id,
        content_id: review.content_id,
        stage_key: review.stage_key,
        review_status: review.review_status,
        approved_at: review.approved_at,
      },
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/pipeline-runs') {
    sendJson(response, 200, { pipeline_runs: await listPipelineRuns(pool, { limit: url.searchParams.get('limit') }) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/pipeline-runs') {
    const body = await parseJsonBody(request);
    const pipelineRun = await createPipelineRun(pool, {
      contentId: body.content_id,
      requestedAction: body.requested_action || 'generate_reel',
      reelType: body.requested_action === 'publish_approved_reel'
        ? null
        : normalizeReelTypeForRequest(body.reel_type ?? body.reelType, { fallback: getDefaultReelType() }),
      source: 'studio_api',
      requestedBy: body.requested_by || '',
      reviewMode: body.review_mode === true || String(body.review_mode || '').trim().toLowerCase() === 'true',
    });
    sendJson(response, pipelineRun.existing ? 200 : 202, { pipeline_run: pipelineRun });
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/pipeline-runs/')) {
    const pipelineRunId = decodeURIComponent(url.pathname.slice('/api/pipeline-runs/'.length).trim());
    sendJson(response, 200, { pipeline_run: await getPipelineRunById(pool, pipelineRunId, { includeEvents: true }) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/workflows/run') {
    const body = await parseJsonBody(request);
    const workflowKey = String(body.workflow_key || '').trim();
    const mode = String(body.mode || 'async').trim().toLowerCase();
    if (mode === 'sync') {
      const result = executeWorkflow(workflowKey);
      sendJson(response, result.success ? 200 : 500, result);
      return;
    }
    const job = startWorkflowJob(workflowKey);
    sendJson(response, 202, job);
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/workflows/run/')) {
    const jobId = url.pathname.slice('/api/workflows/run/'.length).trim();
    sendJson(response, 200, getWorkflowJob(jobId));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/topics') {
    sendJson(response, 200, { topics: await listTopics(url.searchParams.get('limit')) });
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/topics/') && url.pathname.endsWith('/approval')) {
    const contentId = decodeURIComponent(url.pathname.slice('/api/topics/'.length).replace(/\/approval$/, '').trim());
    const body = await parseJsonBody(request);
    sendJson(response, 200, await approveTopicForPublish(contentId, body));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/topics') {
    const body = await parseJsonBody(request);
    sendJson(response, 201, { topic: await createTopic(body) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/uploads/character-reference') {
    const body = await parseJsonBody(request);
    sendJson(response, 201, { character_reference: await uploadCharacterReference(body) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/topics/from-idea') {
    const body = await parseJsonBody(request);
    sendJson(response, 201, await createTopicFromAbstractIdea(body.abstract_idea || body.idea || '', body));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/ideas/auto-publish') {
    const body = await parseJsonBody(request);
    sendJson(
      response,
      202,
      await createTopicFromAbstractIdeaAndStartWorkflow(
        extractAbstractIdeaValue(body),
        body.workflow_key || DEFAULT_ABSTRACT_IDEA_WORKFLOW_KEY,
        body,
      ),
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/ideas/auto-publish-v2') {
    const body = await parseJsonBody(request);
    sendJson(
      response,
      202,
      await createTopicFromAbstractIdeaAndStartWorkflowV2(extractAbstractIdeaValue(body), body),
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/webhooks/abstract-idea') {
    const payload = await parseAbstractIdeaWebhookRequest(request, url);
    sendJson(
      response,
      202,
      await createTopicFromAbstractIdeaAndStartWorkflow(
        payload.abstractIdea,
        payload.workflowKey || DEFAULT_ABSTRACT_IDEA_WORKFLOW_KEY,
        { reel_type: payload.reelType },
      ),
    );
    return;
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/topics/')) {
    const contentId = decodeURIComponent(url.pathname.slice('/api/topics/'.length).trim());
    sendJson(response, 200, await deleteTopic(contentId));
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/topics/') && url.pathname.endsWith('/costs')) {
    const contentId = decodeURIComponent(url.pathname.slice('/api/topics/'.length).replace(/\/costs$/, '').trim());
    sendJson(response, 200, await getReelCosts(contentId));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/prompts') {
    sendJson(response, 200, { files: await listActivePromptFiles() });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/prompt') {
    const promptPath = String(url.searchParams.get('path') || '').trim();
    const absolutePath = resolvePromptPath(promptPath);
    const content = await fs.readFile(absolutePath, 'utf8');
    sendJson(response, 200, {
      ...serializePromptFile(promptPath, content),
      content,
    });
    return;
  }

  if (request.method === 'PUT' && url.pathname === '/api/prompt') {
    const body = await parseJsonBody(request);
    const promptPath = String(body.path || '').trim();
    const absolutePath = resolvePromptPath(promptPath);
    await fs.writeFile(absolutePath, String(body.content || ''), 'utf8');
    const content = await fs.readFile(absolutePath, 'utf8');
    sendJson(response, 200, {
      ...serializePromptFile(promptPath, content),
      content,
      saved_at: new Date().toISOString(),
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/runtime-prompt-builder') {
    sendJson(response, 200, await readRuntimePromptBuilderConfig());
    return;
  }

  if (request.method === 'PUT' && url.pathname === '/api/runtime-prompt-builder') {
    const body = await parseJsonBody(request);
    sendJson(response, 200, await saveRuntimePromptBuilderConfig(body));
    return;
  }

  if (request.method === 'DELETE' && url.pathname === '/api/runtime-prompt-builder') {
    sendJson(response, 200, await disableRuntimePromptBuilderConfig());
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/prompt-builder') {
    const body = await parseJsonBody(request);
    sendJson(response, 200, await generatePromptBuilderDraft(body));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/config') {
    sendJson(response, 200, await readEnvConfig());
    return;
  }

  if (request.method === 'PUT' && url.pathname === '/api/config') {
    const body = await parseJsonBody(request);
    sendJson(response, 200, await updateEnvConfig(body.values || {}));
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/') || url.pathname === '/webhooks/abstract-idea') {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    sendJson(response, statusCode, {
      error: error.message || 'Unexpected error',
      details: error.details || {},
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`studio-ui listening on 0.0.0.0:${PORT}\n`);
});

async function shutdown(signal) {
  process.stdout.write(`\nReceived ${signal}. Shutting down studio-ui.\n`);
  await pool.end().catch(() => {});
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
