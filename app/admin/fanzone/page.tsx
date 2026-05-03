import type { Metadata } from "next";
import Link from "next/link";
import { AuthGate } from "@/components/admin/AuthGate";

export const metadata: Metadata = {
  title: "Admin · Fanzone review",
  robots: { index: false, follow: false },
};

export default function AdminFanzonePage() {
  return (
    <AuthGate>
      <main className="relative pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
          >
            ← Admin
          </Link>
          <p className="mt-2 eyebrow">Admin · Fanzone review</p>
          <h1 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
            Fan-wall submissions.
          </h1>
          <p className="mt-2 max-w-[60ch] text-[14px] text-[color:var(--ink-dim)]">
            Approve fan-submitted photos for the public Fan Wall, or deny with a
            reason. Items here come from the <code className="font-mono">/fanzone</code>{" "}
            submit form.
          </p>
        </section>

        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
            <div className="rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)]/60 p-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
                Pipeline not yet wired
              </p>
              <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
                The fanzone submit form currently writes to localStorage so
                there&apos;s nothing real to review yet. The next pass adds a{" "}
                <code className="font-mono">fan_submissions</code> table, pushes new
                uploads into Spaces, and surfaces them here as approve / deny
                cards. Until then this page is a placeholder.
              </p>
            </div>
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
