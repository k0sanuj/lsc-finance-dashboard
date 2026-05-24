create table if not exists auth_allowed_identities (
  normalized_email text primary key,
  email text not null unique,
  full_name text not null,
  role app_user_role not null default 'viewer',
  is_active boolean not null default true,
  invited_at timestamptz not null default now(),
  last_allowed_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists auth_magic_links (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references app_users(id) on delete cascade,
  normalized_email text not null references auth_allowed_identities(normalized_email) on delete cascade,
  token_hash text not null unique,
  requested_ip text,
  user_agent text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_auth_allowed_identities_active
  on auth_allowed_identities(is_active, normalized_email);

create index if not exists idx_auth_magic_links_email_created
  on auth_magic_links(normalized_email, created_at desc);

create index if not exists idx_auth_magic_links_open
  on auth_magic_links(normalized_email, expires_at)
  where consumed_at is null and revoked_at is null;

insert into auth_allowed_identities (
  normalized_email,
  email,
  full_name,
  role,
  is_active,
  metadata
)
select
  normalized_email,
  email,
  full_name,
  role,
  true,
  jsonb_build_object('seeded_from', 'existing_active_app_users')
from app_users
where is_active = true
on conflict (normalized_email) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      is_active = true,
      updated_at = now(),
      metadata = auth_allowed_identities.metadata || excluded.metadata;
