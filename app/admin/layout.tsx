import Link from "next/link";
import { notFound } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";

/**
 * Server-side gate for the entire /admin tree. Middleware ensures the
 * viewer is signed in via Clerk; this layout enforces the additional
 * "is the email on our allowlist" rule.
 *
 * Allowlist comes from the comma-separated `ADMIN_EMAILS` env var.
 * Anyone signed in but not in the list gets a 403 page.
 */
const ALLOWED_ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function emailOf(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): string | null {
  const primaryId = user.primaryEmailAddressId;
  const primary = user.emailAddresses.find((e) => e.id === primaryId);
  return primary?.emailAddress?.toLowerCase() ?? null;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) {
    // Middleware should have redirected to Clerk's hosted sign-in
    // before this layout ever runs. Defensive fallback in case
    // someone bypasses middleware (e.g. internal route ops).
    notFound();
  }

  const email = emailOf(user);
  if (!email || !ALLOWED_ADMIN_EMAILS.includes(email)) {
    return (
      <ClerkProvider>
        <main className="relative flex min-h-screen items-center justify-center px-6 pt-24">
          <div className="max-w-[480px] rounded-xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
            <h1 className="text-[22px] font-bold tracking-tight text-[color:var(--ink)]">
              Not authorized
            </h1>
            <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
              You&apos;re signed in as <strong>{email ?? "(no email on file)"}</strong>, but that
              account isn&apos;t on the admin allowlist for this site.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-4 py-2 text-[13px] font-medium text-[color:var(--ink)] hover:border-[color:var(--rule-strong)]"
            >
              ← Back to site
            </Link>
          </div>
        </main>
      </ClerkProvider>
    );
  }

  return <ClerkProvider>{children}</ClerkProvider>;
}
