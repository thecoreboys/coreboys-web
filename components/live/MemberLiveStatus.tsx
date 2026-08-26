"use client";

import Link from "next/link";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { LiveDot } from "@/components/ui/LiveDot";
import { formatViewerCount } from "@/lib/utils";
import type { LiveEntry } from "@/lib/twitch";
import { MemberPulse } from "@/components/watch/MemberPulse";

export type MemberLiveStatusProps = {
  login: string;
  slug?: string;
  initial?: LiveEntry;
};

export function MemberLiveStatus({ login, slug, initial }: MemberLiveStatusProps) {
  const { data } = useLiveStatus();
  const entry =
    data?.live.find((e) => e.login.toLowerCase() === login.toLowerCase()) ?? initial;
  const isLive = entry?.isLive ?? false;

  if (!isLive) {
    if (!slug) return null;
    return <MemberPulse slug={slug} login={login} href={`/watch/network/${slug}`} />;
  }

  return (
    <div className="flex flex-col gap-1.5">
    <Link
      href={slug ? `/watch/live/${login}` : "/watch"}
      className="inline-flex min-h-11 items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink)]"
    >
      <LiveDot live />
      Live
      {entry?.title ? (
        <span className="max-w-[40ch] truncate normal-case tracking-normal text-[color:var(--ink-dim)]">
          {entry.title}
        </span>
      ) : null}
      {entry?.viewerCount != null ? (
        <span className="tabular-nums text-[color:var(--ink-dim)]">
          {formatViewerCount(entry.viewerCount)}
        </span>
      ) : null}
      <span className="inline-block h-px w-8 bg-current" />
      Watch
    </Link>
    {slug ? <MemberPulse slug={slug} login={login} /> : null}
    </div>
  );
}
