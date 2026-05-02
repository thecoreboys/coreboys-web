import type { Metadata } from "next";
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
      <main className="relative pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[920px] px-6 py-12 md:px-8 md:py-16">
          <p className="eyebrow">Admin · Clips</p>
          <h1 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
            Add a clip.
          </h1>
          <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
            Paste a Twitch / YouTube / TikTok / Instagram URL. Phase 4 calls{" "}
            <code className="font-mono">coreboys-api</code> to scrape metadata, render a thumbnail,
            and run AI tagging. For now the form persists to localStorage.
          </p>

          <div className="mt-8">
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
