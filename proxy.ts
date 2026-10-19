import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: sends people without a session cookie to sign in.
 * Every page and action still verifies the session on the server.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/overview", "/expenses/:path*", "/cards/:path*", "/categories/:path*", "/insights/:path*", "/import/:path*", "/settings/:path*"],
};
