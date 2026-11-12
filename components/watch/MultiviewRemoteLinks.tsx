"use client";

import { ArrowUpRight, MonitorPlay, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRemoteMobileScreen, useRemoteSessions } from "@/hooks/useMultiviewRemote";
import { MULTIVIEW_REMOTE_PATH } from "@/lib/watch/multiview-remote";

function useMobileRemoteDiscovery() {
  const { user } = useAuth();
  const mobile = useRemoteMobileScreen();
  const pathname = usePathname();
  const accountId = mobile && pathname !== MULTIVIEW_REMOTE_PATH ? user?.id ?? null : null;
  return { accountId, ...useRemoteSessions(accountId) };
}

export function MultiviewRemoteBanner() {
  const { accountId, data, error } = useMobileRemoteDiscovery();
  const storageKey = accountId ? `core-multiview-dismissed:${accountId}` : null;
  const [dismissal, setDismissal] = useState<{ key: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    const read = () => {
      let ids: string[] = [];
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        if (Array.isArray(stored)) ids = stored.filter((item) => typeof item === "string");
      } catch { /* Continue without storage. */ }
      setDismissal({ key: storageKey, ids });
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, [storageKey]);

  if (!storageKey || dismissal?.key !== storageKey || error || !data) return null;
  const liveSessions = data.filter((session) => session.main !== null);
  if (!liveSessions.some((session) => !dismissal.ids.includes(session.id))) return null;

  return (
    <div className="border-b border-indigo-400/20 bg-[#171524] text-white">
      <div className="mx-auto flex max-w-container items-center gap-1 px-4 sm:px-6">
        <Link prefetch={false} href={{ pathname: MULTIVIEW_REMOTE_PATH }} className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 py-2 text-sm font-semibold">
          <MonitorPlay className="size-4 shrink-0 text-indigo-200" aria-hidden />
          <span>Control Multiview Session</span>
          <ArrowUpRight className="ml-auto size-4 shrink-0 text-indigo-200" aria-hidden />
        </Link>
        <button
          type="button"
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss Multiview session prompt"
          onClick={() => {
            const ids = liveSessions.map(({ id }) => id);
            setDismissal({ key: storageKey, ids });
            try { localStorage.setItem(storageKey, JSON.stringify(ids)); } catch { /* Keep this dismissal in memory. */ }
          }}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function MultiviewRemoteMenuLink({ onNavigate }: { onNavigate: () => void }) {
  const { accountId, data } = useMobileRemoteDiscovery();
  if (!accountId) return null;
  const label = data ? data.length ? "Control Multiview" : "Start a Multiview" : "Multiview remote";
  return (
    <Link
      prefetch={false}
      href={{ pathname: MULTIVIEW_REMOTE_PATH }}
      onClick={onNavigate}
      className="mb-5 flex min-h-12 items-center gap-3 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3.5 py-2 text-sm font-semibold text-[color:var(--ink)] hover:bg-indigo-500/15"
    >
      <MonitorPlay className="size-4 shrink-0" aria-hidden />
      {label}
      <ArrowUpRight className="ml-auto size-4 shrink-0" aria-hidden />
    </Link>
  );
}
