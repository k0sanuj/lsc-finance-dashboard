-- 022: Seed V2 agent nodes and edges

insert into agent_nodes (id, name, role, tier, parent_agent_id, status, current_task, position_x, position_y)
values
  ('vendor-agent', 'Vendor Agent', 'Vendor & Partner Mgmt', 'specialist', 'finance-overlord', 'active', 'Tracking vendor spend', 100, 550),
  ('subscription-agent', 'Subscription Agent', 'SaaS Tracking', 'specialist', 'finance-overlord', 'active', 'Monitoring renewals', 250, 550),
  ('payroll-agent', 'Payroll Agent', 'Payroll & Employees', 'specialist', 'finance-overlord', 'active', 'Managing salary payroll', 400, 550),
  ('cap-table-agent', 'Cap Table Agent', 'Equity & Ownership', 'specialist', 'finance-overlord', 'active', 'Tracking cap table', 550, 550),
  ('litigation-agent', 'Litigation Agent', 'Legal Finance', 'specialist', 'finance-overlord', 'active', 'Tracking litigation costs', 700, 550),
  ('gig-worker-agent', 'Gig Worker Agent', 'Gig Payouts', 'specialist', 'finance-overlord', 'active', 'Processing gig payouts', 100, 650),
  ('tax-agent', 'Tax Agent', 'Tax & Filing', 'specialist', 'finance-overlord', 'active', 'Calculating GST/VAT', 250, 650),
  ('audit-agent', 'Audit Agent', 'Monthly Audit', 'specialist', 'finance-overlord', 'active', 'Running reconciliation', 400, 650),
  ('cross-dashboard-agent', 'Cross-Dashboard Agent', 'Legal ↔ Finance', 'specialist', 'finance-overlord', 'active', 'Syncing cross-dashboard messages', 550, 650)
on conflict (id) do update
set name = excluded.name,
    role = excluded.role,
    status = excluded.status,
    current_task = excluded.current_task,
    position_x = excluded.position_x,
    position_y = excluded.position_y,
    updated_at = now();

insert into agent_edges (id, from_agent_id, to_agent_id, interaction_type, directionality, is_active)
values
  ('v2-e1', 'finance-overlord', 'vendor-agent', 'routes_to', 'directed', true),
  ('v2-e2', 'finance-overlord', 'subscription-agent', 'routes_to', 'directed', true),
  ('v2-e3', 'finance-overlord', 'payroll-agent', 'routes_to', 'directed', true),
  ('v2-e4', 'finance-overlord', 'cap-table-agent', 'routes_to', 'directed', true),
  ('v2-e5', 'finance-overlord', 'litigation-agent', 'routes_to', 'directed', true),
  ('v2-e6', 'finance-overlord', 'gig-worker-agent', 'routes_to', 'directed', true),
  ('v2-e7', 'finance-overlord', 'tax-agent', 'routes_to', 'directed', true),
  ('v2-e8', 'finance-overlord', 'audit-agent', 'routes_to', 'directed', true),
  ('v2-e9', 'finance-overlord', 'cross-dashboard-agent', 'routes_to', 'directed', true),
  ('v2-e10', 'payroll-agent', 'tax-agent', 'talks_to', 'directed', true),
  ('v2-e11', 'cap-table-agent', 'cross-dashboard-agent', 'talks_to', 'directed', true),
  ('v2-e12', 'litigation-agent', 'cross-dashboard-agent', 'talks_to', 'directed', true),
  ('v2-e13', 'gig-worker-agent', 'payroll-agent', 'talks_to', 'directed', true),
  ('v2-e14', 'audit-agent', 'finance-architect', 'talks_to', 'directed', true),
  ('v2-e15', 'vendor-agent', 'finance-architect', 'talks_to', 'directed', true)
on conflict (id) do update
set from_agent_id = excluded.from_agent_id,
    to_agent_id = excluded.to_agent_id,
    interaction_type = excluded.interaction_type;
