insert into companies (code, name)
values
  ('LSC', 'League Sports Co'),
  ('TBR', 'Team Blue Rising'),
  ('FSP', 'Future of Sports')
on conflict (code) do update
set name = excluded.name,
    updated_at = now();

insert into owners (company_id, name, role)
select c.id, seed.name, seed.role
from companies c
join (
  values
    ('LSC', 'Finance Overlord', 'Coordinator'),
    ('TBR', 'Partner One', 'Commercial Owner'),
    ('TBR', 'Partner Two', 'Commercial Owner')
) as seed(company_code, name, role)
  on seed.company_code = c.code::text
where not exists (
  select 1
  from owners o
  where o.company_id = c.id
    and o.name = seed.name
);

insert into race_events (company_id, code, name, location, season_year)
select c.id, seed.code, seed.name, seed.location, 2026
from companies c
join (
  values
    ('TBR', 'JED', 'Jeddah', 'Saudi Arabia'),
    ('TBR', 'DOH', 'Doha', 'Qatar')
) as seed(company_code, code, name, location)
  on seed.company_code = c.code::text
on conflict (company_id, code) do update
set name = excluded.name,
    location = excluded.location,
    updated_at = now();

insert into cost_categories (company_id, code, name, category_scope)
select c.id, seed.code, seed.name, seed.category_scope
from companies c
join (
  values
    ('TBR', 'LICENSING_FEE', 'Licensing Fee', 'race'),
    ('TBR', 'CATERING', 'Catering', 'race'),
    ('TBR', 'TRAVEL', 'Travel', 'race'),
    ('TBR', 'VISA', 'Visa', 'race'),
    ('TBR', 'VIP_PASSES', 'VIP Passes', 'race'),
    ('TBR', 'FOIL_DAMAGE', 'Foil Damage', 'race'),
    ('TBR', 'EQUIPMENT', 'Equipment', 'shared'),
    ('FSP', 'HOSTING', 'Hosting', 'shared'),
    ('FSP', 'MARKETING', 'Marketing', 'shared'),
    ('FSP', 'SOFTWARE', 'Software', 'shared')
) as seed(company_code, code, name, category_scope)
  on seed.company_code = c.code::text
on conflict (company_id, code) do update
set name = excluded.name,
    category_scope = excluded.category_scope,
    updated_at = now();

insert into agent_nodes (id, name, role, tier, parent_agent_id, status, current_task, position_x, position_y)
values
  ('finance-overlord', 'Finance Overlord', 'Coordinator', 'core', null, 'active', 'Coordinating dashboard build', 420, 260),
  ('finance-architect', 'Finance Architect', 'Metric Logic', 'specialist', 'finance-overlord', 'active', 'Defining KPI logic', 170, 120),
  ('ontology-architect', 'Ontology Architect', 'Canonical Model', 'specialist', 'finance-overlord', 'active', 'Refining entity relationships', 290, 80),
  ('schema-engineer', 'Schema Engineer', 'Neon Schema', 'specialist', 'finance-overlord', 'active', 'Preparing canonical tables', 550, 80),
  ('import-engineer', 'Import Engineer', 'Sheets + Files', 'specialist', 'finance-overlord', 'idle', 'Waiting on source exports', 680, 130),
  ('app-engineer', 'App Engineer', 'APIs + Services', 'specialist', 'finance-overlord', 'active', 'Scaffolding app services', 690, 380),
  ('ui-engineer', 'UI Engineer', 'Dashboard Surfaces', 'specialist', 'finance-overlord', 'active', 'Building graph views', 540, 445),
  ('qa-agent', 'QA Debug Agent', 'Validation', 'specialist', 'finance-overlord', 'idle', 'Awaiting live data checks', 300, 445),
  ('ai-analysis-agent', 'AI Analysis Agent', 'Narrative Layer', 'specialist', 'finance-overlord', 'idle', 'Waiting for derived metrics', 160, 360),
  ('view-builder', 'View Builder', 'Analytics Views', 'subagent', 'schema-engineer', 'active', 'Drafting reporting views', 760, 40),
  ('lineage-mapper', 'Lineage Mapper', 'Raw To Canonical', 'subagent', 'import-engineer', 'idle', 'Waiting on import mappings', 860, 180)
