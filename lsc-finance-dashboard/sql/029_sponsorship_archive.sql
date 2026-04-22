-- 029_sponsorship_archive.sql
-- Extend sponsorship_contract_status enum with 'archived' so sponsorships
-- can be hidden from active views without losing history.
alter type sponsorship_contract_status add value if not exists 'archived';
