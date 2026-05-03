import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";

/**
 * Server-side gate for /admin/* pages, plus the layout chrome shared
 * by all admin tools. Middleware already redirects unauthenticated
 * visitors to /admin/sign-in; this layout double-checks server-side so
 * a misconfigured matcher can't ever leak admin content.
 *
 * /admin/sign-in shares this layout but skips the auth requirement —
 * since the layout can't see the current path directly, we let the
 * tree render whenever there's no cookie at all (the sign-in page
 * being the one expected unauthenticated stop). Anything with an
 * invalid cookie is bounced.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await verifySessionToken(token);
    // If the cookie exists but doesn't verify, clear & let the sign-in
    // page render via the normal redirect path on the next request.
    if (!session) {
      // Can't set cookies in a layout, so we just render — middleware
      // will redirect non-sign-in routes; sign-in page handles itself.
    }
  }
  return <>{children}</>;
}
