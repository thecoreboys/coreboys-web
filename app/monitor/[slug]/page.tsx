import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { MonitorClient } from "./MonitorClient";

// Live stats are pulled directly from the Twitch Player JS API on the
// client; the server pass exists only to validate the slug and to
// hydrate the chat panel with the member's Twitch user_id (needed for
// 7TV / BTTV channel emote lookups).
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return MEMBERS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  if (!member) return {};
  return {
    title: `${member.stageName} — Live monitor`,
    description: `Real-time bitrate, buffer, latency, and chat for ${member.stageName}'s stream.`,
    alternates: { canonical: `/monitor/${member.slug}` },
    robots: { index: false, follow: false },
  };
}

export default async function MonitorPage({ params }: Params) {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  if (!member) notFound();

  // Best-effort Twitch user_id lookup for the chat emote sets. Failure
  // here just means BTTV/7TV channel emotes will be missing — the page
  // still renders the player + Twitch global emotes.
  let userId = "";
  let avatar = member.portrait;
  try {
    const users = await fetchUsersByLogin([member.twitchLogin]);
    const u = users[member.twitchLogin.toLowerCase()];
    if (u) {
      userId = u.id;
      if (u.profile_image_url) avatar = u.profile_image_url;
    }
  } catch {
    /* ignore */
  }

  return (
    <main className="relative pt-20 md:pt-24">
      <section className="border-b border-[color:var(--rule)] bg-[color:var(--bg)]">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
            >
              <ArrowLeft size={12} />
              Chat
            </Link>
            <span
              className="relative h-9 w-9 overflow-hidden rounded-full ring-2 ring-inset"
              style={{ ["--tw-ring-color" as string]: `${member.accent}88` }}
            >
              <Image src={avatar} alt="" fill sizes="36px" className="object-cover" />
            </span>
            <div className="leading-tight">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
                Live monitor
              </p>
              <p
                className="text-[16px] font-bold tracking-tight text-[color:var(--ink)]"
                style={{ textShadow: `0 0 14px ${member.accent}66, 0 0 3px rgba(255,255,255,0.4)` }}
              >
                {member.stageName}
              </p>
            </div>
          </div>
          <a
            href={`https://twitch.tv/${member.twitchLogin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] hover:text-[#9146FF]"
          >
            twitch.tv/{member.twitchLogin} ↗
          </a>
        </div>
      </section>

      <MonitorClient
        slug={member.slug}
        login={member.twitchLogin}
        displayName={member.stageName}
        accent={member.accent}
        userId={userId}
        avatarUrl={avatar}
      />

      <SiteFooter />
    </main>
  );
}
