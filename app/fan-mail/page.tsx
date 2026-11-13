import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { FanMailCollection } from "@/components/fan-mail/FanMailCollection";
import { MailCard } from "@/components/fan-mail/MailCard";
import { SendingGuide } from "@/components/fan-mail/SendingGuide";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { MAIL_MEMBERS } from "@/lib/fan-mail";
import { POSTCARD_IDENTITIES } from "@/lib/postcard-identities";

const POSTCARD_LOOKS = POSTCARD_IDENTITIES.reduce((total, identity) => total + identity.frontDesigns.length, 0);

export const metadata: Metadata = withPageMetadata("/fan-mail", {
  title: "Fan mail",
  description: "Find published mailing information for The Core Boys, with member fan-mail pages and guidance for sending letters and packages.",
  alternates: { canonical: "/fan-mail" },
  openGraph: { type: "website" },
});

/**
 * /fan-mail — canonical hub. A collection index links to each creator's own
 * page, then every member is rendered as an anchored postcard so
 * /fan-mail#ron deep-links cleanly. The single source of truth lives in
 * `lib/fan-mail.ts`; per-creator styling in `lib/postcard-identities.ts`
 * and `lib/fan-mail-stages.ts`.
 */
export default function FanMailPage() {
  return (
    <>
      <div className="fan-mail-shell fan-mail-page relative min-h-screen pb-32">
        <header className="fan-mail-page__intro relative px-6 pb-10 pt-24 md:px-16 md:pb-16 md:pt-32">
          <div className="mx-auto grid max-w-[1180px] gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <p className="fan-mail-page__eyebrow text-[color:var(--ink-dim)]">Fan mail</p>
              <h1 className="mt-3 font-display text-[44px] font-semibold leading-[0.92] tracking-[-0.03em] text-[color:var(--ink)] md:text-[96px]">
                Send fan mail.
              </h1>
              <p className="fan-mail-page__description mt-5 max-w-2xl text-md leading-relaxed text-[color:var(--ink-dim)] md:text-lg">
                Five mailboxes, five postcards, each one designed around its creator. Pick who you are writing to,
                copy the address, and send letters, artwork, or packages.
              </p>
            </div>
            <dl className="flex gap-6 text-[color:var(--ink)] md:pb-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">Mailboxes</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.03em]">0{MAIL_MEMBERS.length}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">Postcard looks</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.03em]">{POSTCARD_LOOKS}</dd>
              </div>
            </dl>
          </div>
        </header>

        <section aria-labelledby="fan-mail-collection" className="px-6 md:px-16">
          <div className="mx-auto max-w-[1180px]">
            <h2 id="fan-mail-collection" className="sr-only">Choose a creator</h2>
            <FanMailCollection />
          </div>
        </section>

        <section aria-labelledby="fan-mail-guide" className="px-6 pt-16 md:px-16 md:pt-24">
          <div className="mx-auto max-w-[1180px]">
            <SectionHeading id="fan-mail-guide" eyebrow="Before you send" title="Three things to check." />
            <SendingGuide />
          </div>
        </section>

        <section aria-labelledby="fan-mail-addresses" className="fan-mail-page__cards px-6 pt-16 md:px-16 md:pt-24">
          <div className="mx-auto max-w-[1180px]">
            <SectionHeading
              id="fan-mail-addresses"
              eyebrow="Every address"
              title="The full stack of postcards."
              description="Each card carries the exact recipient line and mailing address. Open a creator’s page for their postcard set and writing prompts."
            />
            <div className="grid grid-cols-1 gap-10 md:gap-14 lg:grid-cols-[repeat(2,minmax(0,1fr))] lg:gap-16">
              {MAIL_MEMBERS.map((m) => (
                <MailCard key={m.slug} member={m} pageHref={`/send-to-${m.slug}`} />
              ))}
            </div>
          </div>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}

function SectionHeading({ id, eyebrow, title, description }: { id: string; eyebrow: string; title: string; description?: string }) {
  return (
    <header className="mb-7 max-w-2xl md:mb-9">
      <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink-dim)]">
        <span className="h-px w-6 bg-[color:var(--core)]" aria-hidden />
        {eyebrow}
      </p>
      <h2 id={id} className="mt-3 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-[color:var(--ink)]">
        {title}
      </h2>
      {description ? <p className="mt-3 text-base leading-relaxed text-[color:var(--ink-dim)]">{description}</p> : null}
    </header>
  );
}
