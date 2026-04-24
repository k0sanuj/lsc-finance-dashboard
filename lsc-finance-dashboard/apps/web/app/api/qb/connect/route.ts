import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireRole } from "../../../../lib/auth";
import { buildAuthorizeUrl } from "@lsc/skills/shared/quickbooks";

/**
 * Start the QuickBooks OAuth 2.0 flow. Admin-only.
 *
 * We generate a random CSRF `state` token, set it as a short-lived
 * httpOnly cookie, and include the same token in the authorize URL.
 * The /callback route verifies the cookie equals the returned state
 * before exchanging the code — protects against CSRF + replay.
 */
export async function GET() {
  await requireRole(["super_admin", "finance_admin"]);

  const state = crypto.randomBytes(24).toString("base64url");
  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL(
        `/qb?status=error&message=${encodeURIComponent(message)}`,
        process.env.PUBLIC_APP_URL ?? "http://localhost:3000"
      )
    );
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("qb_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/qb",
    maxAge: 600, // 10 minutes to complete the consent flow
  });
  return response;
}
