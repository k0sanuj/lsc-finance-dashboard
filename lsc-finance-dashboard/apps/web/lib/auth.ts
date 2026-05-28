import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin, withAdminTransaction } from "@lsc/db";
import { hashPassword, verifyPassword } from "./password";
import { AUTH_COOKIE_NAME, createSessionToken, verifySessionToken, type SessionPayload } from "./session";
import { sendMagicLinkEmail } from "./magic-link-email";

export type AppUserRole =
  | "super_admin"
  | "finance_admin"
  | "team_member"
  | "expense_submitter"
  | "commercial_user"
  | "viewer";

export type SessionUser = {
  id: string;
  email: string;
  role: AppUserRole;
  fullName: string;
};

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const MAGIC_LINK_TTL_SECONDS = 60 * 15;

type AppUserRow = {
  id: string;
  full_name: string;
  email: string;
  role: AppUserRole;
  password_hash: string;
  is_active: boolean;
};

type AllowedIdentityRow = {
  normalized_email: string;
  email: string;
  full_name: string;
  role: AppUserRole;
  is_active: boolean;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is not set. Add it to .env.local before using auth.");
  }

  return secret;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  };
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
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
    },
    getAuthSecret()
  );

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, sessionCookieOptions());
}

export async function createSessionCookie(user: SessionUser) {
  const token = await createSessionToken(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.fullName,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
    },
    getAuthSecret()
  );

  return {
    name: AUTH_COOKIE_NAME,
    value: token,
    options: sessionCookieOptions()
  };
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

  const rows = await queryRowsAdmin<{ id: string }>(
    `select u.id
     from app_users u
     join auth_allowed_identities ai on ai.normalized_email = u.normalized_email
     where u.id = $1
       and u.normalized_email = $2
       and u.is_active = true
       and ai.is_active = true
     limit 1`,
    [payload.sub, normalizeEmail(payload.email)]
  );

  if (!rows[0]) {
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

export async function hasFeatureAccess(appUserId: string, featureKey: string) {
  const rows = await queryRowsAdmin<{ id: string }>(
    `select id
     from app_user_feature_access
     where app_user_id = $1
       and feature_key = $2
       and is_active = true
     limit 1`,
    [appUserId, featureKey]
  );

  return Boolean(rows[0]);
}

export async function requireTbrExpensePortalAccess() {
  const session = await requireRole([
    "super_admin",
    "finance_admin",
    "team_member",
    "expense_submitter",
  ]);

  if (session.role === "expense_submitter") {
    const allowed = await hasFeatureAccess(session.id, "tbr_expense_submitter");
    if (!allowed) {
      redirect("/");
    }
  }

  return session;
}

async function getAllowedIdentity(normalizedEmail: string) {
  const rows = await queryRowsAdmin<AllowedIdentityRow>(
    `select normalized_email, email, full_name, role, is_active
     from auth_allowed_identities
     where normalized_email = $1
     limit 1`,
    [normalizedEmail]
  );

  const identity = rows[0];
  return identity && identity.is_active ? identity : null;
}

async function ensureAppUserForIdentity(identity: AllowedIdentityRow) {
  const placeholderPassword = hashPassword(`magic-link-only:${randomBytes(32).toString("hex")}`);
  const rows = await queryRowsAdmin<AppUserRow>(
    `insert into app_users (full_name, email, normalized_email, role, password_hash, is_active, metadata)
     values ($1, $2, $3, $4, $5, true, jsonb_build_object('auth_source', 'allowlist_magic_link'))
     on conflict (normalized_email) do update
       set full_name = excluded.full_name,
           email = excluded.email,
           role = excluded.role,
           is_active = true,
           updated_at = now(),
           metadata = app_users.metadata || jsonb_build_object('auth_source', 'allowlist_magic_link')
     returning id, full_name, email, role, password_hash, is_active`,
    [
      identity.full_name,
      identity.email,
      identity.normalized_email,
      identity.role,
      placeholderPassword
    ]
  );

  return rows[0];
}

function buildBaseUrl(requestHeaders: Headers) {
  const origin = requestHeaders.get("origin");
  if (origin) return origin;

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export async function authenticateWithPassword(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const allowedIdentity = await getAllowedIdentity(normalizedEmail);

  if (!allowedIdentity) {
    await logAuthEvent(null, "password_login", "denied_not_allowlisted", { email: normalizedEmail });
    return { ok: false as const, error: "Invalid email or password." };
  }

  const users = await queryRowsAdmin<AppUserRow>(
    `select id, full_name, email, role, password_hash, is_active
     from app_users
     where normalized_email = $1
     limit 1`,
    [normalizedEmail]
  );

  const user = users[0];

  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    await logAuthEvent(user?.id ?? null, "password_login", "failed", { email: normalizedEmail });
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
  await executeAdmin(
    `update auth_allowed_identities set last_allowed_login_at = now(), updated_at = now() where normalized_email = $1`,
    [normalizedEmail]
  );
  await logAuthEvent(user.id, "password_login", "success", { role: user.role });

  return { ok: true as const, user: sessionUser };
}

export async function requestMagicLink(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const requestHeaders = await headers();
  const allowedIdentity = await getAllowedIdentity(normalizedEmail);

  if (!allowedIdentity) {
    await logAuthEvent(null, "magic_link_request", "denied_not_allowlisted", {
      email: normalizedEmail
    });
    return { ok: true as const, sent: false, devMagicLink: null };
  }

  const user = await ensureAppUserForIdentity(allowedIdentity);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const baseUrl = buildBaseUrl(requestHeaders);
  const magicLink = `${baseUrl}/login/magic?token=${encodeURIComponent(rawToken)}`;

  await executeAdmin(
    `insert into auth_magic_links (
      app_user_id,
      normalized_email,
      token_hash,
      requested_ip,
      user_agent,
      expires_at,
      metadata
    )
    values ($1, $2, $3, $4, $5, now() + ($6::int * interval '1 second'), $7::jsonb)`,
    [
      user.id,
      normalizedEmail,
      tokenHash,
      requestHeaders.get("x-forwarded-for") ?? null,
      requestHeaders.get("user-agent") ?? null,
      MAGIC_LINK_TTL_SECONDS,
      JSON.stringify({ baseUrl })
    ]
  );

  const emailResult = await sendMagicLinkEmail({
    to: allowedIdentity.email,
    fullName: allowedIdentity.full_name,
    magicLink
  });

  await logAuthEvent(user.id, "magic_link_request", emailResult.sent ? "sent" : "created_not_sent", {
    email: normalizedEmail,
    provider: emailResult.provider,
    reason: emailResult.sent ? null : emailResult.reason
  });

  return {
    ok: true as const,
    sent: emailResult.sent,
    devMagicLink:
      !emailResult.sent && process.env.NODE_ENV !== "production" ? magicLink : null
  };
}

export async function consumeMagicLinkToken(rawToken: string) {
  if (!rawToken || rawToken.length < 20) {
    await logAuthEvent(null, "magic_link_login", "invalid_token");
    return { ok: false as const, error: "This sign-in link is invalid or expired." };
  }

  const tokenHash = hashToken(rawToken);

  return withAdminTransaction(async () => {
    const rows = await queryRowsAdmin<{
      id: string;
      app_user_id: string | null;
      normalized_email: string;
      expires_at: Date;
      consumed_at: Date | null;
      revoked_at: Date | null;
      allowed_email: string | null;
      allowed_full_name: string | null;
      allowed_role: AppUserRole | null;
      allowed_active: boolean | null;
    }>(
      `select ml.id,
              ml.app_user_id,
              ml.normalized_email,
              ml.expires_at,
              ml.consumed_at,
              ml.revoked_at,
              ai.email as allowed_email,
              ai.full_name as allowed_full_name,
              ai.role as allowed_role,
              ai.is_active as allowed_active
       from auth_magic_links ml
       left join auth_allowed_identities ai on ai.normalized_email = ml.normalized_email
       where ml.token_hash = $1
       limit 1
       for update of ml`,
      [tokenHash]
    );

    const link = rows[0];

    if (
      !link ||
      link.consumed_at ||
      link.revoked_at ||
      !link.allowed_active ||
      new Date(link.expires_at).getTime() <= Date.now()
    ) {
      await logAuthEvent(link?.app_user_id ?? null, "magic_link_login", "invalid_or_expired", {
        normalizedEmail: link?.normalized_email ?? null
      });
      return { ok: false as const, error: "This sign-in link is invalid or expired." };
    }

    const user = await ensureAppUserForIdentity({
      normalized_email: link.normalized_email,
      email: link.allowed_email ?? link.normalized_email,
      full_name: link.allowed_full_name ?? link.normalized_email,
      role: link.allowed_role ?? "viewer",
      is_active: true
    });

    await executeAdmin(
      `update auth_magic_links
       set consumed_at = now(),
           app_user_id = $2
       where id = $1`,
      [link.id, user.id]
    );

    await executeAdmin(
      `update app_users set last_login_at = now(), updated_at = now() where id = $1`,
      [user.id]
    );

    await executeAdmin(
      `update auth_allowed_identities
       set last_allowed_login_at = now(), updated_at = now()
       where normalized_email = $1`,
      [link.normalized_email]
    );

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name
    };

    await logAuthEvent(user.id, "magic_link_login", "success", { role: user.role });

    return { ok: true as const, user: sessionUser };
  });
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

  await executeAdmin(
    `insert into auth_allowed_identities (normalized_email, email, full_name, role, is_active, metadata)
     values ($1, $2, $3, $4, true, jsonb_build_object('source', 'bootstrap_admin'))
     on conflict (normalized_email) do update
       set email = excluded.email,
           full_name = excluded.full_name,
           role = excluded.role,
           is_active = true,
           updated_at = now(),
           metadata = auth_allowed_identities.metadata || excluded.metadata`,
    [normalizedEmail, email, fullName, role]
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
