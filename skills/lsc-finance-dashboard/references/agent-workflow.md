# Agent Workflow

## Coordinator First

Treat the main agent as a coordinator, not a do-everything worker.

The coordinator must:

- read the repo rules
- identify the correct specialist
- sequence work
- prevent ontology drift
- prevent metric inconsistency

## Specialist Pattern

Use specialist lenses when reasoning:

- finance architect for metric definitions and finance logic
- ontology architect for entities and relationships
- schema engineer for database work
- import engineer for source mapping
- app engineer for APIs and services
- frontend experience agent for visual system, information architecture, and workflow usability
- QA debug agent for validation
- AI analysis agent for summaries and anomaly detection

## Example Task Routing

If the task is "add race-wise TBR expense view":

1. finance architect confirms which cost buckets matter
2. ontology architect confirms how race events and expenses connect
3. schema engineer updates views
4. app engineer exposes the data
5. frontend experience agent builds the drill-down, filters, and operator workflow
6. QA debug agent verifies totals and filters

## Rule

Do not allow a specialist to redefine shared business concepts without updating the planning docs.
