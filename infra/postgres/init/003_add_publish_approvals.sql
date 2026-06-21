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
