import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { hashPassword, verifyPassword } from "./password";
import { AUTH_COOKIE_NAME, createSessionToken, verifySessionToken, type SessionPayload } from "./session";

export type AppUserRole =
  | "super_admin"
  | "finance_admin"
  | "team_member"
  | "commercial_user"
  | "viewer";

export type SessionUser = {
  id: string;
  email: string;
  role: AppUserRole;
  fullName: string;
};

type AppUserRow = {
  id: string;
  full_name: string;
  email: string;
  role: AppUserRole;
  password_hash: string;
  is_active: boolean;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is not set. Add it to .env.local before using auth.");
  }

  return secret;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function logAuthEvent(
  appUserId: string | null,
  eventType: string,
  eventStatus: string,
  metadata: Record<string, unknown> = {}
) {
  const requestHeaders = await headers();

  await executeAdmin(
    `insert into auth_access_events (
      app_user_id,
      event_type,
      event_status,
      ip_address,
      user_agent,
      metadata
    )
    values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      appUserId,
      eventType,
      eventStatus,
      requestHeaders.get("x-forwarded-for") ?? null,
      requestHeaders.get("user-agent") ?? null,
      JSON.stringify(metadata)
    ]
  );
}

function toSessionUser(payload: SessionPayload): SessionUser {
  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role as AppUserRole,
    fullName: payload.name
  };
}

async function createSignedSession(user: SessionUser) {
  const token = await createSessionToken(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.fullName,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    },
    getAuthSecret()
  );

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearSignedSession() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

export async function getOptionalSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = await verifySessionToken(token, getAuthSecret());

  if (!payload) {
    return null;
  }

  return toSessionUser(payload);
}

export async function requireSession() {
  const session = await getOptionalSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireRole(roles: AppUserRole[]) {
  const session = await requireSession();

  if (!roles.includes(session.role)) {
    redirect("/");
  }

  return session;
}

export async function authenticateWithPassword(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const users = await queryRowsAdmin<AppUserRow>(
    `select id, full_name, email, role, password_hash, is_active
     from app_users
     where normalized_email = $1
     limit 1`,
    [normalizedEmail]
  );

  const user = users[0];

  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    await logAuthEvent(user?.id ?? null, "login", "failed", { email: normalizedEmail });
    return { ok: false as const, error: "Invalid email or password." };
  }

  await executeAdmin(`update app_users set last_login_at = now(), updated_at = now() where id = $1`, [
    user.id
  ]);

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name
  };

  await createSignedSession(sessionUser);
  await logAuthEvent(user.id, "login", "success", { role: user.role });

  return { ok: true as const, user: sessionUser };
}

export async function logoutCurrentUser() {
  const session = await getOptionalSession();
  await clearSignedSession();
  await logAuthEvent(session?.id ?? null, "logout", "success");
}

export async function bootstrapAdminUser(
  email: string,
  fullName: string,
  password: string,
  role: AppUserRole = "super_admin"
) {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = hashPassword(password);

  const rows = await queryRowsAdmin<{ id: string }>(
    `insert into app_users (full_name, email, normalized_email, role, password_hash)
     values ($1, $2, $3, $4, $5)
     on conflict (normalized_email) do update
       set full_name = excluded.full_name,
           email = excluded.email,
           role = excluded.role,
           password_hash = excluded.password_hash,
           is_active = true,
           updated_at = now()
     returning id`,
    [fullName, email, normalizedEmail, role, passwordHash]
  );

  const companies = await queryRowsAdmin<{ id: string }>(`select id from companies where code = 'TBR'`);
  const companyId = companies[0]?.id ?? null;

  if (companyId) {
    await executeAdmin(
      `insert into app_user_company_access (app_user_id, company_id, access_role, is_primary)
       values ($1, $2, $3, true)
       on conflict (app_user_id, company_id) do update
         set access_role = excluded.access_role,
             is_primary = true`,
      [rows[0].id, companyId, role]
    );
  }

  await logAuthEvent(rows[0].id, "bootstrap_admin", "success", { email: normalizedEmail, role });
}
