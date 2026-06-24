create table if not exists pipeline_runs (
  pipeline_run_id uuid primary key default gen_random_uuid(),
  content_id uuid references content_items(content_id) on delete set null,
  requested_action text not null default 'generate_reel',
  status text not null default 'queued',
  current_stage text,
  stage_plan jsonb not null default '[]'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  last_error text,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pipeline_runs_status
  on pipeline_runs (status, updated_at);

create index if not exists idx_pipeline_runs_content_id
  on pipeline_runs (content_id, created_at desc);

create unique index if not exists idx_pipeline_runs_one_active_per_content_action
  on pipeline_runs (content_id, requested_action)
  where status in ('queued', 'running');

create table if not exists pipeline_steps (
  pipeline_step_id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references pipeline_runs(pipeline_run_id) on delete cascade,
  content_id uuid references content_items(content_id) on delete set null,
  stage_key text not null,
  stage_order integer not null,
  step_status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 1,
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms integer,
  input_summary_json jsonb not null default '{}'::jsonb,
  output_summary_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_run_id, stage_order),
  unique (pipeline_run_id, stage_key)
);

create index if not exists idx_pipeline_steps_run_status
  on pipeline_steps (pipeline_run_id, step_status, stage_order);

create index if not exists idx_pipeline_steps_content_id
  on pipeline_steps (content_id, created_at desc);

create table if not exists pipeline_events (
  pipeline_event_id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid references pipeline_runs(pipeline_run_id) on delete cascade,
  pipeline_step_id uuid references pipeline_steps(pipeline_step_id) on delete set null,
  content_id uuid references content_items(content_id) on delete set null,
  event_type text not null,
  event_level text not null default 'info',
  stage_key text,
  message text not null,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pipeline_events_run
  on pipeline_events (pipeline_run_id, created_at desc);

create index if not exists idx_pipeline_events_content
  on pipeline_events (content_id, created_at desc);
