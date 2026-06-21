create table if not exists directors (
  director_id uuid primary key default gen_random_uuid(),
  content_id uuid not null unique references content_items(content_id) on delete cascade,
  voice_role text,
  tts_delivery text,
  global_visual_style text,
  visual_strategy text,
  global_pacing text,
  global_music_direction text,
  director_json jsonb not null default '{}'::jsonb,
  generation_model text,
  generated_at timestamptz not null default now()
);

create index if not exists idx_directors_content_id on directors (content_id);
