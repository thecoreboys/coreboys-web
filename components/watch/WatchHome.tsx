"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { PatreonShelfData, WatchCatalog, WatchItem } from "@/lib/watch/types";
import { MEMBERS } from "@/lib/members";
import { useMyList } from "@/hooks/useMyList";
import { useWatchProgress, youtubeIdFromHref } from "@/hooks/useWatchProgress";
import type { WatchProgressMap } from "@/hooks/useWatchProgress";
import { personalizeItems } from "@/lib/watch/discovery";
import { useWatchDiscovery, type WatchFeedbackValue } from "@/lib/watch/discovery-state";
import {
  buildCreatorAffinity,
  rankByCreatorAffinity,
  rankCreatorSlugs,
} from "@/lib/watch/creator-affinity";
import {
  buildWatchHeroItems,
  selectContinueWatchingItems,
} from "@/lib/watch/continue-watching";
import { selectWatchHomeXPosts, selectWatchHomeXSpaces } from "@/lib/watch/x-posts";
import { selectShortFormRailItems } from "@/lib/watch/short-form";
import { BillboardCarousel } from "./Billboard";
import { NetworkChannelRail } from "./NetworkChannelPage";
import { Shelf } from "./PosterCard";
import { PatreonLockedShelf } from "./PatreonLockedShelf";
import { XTweetsRail } from "./XTweetsRail";
import { WatchLegalFooter } from "./WatchLegalFooter";
import { SupporterCta } from "@/components/marketing/SupporterCta";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import type { CoreOriginal } from "@/lib/core-originals";

function unique(items: WatchItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function latestUniqueXPosts(items: readonly WatchItem[], limit = 6): WatchItem[] {
  const seen = new Set<string>();
  const output: WatchItem[] = [];
  for (const item of items) {
    if (item.kind !== "post" || item.format === "live") continue;
    const match = /\/(?:status)\/(\d{5,25})/i.exec(item.sourceUrl ?? item.href);
    const key = match?.[1] ?? item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length === limit) break;
  }
  return output;
}

/**
 * Keep rails quick to mount while rotating through every account represented
 * in the full catalog. Filtering happens first, so selecting YouTube still
 * balances Main / Live / IRL / Clips / VOD channels instead of showing only
 * the most prolific account.
 */
function balancedRail(items: WatchItem[], limit = 24) {
  if (items.length <= limit) return items;
  const buckets = new Map<string, WatchItem[]>();
  for (const item of items) {
    const account = item.accountLabel ?? item.memberSlug ?? item.memberLabel;
    const key = `${item.platform}:${account}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }
  const output: WatchItem[] = [];
  let depth = 0;
  while (output.length < limit) {
    let added = false;
    for (const bucket of buckets.values()) {
      const item = bucket[depth];
      if (!item) continue;
      output.push(item);
      added = true;
      if (output.length === limit) break;
    }
    if (!added) break;
    depth += 1;
  }
  return output;
}

function references(item: WatchItem) {
  return [...new Set([item.id, youtubeIdFromHref(item.href)].filter((ref): ref is string => Boolean(ref)))];
}

const FALLBACK_EVENT_POSTERS = [
  { title: "CORE Rug", src: "/brand/events-series-challenges/core-rug.png" },
  { title: "Basketball Segments", src: "/brand/events-series-challenges/basketball-segments.png" },
  { title: "Hot Ones", src: "/brand/events-series-challenges/hot-ones.png" },
  { title: "Caretakers", src: "/brand/events-series-challenges/caretakers.png" },
  { title: "StableRonaldo: 99 Kill Lead", src: "/brand/events-series-challenges/stable-99-kill-lead.png" },
  { title: "JasonTheWeen: Island Survivor", src: "/brand/events-series-challenges/jason-the-ween.png" },
  { title: "CORE Environment", src: "/brand/events-series-challenges/core-environment.png" },
] as const;

function EventsSeriesChallengesRail({ originals }: { originals: CoreOriginal[] }) {
  const posters = originals.length ? originals : FALLBACK_EVENT_POSTERS.map((poster, index) => ({
    id: poster.src,
    slug: poster.src.split("/").at(-1)?.replace(/\.png$/, "") ?? String(index),
    title: poster.title,
    posterUrl: poster.src,
  }));
  return (
    <section
      id="events-series-challenges"
      className="watch-events-series-section px-5 md:px-10"
      aria-labelledby="events-series-challenges-heading"
    >
      <div className="watch-shelf-heading mb-3 flex items-baseline gap-3">
        <h2
          id="events-series-challenges-heading"
          className="watch-shelf-title text-lg font-semibold tracking-tight text-[color:var(--ink)] md:text-xl"
        >
          CORE Originals
        </h2>
      </div>
      <div className="watch-events-series-rail" aria-label="Events, series, and challenges">
        {posters.map((poster, index) => (
          <Tooltip key={poster.id} title={poster.title} description="Open this CORE Original collection." placement="top" offset={10}>
            <Link
              href={`/originals/${poster.slug}` as never}
              className="watch-events-series-poster"
              aria-label={`Open CORE Original: ${poster.title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={poster.posterUrl}
                alt={poster.title}
                loading={index < 3 ? "eager" : "lazy"}
                draggable={false}
              />
              <span className="watch-events-series-poster-scrim" aria-hidden="true" />
              <span className="watch-events-series-poster-action" aria-hidden="true">
                <span>CORE Original</span>
                <strong>Open</strong>
              </span>
            </Link>
          </Tooltip>
        ))}
      </div>
    </section>
  );
}

