import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { MailCard } from "@/components/fan-mail/MailCard";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { MAIL_MEMBERS } from "@/lib/fan-mail";

export const metadata: Metadata = withPageMetadata("/fan-mail", {
  title: "Fan mail",
  description: "Find published mailing information for The Core Boys, with member fan-mail pages and guidance for sending letters and packages.",
  alternates: { canonical: "/fan-mail" },
  openGraph: { type: "website" },
});

/**
 * /fan-mail — canonical hub. Every member is rendered as an anchored
 * paper card so /fan-mail#ron deep-links cleanly. The single source of
 * truth lives in `lib/fan-mail.ts`.
 */
export default function FanMailPage() {
  return (
    <>
    <div className="fan-mail-shell fan-mail-page relative min-h-screen pb-32">
      {/* Hero */}
      <header className="fan-mail-page__intro relative px-6 pb-10 pt-24 md:px-16 md:pb-16 md:pt-32">
        <div className="mx-auto max-w-[1080px]">
          <p className="fan-mail-page__eyebrow text-[color:var(--ink-dim)]">
            Fan mail
          </p>
          <h1 className="mt-3 font-display text-[44px] font-semibold leading-[0.92] tracking-[-0.03em] text-[color:var(--ink)] md:text-[96px]">
            Send fan mail.
          </h1>
          <p className="fan-mail-page__description mt-5 max-w-2xl text-md leading-relaxed text-[color:var(--ink-dim)] md:text-lg">
            Use the addresses below to send letters, artwork, or packages. Do not
            send perishables, hazardous items, or cash.
          </p>
        </div>
      </header>

      {/* Cards — pile of mail. Stagger left/right slightly on desktop so the
          rotations feel like a real stack. */}
      <section
        aria-label="Mailing addresses"
        className="fan-mail-page__cards px-6 pt-14 md:px-16 md:pt-20"
      >
        <div className="mx-auto grid max-w-[1080px] grid-cols-1 gap-10 md:gap-14 lg:grid-cols-[repeat(2,minmax(0,1fr))] lg:gap-16">
          {MAIL_MEMBERS.map((m) => (
            <MailCard key={m.slug} member={m} />
          ))}
        </div>
      </section>

    </div>
    <SiteFooter />
    </>
  );
}
