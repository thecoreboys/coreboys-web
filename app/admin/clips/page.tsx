import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AuthGate } from "@/components/admin/AuthGate";
import { ReviewQueue } from "@/components/admin/ReviewQueue";

export const metadata: Metadata = {
  title: "Admin · Clip queue",
  robots: { index: false, follow: false },
};

export default function AdminClipsPage() {
  return (
    <AuthGate>
      <main className="relative pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
              >
                ← Admin
              </Link>
              <p className="mt-2 eyebrow">Admin · Clips</p>
              <h1 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
                Clips.
              </h1>
              <p className="mt-2 max-w-[60ch] text-[14px] text-[color:var(--ink-dim)]">
                Add a clip directly, or review and publish fan submissions to the public library.
              </p>
            </div>
            <Link href="/admin/clips/new" className="btn btn-primary">
              <Plus size={14} /> Add clip
            </Link>
          </div>
        </section>

        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-12">
            <ReviewQueue />
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
