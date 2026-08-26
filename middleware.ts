import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/admin-auth";
import {
  SITE_ACCESS_COOKIE,
  siteAccessGateEnabled,
  verifySiteAccessToken,
} from "@/lib/site-access";

/**
 * Edge middleware for the private production preview and the separate admin
 * session. Signed integration webhooks stay reachable so provider deliveries
 * can continue while the human-facing app is gated.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};

const TRUSTED_INTEGRATION_PATHS = [
  "/api/account/billing/webhook",
  "/api/postcard/webhook",
  "/api/social/webhooks/",
] as const;

function withPathHeader(req: NextRequest, accessPage = false): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-coreboys-pathname", req.nextUrl.pathname);
  if (accessPage) requestHeaders.set("x-coreboys-access-page", "1");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (siteAccessGateEnabled()) {
    const integration = TRUSTED_INTEGRATION_PATHS.some((path) => (
      path.endsWith("/") ? pathname.startsWith(path) : pathname === path
    ));
    const verificationRoute = pathname === "/api/access/verify";
    if (!integration && !verificationRoute) {
      const admitted = await verifySiteAccessToken(req.cookies.get(SITE_ACCESS_COOKIE)?.value);
      if (pathname === "/access") {
        if (admitted) {
          const requested = req.nextUrl.searchParams.get("next");
          const destination = requested?.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/access")
            ? requested
            : "/";
          return NextResponse.redirect(new URL(destination, req.url));
        }
        return withPathHeader(req, true);
      }
      if (!admitted) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "preview_access_required" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        }
        const url = new URL("/access", req.url);
        url.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
        return NextResponse.redirect(url);
      }
    }
  }

  if (!pathname.startsWith("/admin") && !pathname.startsWith("/studio")) {
    return withPathHeader(req);
  }
  if (pathname === "/admin/sign-in") {
    return withPathHeader(req);
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
  const requested = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  url.searchParams.set("next", requested);
  return NextResponse.redirect(url);
}
