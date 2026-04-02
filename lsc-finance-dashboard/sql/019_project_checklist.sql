-- 019: Project checklist for platform build tracking

do $$
begin
  if not exists (select 1 from pg_type where typname = 'checklist_priority') then
    create type checklist_priority as enum ('critical', 'high', 'medium', 'low');
  end if;
  if not exists (select 1 from pg_type where typname = 'checklist_status') then
    create type checklist_status as enum ('done', 'in_progress', 'blocked', 'pending');
  end if;
end $$;

create table if not exists project_checklist (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  section text not null default 'General',
  priority checklist_priority not null default 'medium',
  status checklist_status not null default 'pending',
  route text,
  depends_on uuid references project_checklist(id) on delete set null,
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_checklist_section on project_checklist(section, sort_order);
create index if not exists idx_project_checklist_status on project_checklist(status);