on conflict (id) do update
set name = excluded.name,
    role = excluded.role,
    tier = excluded.tier,
    parent_agent_id = excluded.parent_agent_id,
    status = excluded.status,
    current_task = excluded.current_task,
    position_x = excluded.position_x,
    position_y = excluded.position_y,
    updated_at = now();

insert into agent_edges (id, from_agent_id, to_agent_id, interaction_type, directionality, is_active)
values
  ('e1', 'finance-overlord', 'finance-architect', 'routes_to', 'directed', true),
  ('e2', 'finance-overlord', 'ontology-architect', 'routes_to', 'directed', true),
  ('e3', 'finance-overlord', 'schema-engineer', 'routes_to', 'directed', true),
  ('e4', 'finance-overlord', 'import-engineer', 'routes_to', 'directed', true),
  ('e5', 'finance-overlord', 'app-engineer', 'routes_to', 'directed', true),
  ('e6', 'finance-overlord', 'ui-engineer', 'routes_to', 'directed', true),
  ('e7', 'finance-overlord', 'qa-agent', 'routes_to', 'directed', true),
  ('e8', 'finance-overlord', 'ai-analysis-agent', 'routes_to', 'directed', true),
  ('e9', 'schema-engineer', 'view-builder', 'depends_on', 'directed', true),
  ('e10', 'import-engineer', 'lineage-mapper', 'depends_on', 'directed', true),
  ('e11', 'qa-agent', 'finance-overlord', 'reports_to', 'directed', true),
  ('e12', 'ai-analysis-agent', 'finance-overlord', 'reports_to', 'directed', true),
  ('e13', 'ontology-architect', 'schema-engineer', 'validates', 'directed', true),
  ('e14', 'schema-engineer', 'app-engineer', 'depends_on', 'directed', true),
  ('e15', 'app-engineer', 'ui-engineer', 'depends_on', 'directed', true)
on conflict (id) do update
set from_agent_id = excluded.from_agent_id,
    to_agent_id = excluded.to_agent_id,
    interaction_type = excluded.interaction_type,
    directionality = excluded.directionality,
    is_active = excluded.is_active;

insert into workflow_nodes (id, name, category, sequence_order, status, owner_agent_id)
values
  ('planning', 'Planning', 'core', 1, 'active', 'finance-overlord'),
  ('metrics', 'Metric Definition', 'core', 2, 'active', 'finance-architect'),
  ('ontology', 'Ontology Design', 'core', 3, 'active', 'ontology-architect'),
  ('schema', 'Schema Design', 'core', 4, 'active', 'schema-engineer'),
  ('import', 'Raw Import', 'core', 5, 'pending', 'import-engineer'),
  ('normalization', 'Normalization', 'core', 6, 'pending', 'lineage-mapper'),
  ('canonical', 'Canonical Records', 'core', 7, 'pending', 'schema-engineer'),
  ('analytics', 'Analytics Views', 'core', 8, 'active', 'view-builder'),
  ('services', 'APIs + Services', 'core', 9, 'active', 'app-engineer'),
  ('rendering', 'Dashboard Rendering', 'core', 10, 'active', 'ui-engineer'),
  ('qa', 'QA Validation', 'core', 11, 'pending', 'qa-agent'),
  ('ai', 'AI Interpretation', 'core', 12, 'pending', 'ai-analysis-agent')
on conflict (id) do update
set name = excluded.name,
    category = excluded.category,
    sequence_order = excluded.sequence_order,
    status = excluded.status,
    owner_agent_id = excluded.owner_agent_id,
    updated_at = now();

insert into workflow_edges (id, from_node_id, to_node_id, edge_type)
values
  ('w1', 'planning', 'metrics', 'sequential'),
  ('w2', 'metrics', 'ontology', 'sequential'),
  ('w3', 'ontology', 'schema', 'sequential'),
  ('w4', 'schema', 'import', 'sequential'),
  ('w5', 'import', 'normalization', 'sequential'),
  ('w6', 'normalization', 'canonical', 'sequential'),
  ('w7', 'canonical', 'analytics', 'sequential'),
  ('w8', 'analytics', 'services', 'sequential'),
  ('w9', 'services', 'rendering', 'sequential'),
  ('w10', 'rendering', 'qa', 'sequential'),
  ('w11', 'qa', 'ai', 'sequential')
on conflict (id) do update
set from_node_id = excluded.from_node_id,
    to_node_id = excluded.to_node_id,
    edge_type = excluded.edge_type,
    condition_label = excluded.condition_label;
