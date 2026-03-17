export const databaseMetadata = {
  databaseTarget: "Postgres-compatible",
  deploymentTarget: "Neon",
  migrationFiles: ["sql/001_initial_schema.sql", "sql/002_derived_views.sql"],
  canonicalLayers: ["raw", "canonical", "derived", "application"]
} as const;

export const requiredEnvironmentVariables = [
  "DATABASE_URL"
] as const;
