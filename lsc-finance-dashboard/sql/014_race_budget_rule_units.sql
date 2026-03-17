alter table race_budget_rules
  add column if not exists unit_label text not null default 'per_race';

alter table race_budget_rules
  drop constraint if exists race_budget_rules_unit_label_check;

alter table race_budget_rules
  add constraint race_budget_rules_unit_label_check
  check (unit_label in ('per_day', 'per_person', 'per_race', 'total'));
