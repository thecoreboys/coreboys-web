"use client";

import type { Route } from "next";
import Link from "next/link";
import Image from "@/components/ui/SiteImage";
import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";
import { ChevronRight, Zap } from "lucide-react";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { NETWORK_CHANNELS, type NetworkChannel } from "@/lib/watch/channels";
import { DragScrollRail } from "./DragScrollRail";
import styles from "./NetworkChannelPage.module.css";

// The home page renders this rail. It lives apart from NetworkChannelPage so
// the home bundle does not load the whole channel page and its players.

/** The channel's 24/7 page, matching NetworkChannelPage's continuous href. */
function channelHref(channel: NetworkChannel) {
  return `/channels/${channel.slug}`;
}

export function NetworkChannelRail({
  className = "",
  personalized = false,
  preferredMemberSlugs = [],
  variant = "detail",
}: {
  className?: string;
  personalized?: boolean;
  preferredMemberSlugs?: readonly string[];
  variant?: "home" | "detail";
}) {
  const router = useRouter();
  const prefetchedRoutes = useRef(new Set<string>());
  const isHomeShelf = variant === "home";
  const headingId = isHomeShelf ? "home-network-channel-heading" : "network-channel-heading";
  const channels = useMemo(() => {
    const order = new Map(preferredMemberSlugs.map((slug, index) => [slug, index]));
    return NETWORK_CHANNELS.filter((channel) => !isHomeShelf || channel.slug !== "core").sort((left, right) => {
      if (left.memberSlug === null) return -1;
      if (right.memberSlug === null) return 1;
      const leftRank = order.get(left.memberSlug) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = order.get(right.memberSlug) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
  }, [isHomeShelf, preferredMemberSlugs]);
  const prefetchChannel = (href: string) => {
    if (prefetchedRoutes.current.has(href)) return;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;
    prefetchedRoutes.current.add(href);
    router.prefetch(href as Route);
  };
  return (
    <section
      id={isHomeShelf ? "core-channels" : undefined}
      className={`watch-shelf-section px-5 md:px-10 ${isHomeShelf ? "watch-home-channel-shelf" : styles.detailChannelShelf} ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <div className="watch-shelf-heading watch-home-shelf-heading mb-3">
        <div className="watch-home-shelf-heading-copy">
          <h2
            id={headingId}
            className="watch-shelf-title text-lg font-semibold tracking-tight text-[color:var(--ink)] md:text-xl"
          >
            {isHomeShelf
              ? "Browse Communities"
              : personalized
                ? "Your CORE channels"
                : "CORE channels"}
          </h2>
        </div>
        {isHomeShelf ? (
          <Link prefetch={false} href={"/guide" as never} className="watch-home-shelf-action">
            Open guide
            <ChevronRight size={14} aria-hidden />
          </Link>
        ) : (
          <Link prefetch={false} href={"/channels/core?mode=shorts" as never} className="watch-home-shelf-action">
            <Zap size={14} aria-hidden />
            Shorts channel
          </Link>
        )}
      </div>
      <DragScrollRail
        className="watch-shelf watch-home-channel-rail"
        role="region"
        tabIndex={0}
        aria-label="CORE community channels"
      >
        {channels.map((channel) => (
          <Link
            key={channel.slug}
            href={channelHref(channel) as Route}
            prefetch={false}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse" || event.pointerType === "pen") prefetchChannel(channelHref(channel));
            }}
            onFocus={() => prefetchChannel(channelHref(channel))}
            onTouchStart={() => prefetchChannel(channelHref(channel))}
            aria-label={`Open ${channel.name} community`}
            data-cursor-community={channel.slug}
            className={`watch-home-promo-card ${styles.homeChannelTile}`}
            style={{ "--channel-accent": channel.accent } as React.CSSProperties}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={channel.backdrop} alt="" loading="lazy" decoding="async" className={styles.homeChannelBackdrop} />
            {channel.slug === "core" ? (
              <CoreWordmark className={styles.homeCoreWordmark} />
            ) : (
              <Image src={channel.artwork} alt="" width={160} height={160} className={styles.homeChannelArtwork} />
            )}
            <span className={styles.homeChannelCopy}>
              <strong>{channel.name}</strong>
              <small>{channel.host}</small>
            </span>
          </Link>
        ))}
      </DragScrollRail>
    </section>
  );
}
