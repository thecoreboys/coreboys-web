"use client";

import { useState } from "react";
import type { FeedItem, SocialPlatform } from "./types";
import { cn } from "@/lib/utils";
import { FeedCard, FeedPlatformEmpty } from "./FeedCard";

type FeedKey = "house" | "core";

type FeedTab = {
  key: FeedKey;
  label: string;
  blurb: string;
  items: FeedItem[];
  /** Platforms whose fetcher is stubbed → render an empty-state tile. */
  stubbed: SocialPlatform[];
};

/**
 * Segmented switch between the HOUSE feed (all members) and the CORE
 * (org account) feed. Both lists are fetched on the server and handed in;
 * this only toggles which grid is shown. UUI segmented control styling.
 */
export function FeedSwitcher({
  house,
  core,
  houseStubbed,
  coreStubbed,
}: {
  house: FeedItem[];
  core: FeedItem[];
  houseStubbed: SocialPlatform[];
  coreStubbed: SocialPlatform[];
}) {
  const [active, setActive] = useState<FeedKey>("house");

  const houseTab: FeedTab = {
    key: "house",
    label: "House",
    blurb: "The latest across every member's socials — merged, newest first.",
    items: house,
    stubbed: houseStubbed,
  };
  const coreTab: FeedTab = {
    key: "core",
    label: "CORE",
    blurb: "Straight from the CORE org account across every platform.",
    items: core,
    stubbed: coreStubbed,
  };
  const tabs: FeedTab[] = [houseTab, coreTab];
  const current: FeedTab = active === "core" ? coreTab : houseTab;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* UUI-style segmented control */}
        <div
          role="tablist"
          aria-label="Choose a feed"
          className="inline-flex rounded-lg bg-secondary p-1 ring-1 ring-inset ring-secondary shadow-xs"
        >
          {tabs.map((t) => {
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(t.key)}
                className={cn(
                  "cursor-pointer rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary shadow-xs ring-1 ring-inset ring-secondary"
                    : "text-tertiary hover:text-primary",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="max-w-[52ch] text-sm leading-relaxed text-tertiary">{current.blurb}</p>
      </div>

      {current.items.length === 0 && current.stubbed.length === 0 ? (
        <div className="rounded-xl bg-secondary p-10 text-center ring-1 ring-inset ring-secondary shadow-xs">
          <p className="text-sm leading-relaxed text-tertiary">
            Nothing to show right now. Check back after the next refresh.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {current.items.map((it) => (
            <li key={it.id}>
              <FeedCard item={it} />
            </li>
          ))}
          {current.stubbed.map((p) => (
            <li key={`stub-${p}`}>
              <FeedPlatformEmpty platform={p} className="h-full" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
