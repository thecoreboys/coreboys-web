import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/admin-auth";

/**
 * Edge middleware. Custom admin auth (Clerk previously). Verifies the
 * `coreboys-admin-session` cookie on every /admin/* request and
 * redirects unauthenticated visitors to /admin/sign-in. The sign-in
 * page itself is allow-listed so the redirect doesn't loop.
 */
export const config = {
  matcher: ["/admin/:path*"],
};

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/sign-in" || pathname.startsWith("/api/admin/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return redirectToSignIn(req);
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return redirectToSignIn(req);
  }
  return NextResponse.next();
}

function redirectToSignIn(req: NextRequest): NextResponse {
  const url = new URL("/admin/sign-in", req.url);
  return NextResponse.redirect(url);
}
