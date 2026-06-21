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
