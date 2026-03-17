alter table contracts
  add column if not exists source_document_id uuid references source_documents(id);

create index if not exists idx_contracts_source_document_id
  on contracts(source_document_id);
