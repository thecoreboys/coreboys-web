"use client";

import { SignOutButton as ClerkSignOutButton } from "@clerk/nextjs";

/**
 * Admin auth used to be a localStorage passcode stub. The real gate
 * now lives in two places that run BEFORE this component renders:
 *
 *   - middleware.ts forces sign-in via Clerk for any /admin/* route
 *   - app/admin/layout.tsx checks the user email against the
 *     comma-separated ADMIN_EMAILS env var and shows a 403 page
 *     when the signed-in account isn't on the allowlist
 *
 * So this component is now a passthrough — kept around so the many
 * admin pages that wrap their JSX in <AuthGate> don't all need edits.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SignOutButton() {
  return (
    <ClerkSignOutButton redirectUrl="/">
      <button
        type="button"
        className="text-[12px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)] cursor-pointer"
      >
        Sign out
      </button>
    </ClerkSignOutButton>
  );
}
