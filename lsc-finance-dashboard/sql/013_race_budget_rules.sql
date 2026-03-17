do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'race_budget_rule_kind'
  ) then
    create type race_budget_rule_kind as enum ('per_diem', 'budget_cap', 'approved_charge');
  end if;
end
$$;

create table if not exists race_budget_rules (
  id uuid primary key default gen_random_uuid(),
  race_event_id uuid not null references race_events(id) on delete cascade,
  cost_category_id uuid not null references cost_categories(id) on delete restrict,
  rule_kind race_budget_rule_kind not null default 'budget_cap',
  rule_label text not null,
  approved_amount_usd numeric(14,2) not null,
  close_threshold_ratio numeric(7,4) not null default 0.90,
  notes text,
  created_by_user_id uuid references app_users(id) on delete set null,
  updated_by_user_id uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_event_id, cost_category_id, rule_kind)
);

create index if not exists idx_race_budget_rules_race on race_budget_rules(race_event_id, created_at desc);
create index if not exists idx_race_budget_rules_category on race_budget_rules(cost_category_id);
