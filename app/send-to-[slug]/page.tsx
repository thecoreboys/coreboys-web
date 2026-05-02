import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MailCard } from "@/components/fan-mail/MailCard";
import { MAIL_MEMBERS, MAIL_MEMBERS_BY_SLUG } from "@/lib/fan-mail";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return MAIL_MEMBERS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const member = MAIL_MEMBERS_BY_SLUG[slug];
  if (!member) return {};
  return {
    title: `Send to ${member.displayName}`,
    description: `Mailing address for ${member.displayName} of The Core Boys.`,
    alternates: {
      canonical: `/send-to-${member.slug}`,
    },
    openGraph: {
      title: `Send mail to ${member.displayName}`,
      description: "Old-school mail still hits different.",
      url: `/send-to-${member.slug}`,
      type: "website",
    },
  };
}

/**
 * /send-to-[slug] — focused single-card page. Same paper card as the hub
 * but presented as a destination URL. Useful for sharing in chat or a
 * Twitch panel.
 */
export default async function SendToPage({ params }: Params) {
  const { slug } = await params;
  const member = MAIL_MEMBERS_BY_SLUG[slug];
  if (!member) notFound();

  return (
    <div className="fan-mail-shell relative min-h-screen pb-32">
      <header className="px-6 pb-8 pt-24 md:px-16 md:pb-12 md:pt-32">
        <div className="mx-auto max-w-[640px]">
          <Link
            href={"/fan-mail" as Route}
            className="mb-6 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)] hover:text-[color:var(--ink)]"
          >
            <ArrowLeft size={12} /> All mail
          </Link>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Mail · One letter · Right address
          </p>
          <h1 className="mt-3 font-editorial-serif text-[44px] font-semibold leading-[0.95] tracking-[-0.02em] text-[color:var(--ink)] md:text-[72px]">
            <span className="italic">Send to</span>
            <br />
            {member.displayName}.
          </h1>
        </div>
      </header>

      <section className="px-6 md:px-16">
        <div className="mx-auto max-w-[640px]">
          <MailCard member={member} />

          <p className="mt-8 text-center text-[12px] text-[color:var(--ink-faint)]">
            Forever stamp covers a standard letter · weigh packages at the post office ·{" "}
            no perishables, no hazards.
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              href={"/fan-mail" as Route}
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-dim)] hover:text-[color:var(--core)]"
            >
              Send to all five → /fan-mail
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
