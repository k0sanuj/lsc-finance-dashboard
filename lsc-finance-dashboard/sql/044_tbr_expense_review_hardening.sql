-- 044: TBR expense submission/review hardening
-- Adds item-level review, original/reporting currency preservation, workspace
-- rules/tags, export audit records, and a narrow submitter role for external
-- expense portals.

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'expense_submitter'
      and enumtypid = 'app_user_role'::regtype
  ) then
    alter type app_user_role add value 'expense_submitter' after 'team_member';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'expense_item_review_status'
  ) then
    create type expense_item_review_status as enum (
      'pending',
      'review',
      'approved',
      'rejected',
      'needs_info'
    );
  end if;
end $$;

alter table expense_submissions
  add column if not exists accepted_review_at timestamptz,
  add column if not exists invoice_recipient_label text,
  add column if not exists exported_at timestamptz,
  add column if not exists export_count integer not null default 0,
  add column if not exists report_metadata jsonb not null default '{}'::jsonb;

alter table expense_submission_items
  add column if not exists original_currency_code text,
  add column if not exists original_amount numeric(14,2),
  add column if not exists fx_rate_to_usd numeric(14,6),
  add column if not exists fx_source text,
  add column if not exists reporting_currency_code text not null default 'USD',
  add column if not exists reporting_amount_usd numeric(14,2),
  add column if not exists approved_amount_usd numeric(14,2),
  add column if not exists review_status expense_item_review_status not null default 'pending',
  add column if not exists reviewed_by_user_id uuid references app_users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason_code text,
  add column if not exists rejection_reason_detail text,
  add column if not exists challenge_status text not null default 'none',
  add column if not exists challenge_reason text,
  add column if not exists challenged_at timestamptz,
  add column if not exists challenge_response text,
  add column if not exists challenge_responded_by_user_id uuid references app_users(id) on delete set null,
  add column if not exists challenge_responded_at timestamptz,
  add column if not exists receipt_status text not null default 'unknown',
  add column if not exists no_receipt_reason text,
  add column if not exists rule_summary jsonb not null default '{}'::jsonb;

alter table expense_submission_items
  drop constraint if exists expense_submission_items_challenge_status_check,
  add constraint expense_submission_items_challenge_status_check
    check (challenge_status in ('none', 'challenged', 'accepted', 'resolved'));

alter table expense_submission_items
  drop constraint if exists expense_submission_items_receipt_status_check,
  add constraint expense_submission_items_receipt_status_check
    check (receipt_status in ('unknown', 'attached', 'missing_with_reason', 'missing'));

update expense_submission_items
set original_currency_code = coalesce(original_currency_code, currency_code),
    original_amount = coalesce(original_amount, amount),
    reporting_currency_code = coalesce(reporting_currency_code, 'USD'),
    reporting_amount_usd = coalesce(reporting_amount_usd, amount),
    approved_amount_usd = coalesce(approved_amount_usd, amount),
    fx_rate_to_usd = coalesce(
      fx_rate_to_usd,
      case when coalesce(original_currency_code, currency_code) = 'USD' then 1 else null end
    ),
    fx_source = coalesce(fx_source, case when coalesce(original_currency_code, currency_code) = 'USD' then 'native_usd' else null end),
    receipt_status = case
      when source_document_id is not null then 'attached'
      when no_receipt_reason is not null and length(trim(no_receipt_reason)) > 0 then 'missing_with_reason'
      else receipt_status
    end
where original_currency_code is null
   or original_amount is null
   or reporting_amount_usd is null
   or approved_amount_usd is null;

alter table expenses
  add column if not exists original_currency_code text,
  add column if not exists original_amount numeric(14,2),
  add column if not exists fx_rate_to_usd numeric(14,6),
  add column if not exists fx_source text,
  add column if not exists reporting_currency_code text not null default 'USD',
  add column if not exists reporting_amount_usd numeric(14,2),
  add column if not exists source_expense_submission_id uuid references expense_submissions(id) on delete set null,
  add column if not exists source_expense_submission_item_id uuid references expense_submission_items(id) on delete set null;

