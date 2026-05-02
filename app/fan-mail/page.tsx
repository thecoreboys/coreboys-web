import type { Metadata } from "next";
import { MailCard } from "@/components/fan-mail/MailCard";
import { MAIL_MEMBERS } from "@/lib/fan-mail";

export const metadata: Metadata = {
  title: "Fan mail",
  description:
    "Send letters, packages, postcards, and weird trinkets to The Core Boys. Every member's PO box, formatted for the post office.",
  alternates: { canonical: "/fan-mail" },
  openGraph: {
    title: "The Core Boys — Fan mail",
    description: "Old-school mail still hits different.",
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
    <div className="fan-mail-shell relative min-h-screen pb-32">
      {/* Hero */}
      <header className="relative px-6 pb-10 pt-24 md:px-16 md:pb-16 md:pt-32">
        <div className="mx-auto max-w-[1080px]">
          <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Mail · 5 boys · 0 DMs
          </p>
          <h1 className="mt-3 font-editorial-serif text-[44px] font-semibold leading-[0.92] tracking-[-0.02em] text-[color:var(--ink)] md:text-[96px]">
            <span className="italic">Send letters,</span>
            <br />
            not DMs.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-[1.6] text-[color:var(--ink-dim)] md:text-[17px]">
            Old-school mail still hits different. Stickers, art, weird trinkets,
            handwritten letters — all welcome. No perishables. No hazards. Every
            piece gets seen, even if a personal reply isn&apos;t guaranteed.
          </p>
        </div>
      </header>

      {/* Cards — pile of mail. Stagger left/right slightly on desktop so the
          rotations feel like a real stack. */}
      <section
        aria-label="Mailing addresses"
        className="px-6 md:px-16"
      >
        <div className="mx-auto grid max-w-[1080px] grid-cols-1 gap-10 md:gap-14 lg:grid-cols-2 lg:gap-16">
          {MAIL_MEMBERS.map((m) => (
            <MailCard key={m.slug} member={m} />
          ))}
        </div>
      </section>

      {/* Heads-up + How-to */}
      <section className="px-6 pt-20 md:px-16 md:pt-28">
        <div className="mx-auto grid max-w-[1080px] grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <HowToSend />
          <HeadsUp />
        </div>
      </section>
    </div>
  );
}

function HowToSend() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: "01",
      title: "Pick your guy",
      body: "Tap Copy on a card above. The full name + address goes onto your clipboard.",
    },
    {
      n: "02",
      title: "Address it",
      body: "Recipient block on the front of the envelope, your return address top-left.",
    },
    {
      n: "03",
      title: "Stamp & seal",
      body: "Forever stamp covers a standard letter. For packages, weigh it at the counter.",
    },
    {
      n: "04",
      title: "Drop it",
      body: "USPS box, post office, or hand it to your carrier. Tracking optional.",
    },
  ];
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
        How to send
      </p>
      <h2 className="mt-2 font-editorial-serif text-[28px] font-semibold tracking-[-0.01em] text-[color:var(--ink)] md:text-[36px]">
        <span className="italic">Four steps,</span> no app required.
      </h2>
      <ol className="mt-5 space-y-3">
        {steps.map((s) => (
          <li
            key={s.n}
            className="flex items-start gap-4 rounded-[8px] border border-[color:var(--rule)] bg-[color:var(--bg-elev)]/50 p-4 backdrop-blur-sm"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--core)]">
              {s.n}
            </span>
            <div>
              <p className="font-editorial-serif text-[18px] font-semibold tracking-[-0.01em] text-[color:var(--ink)]">
                {s.title}
              </p>
              <p className="mt-1 text-[13px] leading-[1.55] text-[color:var(--ink-dim)]">
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HeadsUp() {
  return (
    <aside className="self-start rounded-[10px] border border-[color:var(--rule)] bg-[color:var(--bg-elev)]/40 p-5 backdrop-blur-sm">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--core)]">
        Heads up
      </p>
      <ul className="mt-3 space-y-2 text-[13px] leading-[1.55] text-[color:var(--ink-dim)]">
        <li>
          <strong className="text-[color:var(--ink)]">No perishables, no hazards.</strong>{" "}
          Anything that spoils, leaks, melts, or smells goes in the trash before
          it reaches the recipient.
        </li>
        <li>
          <strong className="text-[color:var(--ink)]">PO box size limits.</strong>{" "}
          Oversized packages may need to be picked up at the counter. When in
          doubt, ship priority mail and let USPS handle it.
        </li>
        <li>
          <strong className="text-[color:var(--ink)]">Every piece gets seen.</strong>{" "}
          Personal replies aren&apos;t guaranteed — but the cool stuff lands on
          stream. Don&apos;t put your only copy in the box.
        </li>
        <li>
          <strong className="text-[color:var(--ink)]">Don&apos;t send cash.</strong>{" "}
          Just don&apos;t.
        </li>
      </ul>
    </aside>
  );
}
