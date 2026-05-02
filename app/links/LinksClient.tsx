"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { LiveDot } from "@/components/ui/LiveDot";
import { SocialIcon, PLATFORM_LABEL } from "@/components/ui/SocialIcon";
import { formatViewerCount, cn } from "@/lib/utils";

type Social = {
  platform: string;
  url: string;
  handle?: string | null;
  label?: string | null;
};

type MemberRow = {
  slug: string;
  name: string;
  realName: string;
  accent: string;
  portrait: string;
  twitchLogin: string;
  socials: readonly Social[];
};

type Props = {
  members: MemberRow[];
  groupSocials: Social[];
};

const PLATFORM_ORDER = ["twitch", "youtube", "tiktok", "instagram", "x", "snapchat"] as const;

/**
 * /links body. Five rules:
 *  - Live members rise to the top automatically.
 *  - Card defaults to the member's Twitch state — login + viewer count.
 *  - Tapping a card toggles its expanded state (other socials).
 *  - Mobile must work without hover; chip targets are 44px+.
 *  - All animations are reduced when prefers-reduced-motion.
 */
export function LinksClient({ members, groupSocials }: Props) {
  const { data } = useLiveStatus();
  const liveByLogin = useMemo(() => {
    const m = new Map<string, { isLive: boolean; viewerCount?: number }>();
    for (const e of data?.live ?? []) {
      m.set(e.login.toLowerCase(), { isLive: e.isLive, viewerCount: e.viewerCount });
    }
    return m;
  }, [data]);

  // Sort live → offline; preserve canonical order within each bucket.
  const sorted = useMemo(() => {
    return [...members].sort((a, b) => {
      const al = liveByLogin.get(a.twitchLogin.toLowerCase())?.isLive ?? false;
      const bl = liveByLogin.get(b.twitchLogin.toLowerCase())?.isLive ?? false;
      if (al !== bl) return al ? -1 : 1;
      return 0;
    });
  }, [members, liveByLogin]);

  const liveCount = useMemo(
    () => members.filter((m) => liveByLogin.get(m.twitchLogin.toLowerCase())?.isLive).length,
    [members, liveByLogin],
  );

  const [openSlugs, setOpenSlugs] = useState<Set<string>>(new Set());
  function toggle(slug: string) {
    setOpenSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-[640px] px-4 py-10 md:py-14">
      <header className="mb-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
          The Core Boys
        </p>
        <h1 className="mt-2 font-display text-[44px] font-black leading-[0.95] tracking-[-0.04em] text-[color:var(--ink)] md:text-[64px]">
          Find us.
        </h1>
        <p className="mt-3 text-[13px] text-[color:var(--ink-dim)]">
          Live status updates every 60s.{" "}
          {liveCount > 0 ? (
            <span className="font-semibold text-[color:var(--core)]">
              {liveCount} live now.
            </span>
          ) : (
            <span>Quiet right now.</span>
          )}
        </p>
      </header>

      <ul className="flex flex-col gap-2.5">
        {sorted.map((m) => {
          const live = liveByLogin.get(m.twitchLogin.toLowerCase());
          const isLive = live?.isLive ?? false;
          const isOpen = openSlugs.has(m.slug);
          return (
            <MemberCard
              key={m.slug}
              member={m}
              isLive={isLive}
              viewerCount={live?.viewerCount}
              isOpen={isOpen}
              onToggle={() => toggle(m.slug)}
            />
          );
        })}
      </ul>

      <section className="mt-10">
        <p className="kicker mb-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-faint)]">
          Group accounts
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {groupSocials.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 text-[12px] text-[color:var(--ink)] transition-colors hover:border-[color:var(--core)]"
            >
              <SocialIcon platform={s.platform as never} className="h-3.5 w-3.5" />
              <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-[color:var(--ink-dim)]">
                {(PLATFORM_LABEL as Record<string, string>)[s.platform] ?? s.platform}
              </span>
              {s.handle ? <span className="text-[11px]">{s.handle}</span> : null}
            </a>
          ))}
        </div>
      </section>

      <footer className="mt-10 flex flex-col items-center gap-3 text-center">
        <p className="text-[11px] text-[color:var(--ink-faint)]">
          thecoreboys.com · created. owned. ran. by us.
        </p>
      </footer>
    </div>
  );
}

