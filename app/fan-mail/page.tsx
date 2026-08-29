import type { Metadata } from "next";
import { MailCard } from "@/components/fan-mail/MailCard";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { MAIL_MEMBERS } from "@/lib/fan-mail";

export const metadata: Metadata = {
  title: "Fan mail",
  description: "Mailing addresses for CORE members.",
  alternates: { canonical: "/fan-mail" },
  openGraph: {
    title: "CORE — Fan mail",
    description: "Mailing addresses for CORE members.",
    url: "/fan-mail",
    type: "website",
  },
};

/**
 * /fan-mail — canonical hub. Every member is rendered as an anchored
 * paper card so /fan-mail#ron deep-links cleanly. The single source of
 * truth lives in `lib/fan-mail.ts`.
 */
export default function FanMailPage() {
  return (
    <>
    <div className="fan-mail-shell relative min-h-screen pb-32">
      {/* Hero */}
      <header className="relative px-6 pb-10 pt-24 md:px-16 md:pb-16 md:pt-32">
        <div className="mx-auto max-w-[1080px]">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Fan mail
          </p>
          <h1 className="mt-3 font-display text-[44px] font-semibold leading-[0.92] tracking-[-0.03em] text-[color:var(--ink)] md:text-[96px]">
            Send fan mail.
          </h1>
          <p className="mt-5 max-w-2xl text-md leading-relaxed text-[color:var(--ink-dim)] md:text-lg">
            Use the addresses below to send letters, artwork, or packages. Do not
            send perishables, hazardous items, or cash.
          </p>
        </div>
      </header>

      {/* Cards — pile of mail. Stagger left/right slightly on desktop so the
          rotations feel like a real stack. */}
      <section
        aria-label="Mailing addresses"
        className="px-6 pt-14 md:px-16 md:pt-20"
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
