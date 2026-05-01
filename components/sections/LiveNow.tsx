"use client";

import Image from "next/image";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import { MEMBERS } from "@/lib/members";
import { formatViewerCount } from "@/lib/utils";
import { LiveDot } from "@/components/ui/LiveDot";
import { Display, Eyebrow } from "@/components/typography";
import { SectionNumber } from "@/components/editorial/SectionNumber";
import { StreamContext } from "@/components/concierge/StreamContext";

export function LiveNow() {
  const { data, error, isLoading, mutate } = useLiveStatus();

  const liveEntries = data?.live.filter((l) => l.isLive) ?? [];
  const memberByLogin = new Map(
    MEMBERS.map((m) => [m.twitchLogin.toLowerCase(), MEMBERS_BY_SLUG[m.slug]!]),
  );

  return (
    <section id="live" className="relative w-full bg-[color:var(--bg)] py-28 md:py-36 rule">
      <SectionNumber index={4} label="Live Now" />
      <div className="mx-auto max-w-[1440px] px-6 md:px-16">
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow className="mb-3">Live now</Eyebrow>
            <Display as="h2" size={48} className="md:text-[72px]">
              {liveEntries.length > 0 ? "Streaming, right now." : "The core is quiet."}
            </Display>
          </div>
          {data ? (
            <Eyebrow className="hidden md:block">
              Updated {new Date(data.fetchedAt).toLocaleTimeString()}
            </Eyebrow>
          ) : null}
        </div>

        <div className="mt-12">
          {error ? (
            <div className="flex items-center justify-between border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-6 py-5">
              <span className="text-sm text-[color:var(--ink-dim)]">
                Couldn&apos;t reach Twitch. The boys are still real.
              </span>
              <button
                onClick={() => void mutate()}
                className="kicker text-[color:var(--ink)] underline-offset-4 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : isLoading && !data ? (
            <SkeletonRail />
          ) : liveEntries.length === 0 ? (
            <div className="flex items-center gap-3 text-[color:var(--ink-dim)]">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--ink-dim)]/60 animate-pulse" />
              <span className="text-sm">No one is live. Check back soon.</span>
            </div>
          ) : (
            <ul className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {liveEntries.map((entry) => {
                const member = memberByLogin.get(entry.login.toLowerCase());
                if (!member) return null;
                return (
                  <li
                    key={entry.login}
                    className="snap-start shrink-0 w-[88vw] sm:w-[420px]"
                  >
                    <a
                      href={`https://www.twitch.tv/${entry.login}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition hover:border-[color:var(--ink)]/40"
                    >
                      <div className="relative aspect-video w-full overflow-hidden">
                        {entry.thumbnailUrl ? (
                          <Image
                            src={entry.thumbnailUrl}
                            alt={entry.title ?? `${member.stageName} live`}
                            fill
                            sizes="(min-width: 640px) 420px, 92vw"
                            className="object-cover transition-transform duration-700 [transition-timing-function:var(--ease-expo-out)] group-hover:scale-[1.04]"
                            unoptimized
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center bg-[color:var(--bg)] text-[color:var(--ink-dim)]">
                            No preview
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--bg-elev)]/80 via-transparent to-transparent" />
                        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-[color:var(--bg)]/80 px-3 py-1 backdrop-blur">
                          <LiveDot live />
                          <span className="text-[10px] uppercase tracking-[0.18em]">Live</span>
                        </div>
                        {typeof entry.viewerCount === "number" ? (
                          <div className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full bg-[color:var(--bg)]/80 px-3 py-1 text-xs backdrop-blur">
                            {formatViewerCount(entry.viewerCount)} watching
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 p-5">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-base font-semibold tracking-tight">{member.stageName}</div>
                            <div className="kicker mt-1 truncate text-[10px]">{entry.title ?? "Streaming"}</div>
                          </div>
                          <span
                            className="kicker text-[10px] text-[color:var(--ink)] opacity-70 transition-opacity group-hover:opacity-100"
                            style={{ color: member.accent }}
                          >
                            Watch ↗
                          </span>
                        </div>
                        <StreamContext login={entry.login} />
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function SkeletonRail() {
  return (
    <ul className="flex gap-5 overflow-hidden">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="aspect-video w-[420px] shrink-0 animate-pulse border border-[color:var(--rule)] bg-[color:var(--bg-elev)]"
        />
      ))}
    </ul>
  );
}
