import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Edge middleware. Forces sign-in on /admin/*. The actual email
 * allowlist check happens in app/admin/layout.tsx (server component)
 * so we can read the user record without burning extra Clerk API
 * calls on every request — middleware only verifies "signed in".
 *
 * Public routes (everything else) pass through untouched.
 */
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isAdminRoute(req)) return;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }
});

export const config = {
  // Skip Next internals + static files. Match everything else.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|woff|woff2|ttf)).*)",
    "/(api|trpc)(.*)",
  ],
};
