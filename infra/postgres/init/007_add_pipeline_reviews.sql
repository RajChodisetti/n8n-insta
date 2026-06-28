create table if not exists pipeline_reviews (
  review_id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references pipeline_runs(pipeline_run_id) on delete cascade,
  content_id uuid references content_items(content_id) on delete set null,
  stage_key text not null,
  review_kind text not null,
  review_status text not null default 'pending',
  title text not null,
  summary text,
  artifact_json jsonb not null default '{}'::jsonb,
  editable_json jsonb not null default '{}'::jsonb,
  approved_json jsonb,
  reviewer text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (pipeline_run_id, stage_key, review_kind)
);

create index if not exists idx_pipeline_reviews_status
  on pipeline_reviews (review_status, updated_at desc);

create index if not exists idx_pipeline_reviews_run
  on pipeline_reviews (pipeline_run_id, created_at desc);

create index if not exists idx_pipeline_reviews_content
  on pipeline_reviews (content_id, created_at desc);

do $$
begin
  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_pipeline_runs_one_active_per_content_action'
      and indexdef not like '%awaiting_review%'
  ) then
    drop index idx_pipeline_runs_one_active_per_content_action;
  end if;
end $$;

create unique index if not exists idx_pipeline_runs_one_active_per_content_action
  on pipeline_runs (content_id, requested_action)
  where status in ('queued', 'running', 'awaiting_review');
