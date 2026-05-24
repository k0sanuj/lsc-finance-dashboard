import { NextResponse, type NextRequest } from "next/server";
import { consumeMagicLinkToken, createSessionCookie } from "../../../lib/auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const result = await consumeMagicLinkToken(token);

  if (!result.ok) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", result.error);
    return NextResponse.redirect(loginUrl);
  }

  const sessionCookie = await createSessionCookie(result.user);
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);
  return response;
}
