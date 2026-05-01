import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MEMBERS_BY_SLUG, MEMBERS } from "@/lib/members";
import { Display, Eyebrow, Body, Caption } from "@/components/typography";
import { SocialIcon, PLATFORM_LABEL } from "@/components/ui/SocialIcon";
import { ageFromIso } from "@/lib/utils";
import { CREW } from "@/lib/members";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return MEMBERS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  if (!member) return {};
  return {
    title: `${member.stageName} — The Core Boys`,
    description: member.bio,
    alternates: { canonical: `/m/${member.slug}` },
    openGraph: {
      title: `${member.stageName} — The Core Boys`,
      description: member.bio,
      type: "profile",
      url: `/m/${member.slug}`,
    },
  };
}

const PLATFORM_ORDER = ["youtube", "twitch", "tiktok", "instagram", "x", "snapchat"] as const;

export default async function MemberPage({ params }: Params) {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  if (!member) notFound();

  const age = ageFromIso(member.birthDate);
  const cameraman = CREW.find(
    (c) => c.role === "cameraman" && c.worksWith.includes(member.slug),
  );

  // JSON-LD Person schema. sameAs covers every social URL we know.
  const sameAs = [
    ...member.socials.map((s) => s.url),
    ...member.wikipedia,
  ];
  const ld = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: member.stageName,
    alternateName: member.realName,
    url: `https://thecoreboys.com/m/${member.slug}`,
    description: member.bio,
    ...(member.birthDate ? { birthDate: member.birthDate } : {}),
    sameAs,
    memberOf: {
      "@type": "Organization",
      name: "The Core Boys",
      url: "https://thecoreboys.com",
    },
  };

  return (
    <main className="relative min-h-screen pb-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-6 py-24 md:grid-cols-[1.1fr_1.4fr] md:px-16 md:py-32">
        <div className="relative aspect-[3/4] w-full max-w-[560px] overflow-hidden border border-[color:var(--rule)] bg-[color:var(--bg-elev)]">
          <Image
            src={member.portrait}
            alt={member.stageName}
            fill
            sizes="(min-width: 768px) 40vw, 92vw"
            className="object-cover"
            priority
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(180deg, transparent 40%, ${member.accent}20 100%)`,
            }}
          />
        </div>

        <div className="flex flex-col gap-10">
          <div>
            <Link
              href="/#roster"
              className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
            >
              ← The Boys
            </Link>
            <Eyebrow className="mt-6">{member.realName}{age != null ? ` · ${age}` : ""}</Eyebrow>
            <Display as="h1" size={72} className="mt-3 md:text-[120px]">
              {member.stageName}
            </Display>
          </div>

          <Body className="max-w-[60ch] text-[color:var(--ink)]/90 leading-relaxed">
            {member.bio}
          </Body>

          <div className="grid gap-2">
            <Eyebrow className="mb-2">Channels</Eyebrow>
            <ul className="flex flex-col">
              {PLATFORM_ORDER.map((p) => {
                const subset = member.socials.filter((s) => s.platform === p);
                if (subset.length === 0) return null;
                return (
                  <li
                    key={p}
                    className="flex items-center justify-between gap-4 border-t border-[color:var(--rule)] py-4 first:border-t-0"
                  >
                    <div className="flex items-center gap-3">
                      <SocialIcon platform={p} size={18} className="text-[color:var(--ink-dim)]" />
                      <Caption size={14} className="text-[color:var(--ink)]">
                        {PLATFORM_LABEL[p]}
                      </Caption>
                    </div>
                    <ul className="flex flex-wrap items-center gap-3">
                      {subset.map((s) => (
                        <li key={s.url}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-cursor="hover"
                            className="font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
                          >
                            {s.label ?? s.handle ?? "Open"} ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>

          {cameraman ? (
            <div className="border-t border-[color:var(--rule)] pt-6">
              <Eyebrow className="mb-2">Shot by</Eyebrow>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-medium tracking-tight">{cameraman.name}</div>
                  <Caption className="mt-1">Cameraman</Caption>
                </div>
                <div className="flex items-center gap-2">
                  {cameraman.socials.map((s) => (
                    <a
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--rule)] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
                    >
                      <SocialIcon platform={s.platform as "x" | "instagram"} size={14} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
