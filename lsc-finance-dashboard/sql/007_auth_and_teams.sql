create type app_user_role as enum (
  'super_admin',
  'finance_admin',
  'team_member',
  'commercial_user',
  'viewer'
);

create type team_membership_role as enum ('lead', 'member');

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  normalized_email text not null unique,
  role app_user_role not null default 'viewer',
  password_hash text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists app_user_company_access (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  access_role app_user_role not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (app_user_id, company_id)
);

create table if not exists app_teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  team_code text not null,
  team_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, team_code)
);

create table if not exists team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references app_teams(id) on delete cascade,
  app_user_id uuid not null references app_users(id) on delete cascade,
  membership_role team_membership_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (team_id, app_user_id)
);

create table if not exists auth_access_events (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references app_users(id) on delete set null,
  event_type text not null,
  event_status text not null,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_users_normalized_email on app_users(normalized_email);
create index if not exists idx_company_access_user on app_user_company_access(app_user_id);
create index if not exists idx_team_memberships_user on team_memberships(app_user_id);
create index if not exists idx_auth_access_events_user on auth_access_events(app_user_id, created_at desc);
