"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { useStreamSessions } from "@/hooks/useStreamSessions";
import { formatAirtime } from "@/lib/watch/airtime";
import { MEMBERS } from "@/lib/members";
import { cn } from "@/lib/utils";
import { rememberedFor } from "@/lib/watch/live-memory";

export function MemberPulse({
  slug,
  login,
  className,
  href,
}: {
  slug: string;
  login?: string;
  className?: string;
  href?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { data } = useLiveStatus();
  const { sessions, daily, latestBySlug } = useStreamSessions("7d");
  const member = MEMBERS.find((m) => m.slug === slug);
  const twitch = (login ?? member?.twitchLogin ?? "").toLowerCase();
  const live = (data?.live ?? []).find((e) => e.isLive && e.login.toLowerCase() === twitch);
  const last = latestBySlug(slug);
  const memory = rememberedFor(twitch);
  const weekMinutes = daily
    .filter((d) => d.slug === slug)
    .reduce((sum, d) => sum + d.minutes, 0);
  const weekSessions = sessions.filter((s) => s.slug === slug).length;

  // The live/session hooks hydrate from a client-side cache. Keep the server
  // and first client render identical, then reveal the pulse once mounted.
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const line = live
    ? "Live now"
    : last || memory?.startedAt
      ? "Recent stream"
      : weekMinutes > 0
        ? "Active this week"
        : null;

  if (!line && weekSessions === 0) return null;

  const text = line ?? "On the board";
  const cls = cn(
    "text-[11px] tracking-tight text-[color:var(--ink-faint)]",
    live ? "font-semibold text-[color:var(--live)]" : "",
    className,
  );

  if (href) {
    return (
      <Link href={href as never} className={cn(cls, "hover:text-[color:var(--ink-dim)]")}>
        {text}
      </Link>
    );
  }
  return <p className={cls}>{text}</p>;
}

export function HouseWeekPulse({ className = "" }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const { sessions, daily } = useStreamSessions("7d");
  const { data } = useLiveStatus();
  const liveCount = (data?.live ?? []).filter((e) => e.isLive).length;
  const minutes = daily.reduce((sum, d) => sum + d.minutes, 0);
  const nights = sessions.length;
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (liveCount === 0 && minutes === 0 && nights === 0) return null;
  return (
    <p className={cn("text-[12px] tabular-nums text-[color:var(--ink-dim)]", className)}>
      {liveCount > 0 ? `${liveCount} live now · ` : ""}
      {minutes > 0 ? `${formatAirtime(minutes)} on air this week` : `${nights} session${nights === 1 ? "" : "s"} logged`}
    </p>
  );
}
