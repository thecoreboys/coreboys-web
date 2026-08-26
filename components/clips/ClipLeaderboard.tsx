"use client";

import { useEffect, useState } from "react";
import { Trophy01, ArrowUp } from "@untitledui/icons";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { Badge } from "@/components/base/badges/badges";
import { ExternalClipLink } from "@/components/clips/ClipEmbed";
import type { Clip } from "@/lib/clips";
import { cx } from "@/utils/cx";

type LeaderboardClip = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  url: string;
  votes: number;
};

// Podium tints — #1 takes the Ironbow brand magenta (decorative accent,
// not a live/error red), #2 gold, #3 neutral silver.
const RANK_TINT = ["#db0368", "#f59e0b", "#a1a1aa"] as const;

/**
 * "Top clips this week" — GET /api/community/clips/leaderboard. Renders an
 * Untitled UI ranked list with rank chips + upvote counts. Hidden entirely
 * when no clip has any upvotes yet, so the section never shows empty.
 */
export function ClipLeaderboard({ clips }: { clips: Clip[] }) {
  const [rows, setRows] = useState<LeaderboardClip[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/community/clips/leaderboard?window=week", {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((d: { clips: LeaderboardClip[] }) => {
        if (!cancelled) setRows(d.clips ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null || rows.length === 0) return null;

  // Pull aspect/source from the loaded clip set for the external link.
  const bySrc = new Map(clips.map((c) => [c.id, c]));

  return (
    <section className="mb-10 overflow-hidden rounded-2xl border border-secondary bg-secondary shadow-lg">
      <div className="flex items-center gap-3 border-b border-secondary p-5">
        <FeaturedIcon icon={Trophy01} size="lg" color="brand" theme="modern" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-primary">
            Top clips this week
          </h2>
          <p className="text-sm text-tertiary">Ranked by fan upvotes · last 7 days</p>
        </div>
      </div>
      <ol className="flex flex-col divide-y divide-[color:var(--color-border-secondary)]">
        {rows.map((row, i) => {
          const tint = RANK_TINT[i] ?? undefined;
          const clip = bySrc.get(row.id);
          return (
            <li
              key={row.id}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-primary"
            >
              <span
                className={cx(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ring-1 ring-inset",
                  i < 3 ? "text-white" : "bg-primary text-secondary ring-secondary",
                )}
                style={
                  i < 3
                    ? { background: tint, boxShadow: `0 0 0 1px ${tint}55` }
                    : undefined
                }
                aria-label={`Rank ${i + 1}`}
              >
                {i + 1}
              </span>
              {row.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.thumbnailUrl}
                  alt=""
                  className="h-12 w-20 shrink-0 rounded-lg border border-secondary object-cover"
                />
              ) : (
                <span className="h-12 w-20 shrink-0 rounded-lg border border-secondary bg-primary" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-primary">{row.title}</p>
                {clip ? (
                  <div className="mt-1">
                    <ExternalClipLink clip={clip} />
                  </div>
                ) : null}
              </div>
              <Badge type="pill-color" color="brand" size="lg" className="gap-1 tabular-nums">
                <ArrowUp className="size-3.5 stroke-3" />
                {row.votes}
              </Badge>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
