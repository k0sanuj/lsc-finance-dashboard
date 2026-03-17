import { requiredEnvironmentVariables } from "./metadata";

const DEFAULT_APP_READ_ROLE = "lsc_app_read";
const DEFAULT_IMPORT_ROLE = "lsc_import_rw";

function getBaseAdminUrl() {
  const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      `DATABASE_URL_ADMIN or DATABASE_URL is not set. Add one of them to your local environment before connecting to Neon or another Postgres database. Required env vars: ${requiredEnvironmentVariables.join(
        ", "
      )}`
    );
  }

  return url;
}

function deriveRoleUrl(baseUrl: string, roleName: string, password: string) {
  const url = new URL(baseUrl);
  url.username = roleName;
  url.password = password;
  return url.toString();
}

export function getAdminDatabaseUrl() {
  return getBaseAdminUrl();
}

export function getReadDatabaseUrl() {
  if (process.env.DATABASE_URL_APP_READ) {
    return process.env.DATABASE_URL_APP_READ;
  }

  const password = process.env.LSC_APP_READ_PASSWORD;

  if (!password) {
    return getBaseAdminUrl();
  }

  const roleName = process.env.LSC_APP_READ_ROLE ?? DEFAULT_APP_READ_ROLE;
  return deriveRoleUrl(getBaseAdminUrl(), roleName, password);
}

export function getImportDatabaseUrl() {
  if (process.env.DATABASE_URL_IMPORT) {
    return process.env.DATABASE_URL_IMPORT;
  }

  const password = process.env.LSC_IMPORT_RW_PASSWORD;

  if (!password) {
    return getBaseAdminUrl();
  }

  const roleName = process.env.LSC_IMPORT_RW_ROLE ?? DEFAULT_IMPORT_ROLE;
  return deriveRoleUrl(getBaseAdminUrl(), roleName, password);
}

export function getDatabaseUrl() {
  return getReadDatabaseUrl();
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL);
}
