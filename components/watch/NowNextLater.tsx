"use client";

import Link from "next/link";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { MEMBERS } from "@/lib/members";
import { programFingerprint } from "@/lib/watch/edition";
import { SessionStamp } from "./LiveAirtime";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { formatHandleDisplay } from "@/lib/watch/display-label";

export function NowNextLater() {
  const { data } = useLiveStatus();
  const player = usePlayer();
  const live = (data?.live ?? []).filter((e) => e.isLive);

  return (
    <div className="watch-desk mx-5 px-4 py-4 md:mx-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="watch-kicker">Now</p>
          <p className="mt-1 text-xl font-bold tracking-tight">
            {live.length === 0
              ? "Nobody is live"
              : live.length === 1
                ? "1 live"
                : `${live.length} live`}
          </p>
        </div>
        <Link href="/guide" className="text-xs uppercase tracking-widest text-[color:var(--ink-faint)] hover:text-[color:var(--core)]">
          Guide
        </Link>
      </div>
      {live.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {live.map((e) => {
            const m = MEMBERS.find((x) => x.twitchLogin.toLowerCase() === e.login.toLowerCase());
            return (
              <li key={e.login}>
                <Link
                  href={`/watch/live/${e.login}` as never}
                  onClick={(ev) => {
                    ev.preventDefault();
                    if (!m) return;
                    player.play({
                      id: `live-${m.slug}`,
                      kind: "live",
                      platform: "twitch",
                      title: e.title || `${m.stageName} is live`,
                      poster: e.thumbnailUrl || m.portrait,
                      backdrop: e.thumbnailUrl || m.portrait,
                      memberSlug: m.slug,
                      memberLabel: m.stageName,
                      accent: m.accent,
                      href: `/watch/live/${e.login}`,
                      live: { login: e.login, viewers: e.viewerCount, game: e.game, startedAt: e.startedAt },
                      format: "live",
                    });
                  }}
                  className="block rounded-xl bg-white/5 px-3 py-3 ring-1 ring-white/10 transition hover:bg-white/10"
                >
                  <p className="text-sm font-semibold">{m?.stageName ?? formatHandleDisplay(e.login)}</p>
                  <p className="mt-1 truncate text-[11px] text-white/45">{e.title || "On air"}</p>
                  <SessionStamp
                    live={{ startedAt: e.startedAt }}
                    className="mt-1 block truncate text-[10px] tabular-nums text-[color:var(--ink-faint)]"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-white/35">Unclaimed hour · {programFingerprint("dark")}</p>
      )}
    </div>
  );
}
