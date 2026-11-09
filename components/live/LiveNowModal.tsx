"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, ArrowUpRight, CalendarDays, Eye, Grid2X2, Play, X } from "lucide-react";
import Image from "@/components/ui/SiteImage";
import { WatchThumb } from "@/components/watch/WatchThumb";
import { MEMBERS } from "@/lib/members";
import type { LiveEntry } from "@/lib/twitch";
import { cn } from "@/lib/utils";
import { LiveDuration } from "@/components/watch/LiveAirtime";
import type { UnifiedLiveEntry } from "@/lib/watch/live-snapshot";
import { groupCrossPlatformLiveSources } from "@/lib/watch/live-source-groups";
import { readableTitle } from "@/lib/watch/presentation";
import styles from "./LiveNowModal.module.css";

type YouTubeLiveEntry = UnifiedLiveEntry & {
  platform: "youtube";
  youtubeId: string;
};

type ModalLiveSource = {
  key: string;
  kind: "live";
  platform: "twitch" | "youtube";
  memberSlug: string | null;
  memberLabel: string;
  entry: LiveEntry | YouTubeLiveEntry;
  member: (typeof MEMBERS)[number] | null;
};

function liveThumb(login: string, thumbnailUrl?: string) {
  if (thumbnailUrl) {
    const joiner = thumbnailUrl.includes("?") ? "&" : "?";
    return `${thumbnailUrl}${joiner}t=${Math.floor(Date.now() / 60_000)}`;
  }
  return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login.toLowerCase()}-640x360.jpg`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function youtubeThumb(entry: YouTubeLiveEntry): string {
  return entry.poster || `https://i.ytimg.com/vi/${entry.youtubeId}/hqdefault.jpg`;
}

function youtubeLiveHref(entry: YouTubeLiveEntry): string {
  const params = new URLSearchParams({
    kind: "live",
    src: "youtube",
    id: entry.youtubeId,
    ref: entry.id,
    url: entry.sourceUrl ?? `https://www.youtube.com/watch?v=${entry.youtubeId}`,
    title: entry.title ?? "YouTube live",
    format: "live",
    slug: entry.memberSlug ?? "house",
  });
  return `/theater?${params.toString()}`;
}

function LiveNowCard({ sources, onClose }: { sources: ModalLiveSource[]; onClose: () => void }) {
  const [selectedKey, setSelectedKey] = useState(sources[0]?.key ?? "");
  const source = sources.find((item) => item.key === selectedKey) ?? sources[0]!;
  const isYoutube = source.platform === "youtube";
  const twitchEntry = isYoutube ? null : source.entry as LiveEntry;
  const youtubeEntry = isYoutube ? source.entry as YouTubeLiveEntry : null;
  const title = source.entry.title || "On air";
  const poster = youtubeEntry
    ? youtubeThumb(youtubeEntry)
    : liveThumb(twitchEntry!.login, twitchEntry!.thumbnailUrl);
  const href = youtubeEntry
    ? youtubeLiveHref(youtubeEntry)
    : `/watch/live/${twitchEntry!.login}`;
  const viewers = source.entry.viewerCount;
  const startedAt = source.entry.startedAt;
  const creator = source.member?.stageName ?? source.memberLabel;
  const platform = isYoutube ? "YouTube" : "Twitch";

  return (
    <li className={styles.card}>
      <Link href={href as never} onClick={onClose} className={styles.watchLink} aria-label={`Watch ${creator} live on ${platform}`}>
        <span className={styles.poster}>
          <WatchThumb src={poster} youtubeId={youtubeEntry?.youtubeId} alt="" className={styles.posterImage} fallback={<span className={styles.posterFallback}>{creator}</span>} />
          <span className={styles.posterShade} />
          <span className={styles.liveBadge}><span />Live</span>
          {viewers != null ? <span className={styles.viewerBadge}><Eye aria-hidden size={12} />{formatCount(viewers)}</span> : null}
          <span className={styles.playOverlay} aria-hidden><span className={styles.playCircle}><Play size={22} fill="currentColor" strokeWidth={1.5} /></span></span>
          <span className={styles.platformBadge}>{platform}</span>
        </span>
        <span className={styles.cardBody}>
          <span className={styles.identity}>
            <span className={styles.avatar}>
              {source.member ? <Image src={source.member.comm.logo} alt="" width={44} height={44} /> : <Play size={18} aria-hidden />}
            </span>
            <span className={styles.creatorCopy}>
              <span className={styles.creatorName}>{creator}</span>
              <span className={styles.category} title={twitchEntry?.game || `${platform} live`}>{twitchEntry?.game || `${platform} live`}</span>
            </span>
          </span>
          <span className={styles.streamTitle} title={title}>{readableTitle(title)}</span>
          <LiveDuration startedAt={startedAt ?? undefined} className={styles.duration} />
        </span>
        <span className={styles.watchAction}>
          <span><Play size={13} fill="currentColor" aria-hidden />Watch live</span>
          <ArrowRight size={17} aria-hidden />
        </span>
      </Link>
      {sources.length > 1 ? <div className={styles.sources} aria-label="Choose a live source">
        {sources.map((item) => {
          const active = item.key === source.key;
          return <button key={item.key} type="button" aria-pressed={active} onClick={() => setSelectedKey(item.key)} className={styles.sourceButton}>
            {item.platform === "youtube" ? "YouTube" : "Twitch"}{item.entry.viewerCount != null ? ` · ${formatCount(item.entry.viewerCount)}` : ""}
          </button>;
        })}
      </div> : null}
    </li>
  );
}

