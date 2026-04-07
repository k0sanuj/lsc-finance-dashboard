-- 021: Add multi-entity reimbursement fields to expense_submissions
-- Supports: "Who paid?" (billing_entity), "Who reimburses?" (reimbursing_entity),
-- "Which brand is this for?" (tagged_brand)

alter table expense_submissions
  add column if not exists billing_entity_id uuid references companies(id),
  add column if not exists reimbursing_entity_id uuid references companies(id),
  add column if not exists tagged_brand text;

-- Add 'needs_clarification' to expense_submission_status if not present
-- (may already exist from migration 011)

comment on column expense_submissions.billing_entity_id is
  'The entity that originally paid (e.g. XTZ India if employee paid via XTZ)';
comment on column expense_submissions.reimbursing_entity_id is
  'The entity that will reimburse (e.g. LSC/XTE if XTZ invoices them)';
comment on column expense_submissions.tagged_brand is
  'The brand/sport this expense is attributed to (TBR, FSP, Basketball, Bowling, etc.)';
