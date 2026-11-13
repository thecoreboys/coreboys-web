"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import type { CSSProperties } from "react";
import type { WeeklyTopClip } from "@/lib/watch/weekly-top-clips";
import { DragScrollRail } from "./DragScrollRail";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function WeeklyTopClips({ clips }: { clips: WeeklyTopClip[] }) {
  if (clips.length === 0) return null;
  return (
    <section
      id="most-watched-this-week"
      className="watch-weekly-clips scroll-mt-28 px-5 md:px-10"
      aria-labelledby="most-watched-this-week-heading"
    >
      <div className="watch-shelf-heading mb-3 flex items-baseline gap-3">
        <h2
          id="most-watched-this-week-heading"
          className="watch-shelf-title text-lg font-semibold tracking-tight text-[color:var(--ink)] md:text-xl"
        >
          Most watched this week
        </h2>
        <span className="watch-weekly-clips-kicker">Top Twitch clip from each channel</span>
      </div>
      <DragScrollRail className="watch-weekly-clips-rail" aria-label="Most watched Twitch clips this week" tabIndex={0} alwaysShowArrows>
        {clips.map((clip, index) => {
          const duration = formatDuration(clip.durationSeconds);
          return (
            <Link
              key={clip.id}
              href={clip.href as never}
              prefetch={false}
              className="watch-weekly-clip"
              style={{ "--clip-accent": clip.accent } as CSSProperties}
              aria-label={`${clip.memberLabel}'s most watched clip this week: ${clip.title}, ${compact.format(clip.viewCount)} views`}
            >
              <span className="watch-weekly-clip-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={clip.thumbnailUrl} alt="" loading={index < 3 ? "eager" : "lazy"} decoding="async" draggable={false} />
                <span className="watch-weekly-clip-scrim" aria-hidden="true" />
                <span className="watch-weekly-clip-rank" aria-hidden="true">#{index + 1}</span>
                <span className="watch-weekly-clip-views" aria-hidden="true">
                  <Eye size={13} strokeWidth={2.4} />
                  {compact.format(clip.viewCount)}
                </span>
                {duration ? <span className="watch-weekly-clip-duration" aria-hidden="true">{duration}</span> : null}
              </span>
              <span className="watch-weekly-clip-meta">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="watch-weekly-clip-avatar" src={clip.portrait} alt="" loading="lazy" decoding="async" draggable={false} />
                <span className="watch-weekly-clip-copy">
                  <strong>{clip.title}</strong>
                  <span>{clip.memberLabel}{clip.clippedBy ? ` · clipped by ${clip.clippedBy}` : ""}</span>
                </span>
              </span>
            </Link>
          );
        })}
      </DragScrollRail>
    </section>
  );
}
