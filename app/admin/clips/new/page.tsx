import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@untitledui/icons";
import { AuthGate } from "@/components/admin/AuthGate";
import { ClipNewForm } from "@/components/admin/ClipNewForm";
import { MEMBERS } from "@/lib/members";

export const metadata: Metadata = {
  title: "Add clip — Admin",
  robots: { index: false, follow: false },
};

export default function NewClipPage() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[920px] px-6 py-12 md:px-8 md:py-16">
          <Link
            href="/admin/clips"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-4" /> Clips
          </Link>
          <p className="mt-3 text-sm font-semibold text-brand-secondary">Admin · Clips</p>
          <h1 className="mt-1 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
            Add a clip.
          </h1>
          <p className="mt-3 max-w-[60ch] text-md leading-relaxed text-tertiary">
            Paste a Twitch / YouTube / TikTok / Instagram URL. Phase 4 calls{" "}
            <code className="font-mono">coreboys-api</code> to scrape metadata, render a thumbnail,
            and run AI tagging. For now the form persists to localStorage.
          </p>

          <div className="mt-8 rounded-xl bg-primary p-6 ring-1 ring-inset ring-secondary shadow-xs md:p-8">
            <ClipNewForm
              members={MEMBERS.map((m) => ({
                slug: m.slug,
                stageName: m.stageName,
                accent: m.accent,
              }))}
            />
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
