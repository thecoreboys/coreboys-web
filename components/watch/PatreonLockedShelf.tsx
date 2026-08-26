"use client";

import Image from "next/image";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import type { PatreonLockedItem, PatreonShelfData } from "@/lib/watch/types";
import { BrowserDateTime } from "@/components/ui/BrowserDateTime";
import { DragScrollRail } from "./DragScrollRail";

function LockedCard({ item, index }: { item: PatreonLockedItem; index: number }) {
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Exclusive video: ${item.title}. Locked on Patreon; opens in a new tab.`}
      className="watch-home-promo-card watch-patreon-card group/card"
      data-patreon-kind="video"
    >
      {item.thumbnailUrl ? (
        <Image
          src={item.thumbnailUrl}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 639px) 82vw, (max-width: 1023px) 44vw, 22vw"
          className="object-cover transition duration-500 group-hover/card:scale-[1.025]"
          referrerPolicy="no-referrer"
          draggable={false}
        />
      ) : (
        <div
          className={`absolute inset-0 ${index % 3 === 0 ? "bg-gradient-to-br from-[#ff5a5f]/35 via-[#4b1f31] to-[#111]" : index % 3 === 1 ? "bg-gradient-to-br from-[#8b5cf6]/35 via-[#2e213f] to-[#111]" : "bg-gradient-to-br from-[#22c55e]/25 via-[#17353d] to-[#111]"}`}
          aria-hidden="true"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <span className="rounded-full bg-black/60 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/85 ring-1 ring-white/15 backdrop-blur-md sm:text-[10px]">
          Exclusive video
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/70 text-white ring-1 ring-white/20 backdrop-blur-md">
          <LockKeyhole className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Locked</span>
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
        <p className="line-clamp-2 text-sm font-semibold leading-snug tracking-[-0.01em] text-white">
          {item.title}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium text-white/65 sm:text-[11px]">
          <span>CORE · Patreon</span>
          {item.publishedAt ? (
            <>
              <span aria-hidden>·</span>
              <BrowserDateTime
                value={item.publishedAt}
                fallback=""
                options={{ month: "short", day: "numeric" }}
              />
            </>
          ) : null}
        </p>
      </div>
    </a>
  );
}

function UnlockCard({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="watch-home-promo-card watch-patreon-card watch-patreon-unlock"
      aria-label="Unlock CORE member content on Patreon. Opens in a new tab."
    >
      <span className="watch-patreon-unlock-icon" aria-hidden="true">
        <LockKeyhole className="size-5" />
      </span>
      <span>
        <strong>Unlock on Patreon</strong>
        <small>Join CORE on Patreon to unlock members-only posts.</small>
      </span>
      <ArrowUpRight className="size-4" aria-hidden="true" />
    </a>
  );
}

/**
 * Public teaser metadata only. Titles, thumbnails and destinations are safe to
 * show here; entitlement and the protected media stay entirely on Patreon.
 */
export function PatreonLockedShelf({ data }: { data: PatreonShelfData }) {
  return (
    <section id="patreon" className="watch-shelf-section watch-patreon-shelf px-5 md:px-10" aria-labelledby="patreon-preview-title">
      <div className="watch-shelf-heading watch-home-shelf-heading mb-3">
        <div className="watch-home-shelf-heading-copy">
          <h2
            id="patreon-preview-title"
            className="watch-shelf-title text-lg font-semibold tracking-tight text-[color:var(--ink)] md:text-xl"
          >
            Inside CORE
          </h2>
        </div>
      </div>
      <DragScrollRail
        className="watch-shelf watch-home-promo-rail"
        tabIndex={0}
        aria-label="CORE exclusive Patreon videos"
      >
        {data.items.map((item, index) => (
          <LockedCard key={item.id} item={item} index={index} />
        ))}
        <UnlockCard href={data.campaignHref} />
      </DragScrollRail>
    </section>
  );
}
