"use client";

import Image from "next/image";
import { useMemo } from "react";
import { ExternalLink, Tv } from "lucide-react";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { LiveDot } from "@/components/ui/LiveDot";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { MEMBERS_BY_LOGIN } from "@/lib/members-helpers";
import { formatViewerCount } from "@/lib/utils";
import { formatHandleDisplay } from "@/lib/watch/display-label";

/**
 * Pinned-to-the-corner live hero overlay. Fades in over the existing
 * <CoreScene> 3D canvas when someone goes live.
 *
 * Behavior:
 *   - 0 live  → component renders nothing, hero is the canvas.
 *   - 1 live  → bottom-left glass panel with the member's portrait,
 *               game, viewer ticker, "Watch on Twitch" CTA.
 *   - 2+ live → split-screen-style stack of compact panels.
 *
 * The overlay sits at the bottom of the hero so it doesn't fight the 3D
 * focal point, and uses backdrop-blur + member's accent rule to feel
 * like a luxury HUD rather than a sponsor banner.
 */
export function HeroLiveOverlay() {
  const { data } = useLiveStatus();
  const liveEntries = useMemo(
    () => (data?.live ?? []).filter((e) => e.isLive),
    [data],
  );
  if (liveEntries.length === 0) return null;

  const isMulti = liveEntries.length > 1;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-end px-6 pb-8 md:px-16 md:pb-12"
      data-multi={isMulti ? "1" : "0"}
    >
      <div
        className={`pointer-events-auto flex flex-col gap-2 ${isMulti ? "max-w-[420px]" : "max-w-[420px]"}`}
      >
        {liveEntries.slice(0, 3).map((entry) => {
          const member = MEMBERS_BY_LOGIN.get(entry.login.toLowerCase());
          const accent = member?.accent ?? "var(--core)";
          return (
            <a
              key={entry.login}
              href={`https://twitch.tv/${entry.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center gap-3 overflow-hidden rounded-xl border bg-black/55 p-3 backdrop-blur-md transition-all hover:bg-black/75"
              style={{
                borderColor: `${accent}66`,
                boxShadow: `0 0 32px -16px ${accent}aa, inset 0 0 0 1px ${accent}22`,
              }}
              aria-label={`Watch ${member?.stageName ?? formatHandleDisplay(entry.login)} on Twitch`}
            >
              {member ? (
                <span
                  className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border"
                  style={{ borderColor: accent }}
                >
                  <Image
                    src={member.portrait}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <LiveDot live className="!h-1.5 !w-1.5" />
                  <span
                    className="text-xs font-semibold uppercase tracking-[0.16em]"
                    style={{ color: accent }}
                  >
                    Live now
                  </span>
                </div>
                <p className="mt-0.5 truncate font-display text-lg font-semibold leading-tight tracking-tight text-white">
                  {member?.stageName ?? formatHandleDisplay(entry.login)}
                </p>
                <p className="mt-0.5 truncate text-xs uppercase tracking-[0.12em] text-white/70">
                  {entry.game ?? "Streaming"}
                  {entry.viewerCount != null ? (
                    <>
                      {" · "}
                      <AnimatedNumber
                        value={entry.viewerCount}
                        format={formatViewerCount}
                        className="text-white/90"
                      />{" "}
                      watching
                    </>
                  ) : null}
                </p>
              </div>
              <span
                className="ml-1 hidden items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium uppercase tracking-[0.12em] sm:inline-flex"
                style={{ borderColor: accent, color: accent }}
              >
                <Tv size={12} /> Watch <ExternalLink size={11} />
              </span>
            </a>
          );
        })}
        {liveEntries.length > 3 ? (
          <p className="text-right text-xs font-medium uppercase tracking-[0.14em] text-white/60">
            +{liveEntries.length - 3} more in the live bar above
          </p>
        ) : null}
      </div>
    </div>
  );
}
