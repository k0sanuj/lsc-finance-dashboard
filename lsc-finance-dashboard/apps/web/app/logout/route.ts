import { NextResponse } from "next/server";
import { logoutCurrentUser } from "../../lib/auth";

export async function POST(request: Request) {
  await logoutCurrentUser();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}
