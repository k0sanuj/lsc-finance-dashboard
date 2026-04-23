-- 024: Seed Sports Dashboard checklist items

insert into project_checklist (title, description, section, priority, status, route, sort_order, completed_at)
values
  -- Completed items
  ('FSP Sport entities setup', 'Basketball, Bowling (WBL), Squash, World Pong, Foundation Events', 'Sports Dashboard', 'high', 'done', '/fsp/sports', 10, now()),
  ('Sport module DB schema (12 tables)', 'pnl_line_items, sponsorships, media_metrics, media_revenue, broadcast_partners, influencer_tiers, regional_cpms, opex_items, event_production, event_config, league_payroll, tech_payroll, revenue_share', 'Sports Dashboard', 'critical', 'done', null, 20, now()),
  ('P&L Summary view (auto-computed)', 'fsp_pnl_summary SQL view: Revenue/COGS/OPEX/EBITDA per sport per scenario', 'Sports Dashboard', 'critical', 'done', null, 30, now()),
  ('Scenario support (conservative/base/optimistic)', 'Scenario enum and filtering on all P&L line items', 'Sports Dashboard', 'high', 'done', null, 40, now()),
  ('WPS Squash reference data seeded', '28 P&L line items, 6 league roles, 10 tech roles, revenue share, event config', 'Sports Dashboard', 'high', 'done', '/fsp/sports/squash', 50, now()),
  ('Sport module page with 9 tabs', 'P&L, Sponsorship, Media, OPEX, Production, Payroll, Tech, Revenue Share, Config', 'Sports Dashboard', 'critical', 'done', '/fsp/sports/squash', 60, now()),
  ('FSP Consolidated P&L view', 'Aggregated P&L across all sports with per-sport cards and revenue chart', 'Sports Dashboard', 'critical', 'done', '/fsp/consolidated', 70, now()),
  ('Sport-level sidebar navigation', 'Direct links to each sport module from FSP section', 'Sports Dashboard', 'high', 'done', null, 80, now()),
  ('Sport module query layer', 'All 9 module query functions with typed outputs', 'Sports Dashboard', 'high', 'done', null, 90, now()),
  -- Pending items
  ('Unified Sports Dashboard', 'Cross-sport summary with KPIs, revenue breakdown, headcount, EBITDA waterfall', 'Sports Dashboard', 'critical', 'pending', '/sports-dashboard', 5, null),
  ('Sponsorship CRUD actions', 'Add/edit/archive sponsorships per sport with contract upload', 'Sports Dashboard', 'high', 'pending', null, 100, null),
  ('Media Revenue CPM model UI', 'Non-linear + linear CPM calculations, influencer economics', 'Sports Dashboard', 'high', 'pending', null, 110, null),
  ('OPEX detailed sub-categories UI', 'Social media, PR, entertainment, influencer KPI dashboard', 'Sports Dashboard', 'medium', 'pending', null, 120, null),
  ('Event Production cost estimator UI', 'Per-event cost breakdown with segment scaling', 'Sports Dashboard', 'medium', 'pending', null, 130, null),
  ('Budget vs Actual tracking', 'Variance columns with green/yellow/red color coding', 'Sports Dashboard', 'high', 'pending', null, 140, null),
  ('Scenario toggle UI', 'Switch Conservative/Base/Optimistic on any module', 'Sports Dashboard', 'medium', 'pending', null, 150, null),
  ('Broadcast partner registry UI', 'Per-sport broadcast partner list', 'Sports Dashboard', 'low', 'pending', null, 160, null),
  ('Sport creation wizard', 'Admin configures line items and assumptions for new sport', 'Sports Dashboard', 'medium', 'pending', null, 170, null),
  ('CSV bulk import per module', 'Import data from CSV for any module', 'Sports Dashboard', 'medium', 'pending', null, 180, null),
  ('Excel export per sport', '9-sheet workbook matching WPS format', 'Sports Dashboard', 'medium', 'pending', null, 190, null),
  ('Bowling module data population', 'Bowling-specific line items and assumptions', 'Sports Dashboard', 'medium', 'pending', '/fsp/sports/bowling', 200, null),
  ('Basketball module data population', 'Basketball-specific line items', 'Sports Dashboard', 'medium', 'pending', '/fsp/sports/basketball', 210, null),
  ('World Pong module data population', 'Entertainment-format line items', 'Sports Dashboard', 'low', 'pending', '/fsp/sports/world_pong', 220, null),
  ('Foundation Events module', 'Non-profit structure: donations, grants, charitable costs', 'Sports Dashboard', 'low', 'pending', '/fsp/sports/foundation', 240, null)
on conflict do nothing;