update expenses
set original_currency_code = coalesce(original_currency_code, currency_code),
    original_amount = coalesce(original_amount, amount),
    reporting_currency_code = coalesce(reporting_currency_code, 'USD'),
    reporting_amount_usd = coalesce(reporting_amount_usd, amount),
    fx_rate_to_usd = coalesce(fx_rate_to_usd, case when coalesce(original_currency_code, currency_code) = 'USD' then 1 else null end),
    fx_source = coalesce(fx_source, case when coalesce(original_currency_code, currency_code) = 'USD' then 'native_usd' else null end)
where original_currency_code is null
   or original_amount is null
   or reporting_amount_usd is null;

create unique index if not exists idx_expenses_source_expense_submission_item
  on expenses(source_expense_submission_item_id)
  where source_expense_submission_item_id is not null;

create table if not exists app_user_feature_access (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_users(id) on delete cascade,
  feature_key text not null,
  company_id uuid references companies(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_user_id, feature_key, company_id)
);

create index if not exists idx_app_user_feature_access_user
  on app_user_feature_access(app_user_id, feature_key, is_active);

create table if not exists expense_workspace_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  rule_key text not null,
  rule_label text not null,
  rule_description text,
  severity text not null default 'warning',
  rule_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by_user_id uuid references app_users(id) on delete set null,
  updated_by_user_id uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, rule_key)
);

alter table expense_workspace_rules
  drop constraint if exists expense_workspace_rules_severity_check,
  add constraint expense_workspace_rules_severity_check
    check (severity in ('info', 'warning', 'blocker'));

create table if not exists expense_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tag_key text not null,
  tag_label text not null,
  tag_description text,
  is_active boolean not null default true,
  created_by_user_id uuid references app_users(id) on delete set null,
  updated_by_user_id uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tag_key)
);

create table if not exists expense_submission_item_tags (
  expense_submission_item_id uuid not null references expense_submission_items(id) on delete cascade,
  expense_tag_id uuid not null references expense_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (expense_submission_item_id, expense_tag_id)
);

