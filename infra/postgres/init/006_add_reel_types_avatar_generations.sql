alter table content_items
  add column if not exists reel_type text not null default 'video';

alter table pipeline_runs
  add column if not exists reel_type text;

update content_items
set reel_type = 'video'
where reel_type is null or btrim(reel_type) = '';

update pipeline_runs pr
set reel_type = coalesce(ci.reel_type, 'video')
from content_items ci
where pr.content_id = ci.content_id
  and pr.reel_type is null
  and pr.requested_action = 'generate_reel';

alter table content_items
  drop constraint if exists content_items_reel_type_check;

alter table content_items
  add constraint content_items_reel_type_check
  check (reel_type in ('image', 'video', 'avatar', 'hybrid'));

alter table pipeline_runs
  drop constraint if exists pipeline_runs_reel_type_check;

alter table pipeline_runs
  add constraint pipeline_runs_reel_type_check
  check (reel_type is null or reel_type in ('image', 'video', 'avatar', 'hybrid'));

create index if not exists idx_content_items_reel_type
  on content_items (reel_type, updated_at desc);

create table if not exists avatar_generations (
  avatar_generation_id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items(content_id) on delete cascade,
  provider text not null default 'heygen',
  provider_request_id text,
  provider_video_id text,
  provider_status text not null default 'queued',
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  output_url text,
  thumbnail_url text,
  duration_seconds numeric(8,2),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_avatar_generations_content_id
  on avatar_generations (content_id, created_at desc);

create index if not exists idx_avatar_generations_provider_status
  on avatar_generations (provider, provider_status, updated_at desc);
