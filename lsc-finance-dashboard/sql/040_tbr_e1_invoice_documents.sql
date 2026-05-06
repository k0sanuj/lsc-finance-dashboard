-- 040_tbr_e1_invoice_documents.sql
-- Allows multiple source PDFs to be attached to a single TBR E1 invoice group
-- without forcing duplicate financial rows into the canonical E1 ledger.

create table if not exists tbr_e1_invoice_documents (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references tbr_seasons(id) on delete cascade,
  invoice_number text not null,
  source_document_id uuid not null references source_documents(id) on delete cascade,
  linked_by_user_id uuid references app_users(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (season_id, invoice_number, source_document_id)
);

create index if not exists idx_tbr_e1_invoice_documents_invoice
  on tbr_e1_invoice_documents(season_id, invoice_number);

create or replace view tbr_e1_invoice_tracker_by_season as
with invoice_groups as (
  select
    ts.id as season_id,
    ts.season_code,
    ts.season_number,
    ts.season_year,
    ts.season_label,
    ts.status as season_status,
    e1.invoice_number,
    count(*)::integer as line_count,
    coalesce(sum(e1.reporting_amount_usd), 0)::numeric(14,2) as total_amount_usd,
    coalesce(sum(e1.due_amount_reporting_usd), 0)::numeric(14,2) as due_amount_usd,
    case
      when bool_and(e1.normalized_status = 'paid') then 'paid'
      when bool_or(e1.normalized_status = 'partially_paid') then 'partially_paid'
      when bool_or(e1.normalized_status in ('due', 'unpaid')) then 'due'
      when bool_or(e1.normalized_status = 'issued') then 'issued'
      when bool_or(e1.normalized_status = 'pending_review') then 'pending_review'
      when bool_or(e1.normalized_status = 'credit_note') then 'credit_note'
      when bool_or(e1.normalized_status = 'not_applicable') then 'not_applicable'
      when bool_or(e1.normalized_status = 'void') then 'void'
      else 'pending_review'
    end as rollup_status,
    string_agg(distinct nullif(e1.comments, ''), E'\n') as notes,
    max(e1.updated_at) as latest_line_updated_at,
    (array_agg(e1.item order by abs(e1.reporting_amount_usd) desc nulls last, e1.item))[1] as primary_item
  from tbr_e1_accounting_lines e1
  join tbr_seasons ts on ts.id = e1.season_id
  where e1.line_type <> 'source_check'
  group by ts.id, ts.season_code, ts.season_number, ts.season_year, ts.season_label, ts.status, e1.invoice_number
),
mapped_documents as (
  select
    tid.season_id,
    tid.invoice_number,
    count(distinct sd.id)::integer as document_count,
    (array_agg(sd.id order by tid.created_at desc, sd.source_name))[1] as source_document_id,
    (array_agg(sd.source_name order by tid.created_at desc, sd.source_name))[1] as source_document_name,
    (array_agg(sd.metadata order by tid.created_at desc, sd.source_name))[1] as source_document_metadata,
    jsonb_agg(
      jsonb_build_object(
        'sourceDocumentId', sd.id::text,
        'sourceDocumentName', sd.source_name,
        'metadata', sd.metadata
      )
      order by tid.created_at desc, sd.source_name
    ) as document_refs
  from tbr_e1_invoice_documents tid
  join source_documents sd on sd.id = tid.source_document_id
  group by tid.season_id, tid.invoice_number
),
line_documents as (
  select
    e1.season_id,
    e1.invoice_number,
    count(distinct sd.id) filter (where sd.id is not null)::integer as document_count,
    (array_agg(distinct sd.id) filter (where sd.id is not null))[1] as source_document_id,
    max(sd.source_name) filter (where sd.id is not null) as source_document_name,
    (array_agg(sd.metadata) filter (where sd.id is not null))[1] as source_document_metadata,
    jsonb_agg(
      distinct jsonb_build_object(
        'sourceDocumentId', sd.id::text,
        'sourceDocumentName', sd.source_name,
        'metadata', sd.metadata
      )
    ) filter (where sd.id is not null) as document_refs
  from tbr_e1_accounting_lines e1
  left join source_documents sd on sd.id = e1.source_document_id
  where e1.line_type <> 'source_check'
  group by e1.season_id, e1.invoice_number
)
select
  ig.season_id,
  ig.season_code,
  ig.season_number,
  ig.season_year,
  ig.season_label,
  ig.season_status,
  ig.invoice_number,
  ig.line_count,
  ig.total_amount_usd,
  ig.due_amount_usd,
  ig.rollup_status,
  coalesce(md.document_count, ld.document_count, 0) as document_count,
  coalesce(md.source_document_id, ld.source_document_id) as source_document_id,
  coalesce(md.source_document_name, ld.source_document_name) as source_document_name,
  ig.notes,
  ig.latest_line_updated_at,
  ig.primary_item,
  coalesce(md.source_document_metadata, ld.source_document_metadata) as source_document_metadata,
  coalesce(md.document_refs, ld.document_refs, '[]'::jsonb) as document_refs
from invoice_groups ig
left join mapped_documents md
  on md.season_id = ig.season_id
 and md.invoice_number is not distinct from ig.invoice_number
left join line_documents ld
  on ld.season_id = ig.season_id
 and ld.invoice_number is not distinct from ig.invoice_number;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'lsc_app_read') then
    grant select on
      tbr_e1_invoice_documents,
      tbr_e1_invoice_tracker_by_season
    to lsc_app_read;
  end if;

  if exists (select 1 from pg_roles where rolname = 'lsc_import_rw') then
    grant select, insert, update, delete on
      tbr_e1_invoice_documents
    to lsc_import_rw;
  end if;
end $$;
