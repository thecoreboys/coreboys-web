"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { MEMBERS_BY_LOGIN } from "@/lib/members-helpers";
import { LiveDot } from "@/components/ui/LiveDot";
import { formatHandleDisplay } from "@/lib/watch/display-label";

export function LiveRibbon() {
  const pathname = usePathname();
  const { data } = useLiveStatus();
  const ribbonRef = useRef<HTMLDivElement>(null);

  const live = useMemo(
    () => (data?.live ?? []).filter((e) => e.isLive),
    [data],
  );

  const hidden =
    live.length === 0 ||
    pathname === "/chat" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/admin") ||
    pathname === "/" ||
    pathname.startsWith("/guide") ||
    // Network pages already have an on-air state in their hero and schedule.
    // Keeping the global people-live ribbon there duplicates that information
    // immediately under the navbar and pushes the station dial off-center.
    pathname.startsWith("/channels/");

  useEffect(() => {
    const update = () => document.documentElement.style.setProperty("--live-ribbon-h", `${hidden ? 0 : ribbonRef.current?.getBoundingClientRect().height ?? 0}px`);
    update();
    const observer = new ResizeObserver(update);
    if (ribbonRef.current) observer.observe(ribbonRef.current);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--live-ribbon-h", "0px");
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <div
      ref={ribbonRef}
      role="status"
      aria-live="polite"
      className="flex h-11 items-center border-t border-[color:var(--rule)] bg-[color:var(--bg)]/90 px-4 backdrop-blur-md sm:h-9 sm:px-6 md:px-8"
    >
      <div className="mx-auto flex min-h-9 w-full max-w-container items-center gap-3 overflow-hidden text-xs text-[color:var(--ink)]">
        <LiveDot live />
        <span className="shrink-0 font-mono uppercase tracking-[0.16em]">Live</span>
        <ul aria-label="Live creators" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {live.map((e) => {
            const member = MEMBERS_BY_LOGIN.get(e.login.toLowerCase());
            const name = member?.stageName ?? formatHandleDisplay(e.login);
            return (
              <li key={e.login} className="shrink-0">
                <Link
                  href={`/watch/live/${e.login}` as never}
                  className="inline-flex min-h-10 items-center rounded-full px-2.5 font-medium hover:bg-[color:var(--surface)] sm:min-h-8"
                >
                  {name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
