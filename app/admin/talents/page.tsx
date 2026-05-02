import type { Metadata } from "next";
import Link from "next/link";
import { AuthGate } from "@/components/admin/AuthGate";
import { TalentManager } from "@/components/admin/TalentManager";

export const metadata: Metadata = {
  title: "Admin · Talents",
  robots: { index: false, follow: false },
};

export default function AdminTalentsPage() {
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
          <p className="mt-2 eyebrow">Admin · Talents</p>
          <h1 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
            Talent directory.
          </h1>
          <p className="mt-2 max-w-[60ch] text-[14px] text-[color:var(--ink-dim)]">
            Talents are non-CORE, non-crew people who appear in photos or clips. Add by Twitch
            handle, or create manually with an uploaded image. AI-discovered socials surface for
            approve / deny per platform. Phase 4 persists to <code className="font-mono">collab_people</code>.
          </p>
        </section>

        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-12">
            <TalentManager />
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
