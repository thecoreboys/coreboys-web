"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { Eyebrow } from "@/components/typography";
import { SectionNumber } from "@/components/editorial/SectionNumber";
import { LiveDot } from "@/components/ui/LiveDot";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { MEMBERS_BY_LOGIN } from "@/lib/members-helpers";
import type { FeedItem } from "@/components/feed/types";
import type { LiveEntry } from "@/lib/twitch";

function cinemaThumb(entry: LiveEntry): string | null {
  if (!entry.thumbnailUrl) return null;
  return entry.thumbnailUrl.replace("640x360", "1280x720");
}

function filmDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function FeaturedWatchFrame({ film }: { film: FeedItem | null }) {
  const { data } = useLiveStatus();
  const liveAll = useMemo(() => {
    return (data?.live ?? []).filter((e) => e.isLive);
  }, [data]);

  if (!film && liveAll.length === 0) return null;

  return (
    <section id="watch" className="relative w-full bg-[color:var(--bg)] py-28 md:py-36 rule">
      <SectionNumber index={2} label="Watch" />
      <div className="mx-auto max-w-container px-6 md:px-16">
        <Eyebrow className="mb-8">{liveAll.length > 0 ? "On air" : "From the house"}</Eyebrow>

        {liveAll.length > 0 ? (
          <ul className={`mb-14 grid gap-4 ${liveAll.length === 1 ? "grid-cols-1" : liveAll.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
            {liveAll.map((entry) => {
              const member = MEMBERS_BY_LOGIN.get(entry.login.toLowerCase());
              const thumb = cinemaThumb(entry);
              return (
                <li key={entry.login}>
                  <Link
                    href={`/watch/live/${entry.login}` as never}
                    className="group block outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--core)]"
                  >
                    <div className="relative aspect-video overflow-hidden bg-[color:var(--bg-elev)]">
                      {thumb ? (
                        <Image src={thumb} alt="" fill sizes="50vw" className="object-cover" unoptimized />
                      ) : null}
                      <span className="absolute left-3 top-3 inline-flex items-center gap-2">
                        <LiveDot live />
                        <span className="font-mono text-xs uppercase tracking-[0.18em] text-white">Live</span>
                      </span>
                    </div>
                    <div className="mt-4">
                      <h2 className="font-display text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                        {member?.stageName ?? entry.login}
                      </h2>
                      <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                        {entry.title ?? "On air"}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        {film ? (
          <Link
            href="/videos"
            className="group block outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--core)]"
          >
            <div className="relative aspect-video overflow-hidden bg-[color:var(--bg-elev)]">
              {film.thumbnailUrl ? (
                <Image
                  src={film.thumbnailUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1440px) 1440px, 100vw"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="mt-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <h2 className="max-w-3xl font-display text-2xl font-semibold tracking-tight text-[color:var(--ink)] md:text-[32px] md:leading-9">
                {film.title}
              </h2>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                {film.authorLabel}
                {film.publishedAt ? ` · ${filmDate(film.publishedAt)}` : ""}
              </p>
            </div>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
