-- Run this after the base schema exists.
-- Replace the placeholder passwords before executing in a real environment.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lsc_app_read') then
    create role lsc_app_read login password '{{LSC_APP_READ_PASSWORD}}';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'lsc_import_rw') then
    create role lsc_import_rw login password '{{LSC_IMPORT_RW_PASSWORD}}';
  end if;
end
$$;

grant connect on database neondb to lsc_app_read;
grant connect on database neondb to lsc_import_rw;

grant usage on schema public to lsc_app_read;
grant usage on schema public to lsc_import_rw;

grant select on
  companies,
  sponsors_or_customers,
  app_users,
  owners,
  contracts,
  app_user_company_access,
  app_teams,
  team_memberships,
  auth_access_events,
  expense_submissions,
  expense_submission_items,
  expense_item_splits,
  race_budget_rules,
  invoice_intakes,
  document_analysis_runs,
  document_intake_events,
  document_extracted_fields,
  document_posting_events,
  invoices,
  payments,
  expenses,
  revenue_records,
  race_events,
  cost_categories,
  commercial_targets,
  source_documents,
  import_batches,
  raw_import_rows,
  agent_nodes,
  agent_edges,
  agent_tasks,
  agent_handoffs,
  workflow_nodes,
  workflow_edges,
  workflow_runs,
  workflow_stage_events
to lsc_app_read;

grant select on
  consolidated_company_metrics,
  monthly_financial_summary,
  receivables_aging,
  payments_due,
  tbr_race_cost_summary,
  tbr_sponsor_revenue_summary,
  commercial_goal_progress,
  partner_performance
to lsc_app_read;

grant select, insert, update on
  sponsors_or_customers,
  owners,
  contracts,
  race_events,
  app_teams,
  team_memberships,
  expense_submissions,
  expense_submission_items,
  expense_item_splits,
  race_budget_rules,
  invoice_intakes,
  source_documents,
  import_batches,
  raw_import_rows,
  commercial_targets
to lsc_import_rw;

grant select, insert, update, delete on
  app_users,
  app_user_company_access,
  auth_access_events,
  document_analysis_runs,
  document_intake_events,
  document_extracted_fields,
  document_posting_events,
  invoices,
  payments,
  expenses,
  revenue_records,
  source_documents,
  import_batches,
  raw_import_rows
to lsc_import_rw;

grant select on
  companies,
  race_events,
  cost_categories,
  app_users,
  agent_nodes,
  agent_edges,
  workflow_nodes,
  workflow_edges,
  consolidated_company_metrics,
  monthly_financial_summary,
  receivables_aging,
  payments_due,
  tbr_race_cost_summary,
  tbr_sponsor_revenue_summary,
  commercial_goal_progress,
  partner_performance
to lsc_import_rw;

alter default privileges in schema public
grant select on tables to lsc_app_read;

alter default privileges in schema public
grant select, insert, update on tables to lsc_import_rw;
