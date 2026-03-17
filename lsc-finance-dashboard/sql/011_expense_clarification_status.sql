do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'needs_clarification'
      and enumtypid = 'expense_submission_status'::regtype
  ) then
    alter type expense_submission_status add value 'needs_clarification' after 'in_review';
  end if;
end $$;
