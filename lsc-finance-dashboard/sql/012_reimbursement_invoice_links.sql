alter table if exists invoice_intakes
  add column if not exists linked_submission_id uuid references expense_submissions(id) on delete set null;

create unique index if not exists idx_invoice_intakes_linked_submission
  on invoice_intakes(linked_submission_id)
  where linked_submission_id is not null;