create table if not exists expense_item_rule_findings (
  id uuid primary key default gen_random_uuid(),
  expense_submission_item_id uuid not null references expense_submission_items(id) on delete cascade,
  workspace_rule_id uuid references expense_workspace_rules(id) on delete set null,
  race_budget_rule_id uuid references race_budget_rules(id) on delete set null,
  rule_key text not null,
  severity text not null default 'warning',
  finding_status text not null default 'open',
  suggested_review_status expense_item_review_status,
  suggested_approved_amount_usd numeric(14,2),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table expense_item_rule_findings
  drop constraint if exists expense_item_rule_findings_severity_check,
  add constraint expense_item_rule_findings_severity_check
    check (severity in ('info', 'warning', 'blocker'));

alter table expense_item_rule_findings
  drop constraint if exists expense_item_rule_findings_status_check,
  add constraint expense_item_rule_findings_status_check
    check (finding_status in ('open', 'acknowledged', 'resolved', 'dismissed'));

create index if not exists idx_expense_item_rule_findings_item
  on expense_item_rule_findings(expense_submission_item_id, finding_status);

create table if not exists expense_report_exports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references expense_submissions(id) on delete cascade,
  exported_by_user_id uuid references app_users(id) on delete set null,
  export_kind text not null default 'csv',
  export_status text not null default 'sent',
  file_name text not null,
  row_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table expense_report_exports
  drop constraint if exists expense_report_exports_kind_check,
  add constraint expense_report_exports_kind_check check (export_kind in ('csv'));

alter table expense_report_exports
  drop constraint if exists expense_report_exports_status_check,
  add constraint expense_report_exports_status_check check (export_status in ('generated', 'sent', 'downloaded'));

create or replace view v_tbr_expense_submission_review as
select
  es.id as submission_id,
  es.submission_title,
  es.submission_status::text as submission_status,
  es.race_event_id,
  re.name as race_name,
  re.season_year,
  es.submitted_by_user_id,
  au.full_name as submitter_name,
  es.submitted_at,
  count(esi.id)::int as item_count,
  coalesce(sum(esi.reporting_amount_usd), 0)::numeric(14,2) as submitted_amount_usd,
  coalesce(sum(coalesce(esi.approved_amount_usd, esi.reporting_amount_usd)) filter (where esi.review_status = 'approved'), 0)::numeric(14,2) as approved_amount_usd,
  coalesce(sum(esi.reporting_amount_usd) filter (where esi.review_status = 'rejected'), 0)::numeric(14,2) as rejected_amount_usd,
  count(*) filter (where esi.review_status = 'approved')::int as approved_item_count,
  count(*) filter (where esi.review_status = 'rejected')::int as rejected_item_count,
  count(*) filter (where esi.review_status in ('pending', 'review', 'needs_info'))::int as open_item_count,
  count(*) filter (where esi.challenge_status = 'challenged')::int as challenged_item_count,
  count(*) filter (where coalesce(esi.receipt_status, 'unknown') <> 'attached')::int as missing_receipt_count,
  coalesce(sum(open_findings.open_count), 0)::int as open_rule_finding_count,
  max(es.updated_at) as updated_at
from expense_submissions es
join companies c on c.id = es.company_id and c.code = 'TBR'::company_code
join app_users au on au.id = es.submitted_by_user_id
left join race_events re on re.id = es.race_event_id
left join expense_submission_items esi on esi.submission_id = es.id
left join lateral (
  select count(*)::int as open_count
  from expense_item_rule_findings erf
  where erf.expense_submission_item_id = esi.id
    and erf.finding_status = 'open'
) open_findings on true
group by es.id, re.name, re.season_year, au.full_name;

create or replace view v_tbr_expense_item_review as
select
  esi.id as item_id,
  esi.submission_id,
  es.race_event_id,
  re.name as race_name,
  esi.merchant_name,
  esi.expense_date,
  cc.name as category_name,
  esi.description,
  esi.original_currency_code,
  esi.original_amount,
  esi.fx_rate_to_usd,
  esi.fx_source,
  esi.reporting_amount_usd,
  esi.approved_amount_usd,
  esi.review_status::text as review_status,
  esi.rejection_reason_code,
  esi.rejection_reason_detail,
  esi.challenge_status,
  esi.challenge_reason,
  esi.receipt_status,
  esi.no_receipt_reason,
  sd.source_name as source_document_name,
  coalesce(tags.tag_labels, '') as tag_labels,
  coalesce(findings.open_rule_finding_count, 0)::int as open_rule_finding_count,
  coalesce(findings.rule_messages, '') as rule_messages
from expense_submission_items esi
join expense_submissions es on es.id = esi.submission_id
left join race_events re on re.id = es.race_event_id
left join cost_categories cc on cc.id = esi.cost_category_id
left join source_documents sd on sd.id = esi.source_document_id
left join lateral (
  select string_agg(et.tag_label, ', ' order by et.tag_label) as tag_labels
  from expense_submission_item_tags esit
  join expense_tags et on et.id = esit.expense_tag_id
  where esit.expense_submission_item_id = esi.id
) tags on true
left join lateral (
  select
    count(*) filter (where erf.finding_status = 'open')::int as open_rule_finding_count,
    string_agg(erf.message, ' | ' order by erf.created_at) filter (where erf.finding_status = 'open') as rule_messages
  from expense_item_rule_findings erf
  where erf.expense_submission_item_id = esi.id
) findings on true;

create or replace view v_tbr_expense_cost_recognition as
select
  esi.id as expense_submission_item_id,
  es.id as expense_submission_id,
  es.race_event_id,
  esi.cost_category_id,
  coalesce(esi.approved_amount_usd, esi.reporting_amount_usd, esi.amount)::numeric(14,2) as recognized_amount_usd,
  esi.review_status::text as review_status,
  esi.linked_expense_id,
  case
    when esi.review_status = 'approved' and esi.linked_expense_id is not null then 'canonical_posted'
    when esi.review_status = 'approved' then 'approved_not_posted'
    else 'not_recognized'
  end as recognition_status
from expense_submission_items esi
join expense_submissions es on es.id = esi.submission_id
join companies c on c.id = es.company_id and c.code = 'TBR'::company_code;
