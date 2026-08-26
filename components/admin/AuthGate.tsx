"use client";

import { useRouter } from "next/navigation";
import { LogOut01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";

/**
 * Admin auth flows live in three places that run BEFORE this component
 * renders:
 *
 *   - middleware.ts verifies the `coreboys-admin-session` cookie for
 *     any /admin/* request and redirects to /admin/sign-in when it's
 *     missing or invalid.
 *   - app/admin/layout.tsx double-checks server-side.
 *   - /api/admin/login bcrypt-compares against admin_users in Postgres
 *     and sets the cookie.
 *
 * So <AuthGate> stays as a passthrough — kept so the many admin pages
 * that wrap their JSX in it don't all need edits.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SignOutButton() {
  const router = useRouter();
  async function onClick() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    router.replace("/admin/sign-in");
    router.refresh();
  }
  return (
    <Button type="button" onClick={onClick} size="md" color="secondary" iconLeading={LogOut01}>
      Sign out
    </Button>
  );
}
