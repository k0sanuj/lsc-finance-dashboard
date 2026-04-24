import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession } from "../../../../lib/auth";
import {
  encryptToken,
  exchangeAuthCode,
  getCompanyInfo,
  qbEnvironment,
} from "@lsc/skills/shared/quickbooks";
import { upsertQbConnection } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";

function redirectTo(status: "success" | "error", message: string) {
  const base = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL("/qb", base);
  url.searchParams.set("status", status);
  url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

/**
 * Intuit redirects the browser here after the user authorizes our app.
 * Query string carries: code, realmId, state. We verify state against
 * the cookie set in /connect, exchange the code for tokens, pull
 * company info, and upsert the connection row.
 */
export async function GET(request: NextRequest) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectTo("error", `Intuit returned error: ${error}`);
  }
  if (!code || !realmId || !state) {
    return redirectTo(
      "error",
      "Intuit callback was missing code, realmId, or state."
    );
  }

  const stateCookie = request.cookies.get("qb_oauth_state")?.value;
  if (!stateCookie || stateCookie !== state) {
    return redirectTo(
      "error",
      "OAuth state mismatch — possible CSRF. Start over from /qb."
    );
  }

  // Exchange the auth code for tokens
  let tokens;
  try {
    tokens = await exchangeAuthCode(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return redirectTo("error", `Token exchange failed: ${message}`);
  }

  // Sanity check — pull company info so the /qb page can display it
  let companyName: string | null = null;
  try {
    const info = await getCompanyInfo(tokens.access_token, realmId);
    companyName = info.CompanyName ?? info.LegalName ?? null;
  } catch (err) {
    // Non-fatal — we still have a valid token pair; company name stays null
    console.warn(
      `[qb/callback] getCompanyInfo failed: ${err instanceof Error ? err.message : err}`
    );
  }

  const accessEnc = encryptToken(tokens.access_token);
  const refreshEnc = encryptToken(tokens.refresh_token);
  const now = Date.now();
  const accessExpiresAt = new Date(now + tokens.expires_in * 1000).toISOString();
  const refreshExpiresAt = new Date(
    now + tokens.x_refresh_token_expires_in * 1000
  ).toISOString();

  let connectionId: string;
  try {
    connectionId = await upsertQbConnection({
      realmId,
      environment: qbEnvironment(),
      companyName,
      appId: process.env.QUICKBOOKS_APP_ID ?? null,
      connectedByUserId: session.id,
      accessToken: {
        ciphertext: accessEnc.ciphertext,
        iv: accessEnc.iv,
        authTag: accessEnc.authTag,
        expiresAtIso: accessExpiresAt,
      },
      refreshToken: {
        ciphertext: refreshEnc.ciphertext,
        iv: refreshEnc.iv,
        authTag: refreshEnc.authTag,
        expiresAtIso: refreshExpiresAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return redirectTo("error", `Storing connection failed: ${message}`);
  }

  // Audit
  try {
    await cascadeUpdate({
      trigger: "qb-connection:connected",
      entityType: "qb_connection",
      entityId: connectionId,
      action: "connect",
      after: {
        realmId,
        environment: qbEnvironment(),
        companyName,
      },
      performedBy: session.id,
      agentId: "quickbooks-agent",
    });
  } catch {
    // Audit is best-effort; don't fail the flow if the cascade trigger
    // isn't registered yet.
  }

  const response = redirectTo(
    "success",
    companyName
      ? `Connected to ${companyName}.`
      : `Connected to realm ${realmId}.`
  );
  response.cookies.delete("qb_oauth_state");
  return response;
}