export function LiveNowModal({
  entries,
  youtubeEntries = [],
  combinedViewers,
  onClose,
}: {
  entries: LiveEntry[];
  youtubeEntries?: YouTubeLiveEntry[];
  combinedViewers: number;
  onClose: () => void;
}) {
  const returnFocus = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const sources: ModalLiveSource[] = [
    ...entries.flatMap((entry) => {
      const member = MEMBERS.find((item) => item.twitchLogin.toLowerCase() === entry.login.toLowerCase());
      return member ? [{ key: `twitch:${entry.login.toLowerCase()}`, kind: "live" as const, platform: "twitch" as const, memberSlug: member.slug, memberLabel: member.stageName, entry, member }] : [];
    }),
    ...youtubeEntries.map((entry) => {
      const member = entry.memberSlug ? MEMBERS.find((item) => item.slug === entry.memberSlug) ?? null : null;
      return { key: `youtube:${entry.id}`, kind: "live" as const, platform: "youtube" as const, memberSlug: entry.memberSlug, memberLabel: member?.stageName ?? "YouTube", entry, member };
    }),
  ];
  const groups = groupCrossPlatformLiveSources(sources);
  const count = groups.length;
  const wide = count >= 2;
  const many = count >= 3;
  const fourOrMore = count >= 4;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content aria-label="Live now" className={cn(styles.panel, fourOrMore ? styles.fourColumns : many ? styles.threeColumns : wide ? styles.twoColumns : styles.oneColumn)} data-lenis-prevent onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
        }}>
        <header className={styles.header}>
          <div>
            <Dialog.Title className={styles.heading}>Live now <span className={styles.count} aria-hidden>{count}</span></Dialog.Title>
            <Dialog.Description className={styles.description}>Choose a stream to watch.</Dialog.Description>
          </div>
          <div className={styles.headerEnd}>
            {combinedViewers > 0 ? <p className={styles.audience}><Eye size={16} aria-hidden /><span><strong>{combinedViewers.toLocaleString("en-US")}</strong><span>watching across CORE</span></span></p> : null}
            <Dialog.Close className={styles.close} aria-label="Close"><X size={20} aria-hidden /></Dialog.Close>
          </div>
        </header>

        <ul
          className={cn(
            "min-h-0 flex-1",
            styles.grid,
            count === 1
              ? "grid-cols-1"
              : count === 2
                ? "grid-cols-1 sm:grid-cols-2"
                : count === 3
                  ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {groups.map((group) => <LiveNowCard key={group.key} sources={group.sources} onClose={onClose} />)}
        </ul>

        <footer className={styles.footer}>
          <Link href="/guide" onClick={onClose} className={styles.footerLink}>
            <span className={styles.footerIcon}><CalendarDays size={20} aria-hidden /></span>
            <span className={styles.footerCopy}><strong>Open guide</strong><span>See what’s on next</span></span>
            <ArrowUpRight className={styles.footerArrow} size={18} aria-hidden />
          </Link>
          <Link href="/multiview?live=all" onClick={onClose} className={cn(styles.footerLink, styles.primaryLink)}>
            <span className={styles.footerIcon}><Grid2X2 size={20} aria-hidden /></span>
            <span className={styles.footerCopy}><strong>Open in multiview</strong><span>Watch all {count} live {count === 1 ? "stream" : "streams"}</span></span>
            <ArrowUpRight className={styles.footerArrow} size={18} aria-hidden />
          </Link>
        </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
