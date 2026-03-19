import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "./lib/session";

const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret) {
    // Auth secret is required — redirect to login with error
    if (!isPublicPath(pathname)) {
      console.error("[middleware] AUTH_SESSION_SECRET is not configured. Authentication disabled is not allowed.");
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "Auth is not configured. Contact your administrator.");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  const session = token ? await verifySessionToken(token, secret) : null;

  if (isPublicPath(pathname)) {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"]
};
