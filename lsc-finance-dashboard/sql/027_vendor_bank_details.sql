-- 027: Vendor bank/beneficiary details + address
-- Extends vendors table so invoices can auto-populate payment info

alter table vendors
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists bank_name text,
  add column if not exists bank_branch text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_swift text,
  add column if not exists bank_iban text,
  add column if not exists bank_routing_code text,
  add column if not exists currency_code text not null default 'USD';

-- Seed Sayan Mukherjee as a vendor/beneficiary under XTZ
do $$
declare
  xtz_id uuid;
  v_id uuid;
begin
  select id into xtz_id from companies where code = 'XTZ'::company_code;
  if xtz_id is null then return; end if;

  insert into vendors (name, vendor_type, status, payment_terms,
    address, city, country, email, phone,
    bank_name, bank_branch, bank_account_number, bank_ifsc, bank_swift,
    currency_code, notes)
  select
    'Sayan Mukherjee', 'service_provider'::vendor_type, 'active'::vendor_status,
    'Payable on Receipt',
    'D2, 4th Floor, AC 86, Gallery Suite, New Town', 'Kolkata 700156', 'India',
    'sayan0151996@gmail.com', '+91 9204384567',
    'HDFC Bank',
    'No 89, Ground Floor, Badami Mansion, Main Road, Parsudih, East Singhbhum — 831002',
    '50100153694001', 'HDFC0009081', 'HDFCINBBXXX',
    'USD',
    'Product Lead — payroll invoiced separately via XTE Dubai'
  where not exists (select 1 from vendors where name = 'Sayan Mukherjee')
  returning id into v_id;

  -- Link to XTZ company
  if v_id is not null then
    insert into vendor_entity_links (vendor_id, company_id, is_primary)
    values (v_id, xtz_id, true)
    on conflict do nothing;
  end if;
end $$;
