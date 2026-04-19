create extension if not exists "pgcrypto";

create table if not exists content_items (
  content_id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  category text,
  status text not null default 'idea_discovered',
  priority_score numeric(5,2),
  hook_score numeric(5,2),
  visual_score numeric(5,2),
  credibility_score numeric(5,2),
  confidence_label text,
  target_duration_seconds integer not null default 45,
  brand_profile text not null default 'default',
  source_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  published_at timestamptz
);

create index if not exists idx_content_items_status on content_items (status);
create index if not exists idx_content_items_created_at on content_items (created_at desc);

create table if not exists content_sources (
  source_id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items(content_id) on delete cascade,
  source_title text,
  source_url text,
  source_type text,
  source_notes text,
  retrieved_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists scripts (
  script_id uuid primary key default gen_random_uuid(),
  content_id uuid not null unique references content_items(content_id) on delete cascade,
  hook_option_1 text,
  hook_option_2 text,
  hook_option_3 text,
  selected_hook text,
  narration_script text,
  short_script text,
  caption_draft text,
  cta_line text,
  onscreen_text_json jsonb not null default '[]'::jsonb,
  generation_model text,
  raw_response_json jsonb not null default '{}'::jsonb,
  approved_by_human boolean not null default false,
  generated_at timestamptz not null default now()
);

create table if not exists storyboards (
  storyboard_id uuid primary key default gen_random_uuid(),
  content_id uuid not null unique references content_items(content_id) on delete cascade,
  storyboard_json jsonb not null default '[]'::jsonb,
  cover_prompt text,
  subtitle_lines_json jsonb not null default '[]'::jsonb,
  style_notes text,
  render_manifest_seed_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create table if not exists assets (
  asset_id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items(content_id) on delete cascade,
  scene_number integer,
  asset_role text not null,
  provider text,
  source_url text,
  storage_url text,
  mime_type text,
  duration_seconds numeric(8,2),
  width integer,
  height integer,
  status text not null default 'pending',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assets_content_id on assets (content_id);

create table if not exists renders (
  render_id uuid primary key default gen_random_uuid(),
  content_id uuid not null unique references content_items(content_id) on delete cascade,
  render_manifest_json jsonb not null default '{}'::jsonb,
  output_video_url text,
  cover_image_url text,
  resolution text,
  aspect_ratio text,
  duration_seconds numeric(8,2),
  render_status text not null default 'queued',
  render_log text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists publishes (
  publish_id uuid primary key default gen_random_uuid(),
  content_id uuid not null unique references content_items(content_id) on delete cascade,
  platform text not null default 'instagram',
  publish_status text not null default 'draft',
  caption_final text,
  hashtags_final text,
  instagram_media_id text,
  instagram_container_id text,
  scheduled_for timestamptz,
  published_at timestamptz,
  publish_error text,
  created_at timestamptz not null default now()
);

create table if not exists insight_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items(content_id) on delete cascade,
  platform text not null default 'instagram',
  snapshot_window text not null,
  views integer,
  plays integer,
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  engagement_rate numeric(8,4),
  completion_rate numeric(8,4),
  raw_payload_json jsonb not null default '{}'::jsonb,
  snapshot_taken_at timestamptz not null default now()
);

create table if not exists performance_reviews (
  review_id uuid primary key default gen_random_uuid(),
  content_id uuid not null unique references content_items(content_id) on delete cascade,
  review_summary text,
  what_worked text,
  what_failed text,
  hook_analysis text,
  category_analysis text,
  visual_analysis text,
  next_recommendation text,
  review_generated_at timestamptz not null default now()
);

create table if not exists workflow_runs (
  run_id uuid primary key default gen_random_uuid(),
  content_id uuid references content_items(content_id) on delete set null,
  workflow_name text not null,
  run_status text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms integer,
  error_message text,
  retry_count integer not null default 0,
  details_json jsonb not null default '{}'::jsonb
);
