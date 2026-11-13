import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { FanMailCollection } from "@/components/fan-mail/FanMailCollection";
import { FanMailStage } from "@/components/fan-mail/FanMailStage";
import { LetterPrompts } from "@/components/fan-mail/LetterPrompts";
import { MailCard } from "@/components/fan-mail/MailCard";
import { PostcardDesignSet } from "@/components/fan-mail/PostcardDesignSet";
import { SendingGuide } from "@/components/fan-mail/SendingGuide";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { MAIL_MEMBERS, MAIL_MEMBERS_BY_SLUG } from "@/lib/fan-mail";
import { fanMailStageFor } from "@/lib/fan-mail-stages";
import { postcardIdentityFor } from "@/lib/postcard-identities";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return MAIL_MEMBERS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const member = MAIL_MEMBERS_BY_SLUG[slug];
  if (!member) return {};
  return withPageMetadata(`/send-to-${member.slug}`, {
    title: `Send to ${member.displayName}`,
    description: `Mailing address for ${member.displayName} of CORE.`,
    alternates: {
      canonical: `/send-to-${member.slug}`,
    },
    openGraph: {
      title: `Send mail to ${member.displayName}`,
      description: `Published mailing information and fan-mail guidelines for ${member.displayName} of The Core Boys.`,
      url: `/send-to-${member.slug}`,
      type: "website",
    },
  });
}

/**
 * /send-to-:slug rewrites to this dynamic route. Each page is dressed in that
 * creator's postcard identity: backdrop, type, ticker, postcard set, and
 * writing prompts all come from `lib/postcard-identities.ts` and
 * `lib/fan-mail-stages.ts`.
 */
export default async function SendToPage({ params }: Params) {
  const { slug } = await params;
  const member = MAIL_MEMBERS_BY_SLUG[slug];
  if (!member) notFound();

  const identity = postcardIdentityFor(member.slug);
  const stage = fanMailStageFor(member.slug);

  if (!identity || !stage) {
    return (
      <>
        <div className="fan-mail-shell relative min-h-screen px-5 pb-32 pt-24 md:px-16 md:pt-32">
          <div className="mx-auto max-w-[640px]">
            <h1 className="font-display text-[44px] font-semibold leading-[0.95] tracking-[-0.03em] text-[color:var(--ink)] md:text-[72px]">
              Send to {member.displayName}.
            </h1>
            <div className="mt-10"><MailCard member={member} /></div>
          </div>
        </div>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <div className="fan-mail-shell relative min-h-screen pb-28">
        <FanMailStage member={member} identity={identity} stage={stage} />

        <div className="mx-auto max-w-[1180px] space-y-20 px-5 pt-14 md:space-y-28 md:px-10 md:pt-20">
          <PageSection eyebrow="Before you send" title="Three things to check." accent={stage.ring}>
            <SendingGuide accent={stage.ring} />
          </PageSection>

          <PageSection
            eyebrow={`${identity.communityName} postcard set`}
            title={`Four looks, all ${identity.creatorName}.`}
            description={`Each design is built from ${identity.creatorName}’s postcard identity. Borrow a look for your envelope, letter, or fan art.`}
            accent={stage.ring}
          >
            <PostcardDesignSet identity={identity} />
          </PageSection>

          <PageSection
            eyebrow="What to write"
            title="Stuck on the first line?"
            description={`Prompts written for ${identity.creatorName}. Pick one, answer it honestly, and keep it short.`}
            accent={stage.ring}
          >
            <LetterPrompts identity={identity} accent={stage.ring} />
          </PageSection>

          <PageSection eyebrow="More fan mail" title="Write to the rest of CORE." accent={stage.ring}>
            <FanMailCollection exclude={member.slug} />
          </PageSection>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

function PageSection({
  eyebrow,
  title,
  description,
  accent,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="mb-7 max-w-2xl md:mb-9">
        <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink-dim)]">
          <span className="h-px w-6" style={{ background: accent }} aria-hidden />
          {eyebrow}
        </p>
        <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-[color:var(--ink)]">
          {title}
        </h2>
        {description ? <p className="mt-3 text-base leading-relaxed text-[color:var(--ink-dim)]">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