function MemberCard({
  member,
  isLive,
  viewerCount,
  isOpen,
  onToggle,
}: {
  member: MemberRow;
  isLive: boolean;
  viewerCount?: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const orderedSocials = useMemo(() => {
    const map = new Map(member.socials.map((s) => [s.platform, s]));
    return PLATFORM_ORDER.map((p) => map.get(p)).filter((s): s is Social => !!s);
  }, [member.socials]);

  const twitchUrl = `https://twitch.tv/${member.twitchLogin}`;
  const cardId = `links-card-${member.slug}`;

  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-[12px] border bg-[color:var(--bg-elev)] transition-colors",
        isLive ? "border-[color:var(--core)]" : "border-[color:var(--rule)]",
      )}
      style={{
        boxShadow: isLive
          ? `inset 0 0 0 1px ${member.accent}33, 0 0 24px -12px ${member.accent}aa`
          : undefined,
      }}
    >
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <div
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-[color:var(--surface)] sm:h-14 sm:w-14"
          style={{ borderColor: member.accent }}
        >
          <Image
            src={member.portrait}
            alt={member.name}
            fill
            sizes="56px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-[18px] font-bold leading-tight tracking-[-0.01em] text-[color:var(--ink)] sm:text-[20px]">
              {member.name}
            </span>
            {isLive ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--core)] bg-[color:var(--core)]/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--core)]"
                aria-label="Live now"
              >
                <LiveDot live className="!h-1.5 !w-1.5" /> Live
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
            twitch.tv/{member.twitchLogin}
            {isLive && viewerCount != null ? (
              <span className="ml-2 text-[color:var(--ink-dim)]">
                · {formatViewerCount(viewerCount)} watching
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <a
            href={twitchUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${member.name} on Twitch`}
            className={cn(
              "inline-flex h-10 min-w-[44px] items-center justify-center gap-1 rounded-[8px] border px-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors",
              isLive
                ? "border-[color:var(--core)] bg-[color:var(--core)] text-black"
                : "border-[color:var(--rule)] text-[color:var(--ink)] hover:border-[color:var(--core)]",
            )}
          >
            {isLive ? "Watch" : "Twitch"}
          </a>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={cardId}
            aria-label={isOpen ? "Hide other socials" : "Show other socials"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[color:var(--rule)] text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--core)] hover:text-[color:var(--ink)]"
          >
            <ChevronDown
              size={14}
              className={cn(
                "transition-transform",
                "motion-reduce:transition-none",
                isOpen && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {/* Expanded social roster — animated by max-height for smoothness. */}
      <div
        id={cardId}
        className={cn(
          "grid grid-cols-1 gap-1.5 px-3 pb-3 sm:px-4 sm:pb-4",
          isOpen ? "block" : "hidden",
        )}
      >
        {orderedSocials.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2.5 rounded-[8px] border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 text-[13px] text-[color:var(--ink)] transition-colors hover:border-[color:var(--core)]"
          >
            <SocialIcon platform={s.platform as never} className="h-4 w-4 shrink-0" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-dim)]">
              {(PLATFORM_LABEL as Record<string, string>)[s.platform] ?? s.platform}
            </span>
            <span className="ml-auto truncate font-mono text-[11px] text-[color:var(--ink)]">
              {s.handle ?? new URL(s.url).hostname.replace(/^www\./, "")}
            </span>
          </a>
        ))}
      </div>

      {/* Accent rule strip — full width when live, hairline when offline. */}
      <div
        aria-hidden="true"
        className={cn(
          "h-px w-full transition-all",
          isLive ? "h-0.5" : "opacity-50",
        )}
        style={{ background: member.accent }}
      />
    </li>
  );
}

