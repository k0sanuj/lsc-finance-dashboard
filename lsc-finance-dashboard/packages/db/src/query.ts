import "server-only";

import { Pool, type QueryResultRow } from "pg";
import { getAdminDatabaseUrl, getReadDatabaseUrl } from "./connection";

declare global {
  // eslint-disable-next-line no-var
  var __lscPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __lscPgAdminPool: Pool | undefined;
}

function createPool(connectionString: string) {
  return new Pool({
    connectionString,
    allowExitOnIdle: true,
    max: 5
  });
}

export function getPool() {
  if (!globalThis.__lscPgPool) {
    globalThis.__lscPgPool = createPool(getReadDatabaseUrl());
  }

  return globalThis.__lscPgPool;
}

export function getAdminPool() {
  if (!globalThis.__lscPgAdminPool) {
    globalThis.__lscPgAdminPool = createPool(getAdminDatabaseUrl());
  }

  return globalThis.__lscPgAdminPool;
}

export async function queryRows<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  const pool = getPool();
  const result = await pool.query<T>(text, values);
  return result.rows;
}

export async function queryRowsAdmin<T extends QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  const pool = getAdminPool();
  const result = await pool.query<T>(text, values);
  return result.rows;
}

export async function executeAdmin(text: string, values: unknown[] = []) {
  const pool = getAdminPool();
  return pool.query(text, values);
}