export function WatchHome({ catalog, patreon, originals }: { catalog: WatchCatalog; patreon: PatreonShelfData; originals: CoreOriginal[] }) {
  const { ids: listIds, user, loading } = useMyList();
  const { map, ready } = useWatchProgress();
  const discovery = useWatchDiscovery();
  const [favoriteSlug, setFavoriteSlug] = useState<string | null>(null);
  const [affinityProgress, setAffinityProgress] = useState<WatchProgressMap>({});
  const affinityLoadedFor = useRef<string | null>(null);
  const [continueInHero, setContinueInHero] = useState(true);

  const all = useMemo(() => unique(catalog.all), [catalog.all]);
  const playable = useMemo(
    () => all.filter((item) => item.format !== "photo" && item.kind !== "post"),
    [all],
  );
  const userId = user?.id ?? null;

  // Capture the account's history once after hydration. Explicit Likes, saves,
  // and favorites still react immediately, while 15-second playback ticks do
  // not make visible rails jump around mid-session.
  useEffect(() => {
    if (!userId) {
      if (affinityLoadedFor.current !== null) {
        affinityLoadedFor.current = null;
        setAffinityProgress({});
      }
      return;
    }
    if (!ready || affinityLoadedFor.current === userId) return;
    affinityLoadedFor.current = userId;
    setAffinityProgress(map);
  }, [map, ready, userId]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const controller = new AbortController();
    if (!user) {
      setFavoriteSlug(null);
      return () => controller.abort();
    }
    setFavoriteSlug(null);
    fetch("/api/account/loyalty", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { favoriteMember?: string | null }) => {
        if (!cancelled) setFavoriteSlug(data.favoriteMember ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loading, user]);

  // This preference is account-scoped rather than a generic browser setting.
  // It lets a signed-in viewer keep the hero fully editorial while retaining
  // their Continue Watching rail lower on the page.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setContinueInHero(true);
      return;
    }
    let cancelled = false;
    fetch("/api/account/workspaces?kind=watch-home", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { items?: Array<{ name?: string; payload?: { continueWatchingInHero?: unknown } }> }) => {
        const stored = data.items?.find((item) => item.name === "home")?.payload;
        if (!cancelled) {
          setContinueInHero(stored?.continueWatchingInHero !== false);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loading, user]);

  const feedback = discovery.state.feedback;
  const affinity = useMemo(
    () => buildCreatorAffinity(all, {
      enabled: Boolean(
        userId &&
        ready &&
        discovery.ready &&
        affinityLoadedFor.current === userId
      ),
      favoriteSlug,
      feedback,
      itemReferences: references,
      progress: affinityProgress,
      savedItemIds: listIds,
    }),
    [affinityProgress, all, discovery.ready, favoriteSlug, feedback, listIds, ready, userId],
  );
  const recommendationAffinity = useMemo(
    () => userId
      ? affinity
      : buildCreatorAffinity(all, {
          enabled: ready && discovery.ready,
          feedback,
          itemReferences: references,
          progress: map,
        }),
    [affinity, all, discovery.ready, feedback, map, ready, userId],
  );
  const preferredMemberSlugs = useMemo(
    () => rankCreatorSlugs(catalog.byMember.map((member) => member.slug), affinity.scores),
    [affinity.scores, catalog.byMember],
  );
  const memberRows = useMemo(() => {
    const bySlug = new Map(catalog.byMember.map((member) => [member.slug, member]));
    return preferredMemberSlugs
      .map((slug) => bySlug.get(slug))
      .filter((member): member is WatchCatalog["byMember"][number] => Boolean(member));
  }, [catalog.byMember, preferredMemberSlugs]);

  const applyFilters = (items: WatchItem[]) => personalizeItems(items, feedback);
  const visible = (items: WatchItem[], limit = 24, rankCreators = true) => {
    const filtered = applyFilters(items);
    const ranked = affinity.personalized && rankCreators
      ? rankByCreatorAffinity(filtered, affinity.scores)
      : filtered;
    return balancedRail(ranked, limit);
  };
  const visibleShortForm = (items: WatchItem[], limit = 30) => {
    const filtered = applyFilters(items);
    const ranked = affinity.personalized
      ? rankByCreatorAffinity(filtered, affinity.scores)
      : filtered;
    return selectShortFormRailItems(ranked, limit);
  };

  const continueItems = useMemo(
    () => selectContinueWatchingItems(playable, map, references, { limit: 16 }),
    [map, playable],
  );

  const heroItems = useMemo(() => {
    const mainUploads = catalog.house.filter(
      (item) => item.kind === "youtube" && item.id !== "house-tour",
    );
    const latestCore =
      mainUploads.find((item) => item.format !== "short") ??
      mainUploads[0] ??
      catalog.billboard;
    return unique([
      ...(catalog.heroFeatured ?? []),
      ...buildWatchHeroItems(catalog.live, continueInHero ? continueItems : [], latestCore),
    ]).slice(0, 12);
  }, [catalog.billboard, catalog.heroFeatured, catalog.house, catalog.live, continueInHero, continueItems]);

  const personalized = useMemo(() => {
    if (!recommendationAffinity.personalized) return [];
    return rankByCreatorAffinity(
      playable
        .filter((item) => {
          if (item.programming?.community) return false;
          if (item.kind === "live" || item.format === "photo") return false;
          if (references(item).some((reference) => map[reference]?.completed)) return false;
          return (recommendationAffinity.scores.get(item.memberSlug ?? "house") ?? 0) > 0;
        }),
      recommendationAffinity.scores,
    );
  }, [map, playable, recommendationAffinity]);
  const latest = useMemo(
    () =>
      unique([...playable, ...latestUniqueXPosts(catalog.byPlatform.x)])
        .filter((item) => item.kind !== "live" && !item.programming?.community)
        .sort(
          (a, b) =>
            new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime(),
        ),
    [catalog.byPlatform.x, playable],
  );
  const longForm = catalog.videos;
  const quickHits = catalog.shorts;
  const displayedQuickHits = visibleShortForm(quickHits);
  const displayedContinue = visible(continueItems, 16, false);
  const displayedLatest = visible(latest);
  const xPosts = selectWatchHomeXPosts(
    {
      byMember: catalog.byMember,
      byPlatform: {
        ...catalog.byPlatform,
        x: applyFilters(catalog.byPlatform.x),
      },
    },
    { limit: 18, perMember: 3 },
  );
  const xSpaces = selectWatchHomeXSpaces({ byMember: catalog.byMember, byPlatform: catalog.byPlatform });
  const defaultRowOrder = [
    ...(displayedContinue.length ? ["continue"] : []),
    ...(personalized.length ? ["for-you"] : []),
    "latest",
  ];

  const handleFeedback = (item: WatchItem, value: WatchFeedbackValue | null) => {
    discovery.setFeedback(item.id, value);
  };
  const sharedShelfProps = {
    feedback,
    onFeedback: handleFeedback,
    hoverAutoplay: true,
  };
  return (
    <>
      <BillboardCarousel items={heroItems} />

      <div className="watch-content-rails relative z-10 flex flex-col gap-11 pb-24 pt-8 md:gap-14 md:pt-10">
        <div id="members" className="scroll-mt-28">
          <NetworkChannelRail
            variant="home"
            personalized={affinity.personalized}
            preferredMemberSlugs={preferredMemberSlugs}
          />
        </div>

        {catalog.live.length > 1 ? (
          <Shelf title="Live now" items={visible(catalog.live)} {...sharedShelfProps} />
        ) : null}

        <div className="w-full px-5 md:px-10">
          <SupporterCta placement="watch" />
        </div>

        {defaultRowOrder.map((rowId) => (
          <Fragment key={rowId}>
            {rowId === "continue" && ready && displayedContinue.length ? (
              <div id="continue" className="scroll-mt-28">
                <Shelf title="Continue watching" items={displayedContinue} {...sharedShelfProps} />
              </div>
            ) : null}
            {rowId === "latest" ? (
              <>
                <EventsSeriesChallengesRail originals={originals} />
                <div id="latest" className="scroll-mt-28">
                  <Shelf
                    title="Latest"
                    items={displayedLatest}
                    {...sharedShelfProps}
                  />
                </div>
              </>
            ) : null}
            {rowId === "for-you" && personalized.length ? (
              <Shelf title="For you" items={visible(personalized)} {...sharedShelfProps} />
            ) : null}
          </Fragment>
        ))}

        <section
          className="watch-creator-networks px-5 md:px-10"
          aria-labelledby="creator-networks-heading"
        >
          <div className="watch-shelf-heading watch-home-shelf-heading mb-3">
            <div className="watch-home-shelf-heading-copy">
              <h2
                id="creator-networks-heading"
                className="watch-shelf-title text-lg font-semibold tracking-tight text-[color:var(--ink)] md:text-xl"
              >
                Meet the creators
              </h2>
            </div>
          </div>
          <div className="watch-creator-network-grid">
            {MEMBERS.map((member) => (
              <Link
                key={member.slug}
                href={`/channels/${member.slug}` as never}
                className="watch-creator-network-poster"
                aria-label={`Open ${member.stageName}'s network`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={member.portrait} alt="" />
                <span>{member.stageName}</span>
              </Link>
            ))}
          </div>
        </section>

        {(catalog.programmingSections ?? []).map((section) => {
          const useVertical = section.layout === "vertical" || (
            section.layout === "auto" &&
            section.items.filter((item) => item.format === "short" || item.orientation === "portrait").length >=
              Math.ceil(section.items.length / 2)
          );
          return <Shelf
            key={section.id}
            title={section.title}
            kicker={section.kicker}
            items={useVertical ? visibleShortForm(section.items, 30) : visible(section.items, 30, false)}
            variant={useVertical ? "vertical" : undefined}
            {...sharedShelfProps}
          />;
        })}

        <XTweetsRail items={xPosts} spaces={xSpaces} />

        <Shelf
          title="From the CORE House"
          items={visible(catalog.house, 30)}
          {...sharedShelfProps}
        />

        <div id="videos" className="scroll-mt-28">
          <Shelf title="Videos & episodes" items={visible(longForm, 30)} {...sharedShelfProps} />
        </div>

        <PatreonLockedShelf data={patreon} />

        <Shelf
          title="Past broadcasts"
          items={visible(catalog.broadcasts, 30)}
          {...sharedShelfProps}
        />
        <Shelf
          title="Shorts, reels & TikToks"
          items={displayedQuickHits}
          variant="vertical"
          {...sharedShelfProps}
        />
        <div id="clips" className="scroll-mt-28">
          <Shelf title="Clips" kicker="The moments people kept" items={visible(catalog.clips)} {...sharedShelfProps} />
        </div>
        <div id="photos" className="scroll-mt-28">
          <Shelf title="Photos" items={visible(catalog.photos, 30)} {...sharedShelfProps} />
        </div>

        {memberRows.map((member) => (
          <Shelf
            key={member.slug}
            title={member.label}
            items={visible(member.items, 30)}
            {...sharedShelfProps}
          />
        ))}
      </div>
      <WatchLegalFooter />
    </>
  );
}
