-- 020: Add region to employees, FX rate cache table

alter table employees add column if not exists region text;

-- Cache for exchange rates (refreshed periodically)
create table if not exists fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  target_currency text not null,
  rate numeric(16,6) not null,
  fetched_at timestamptz not null default now(),
  unique (base_currency, target_currency)
);

create index if not exists idx_fx_rates_pair on fx_rates(base_currency, target_currency);
