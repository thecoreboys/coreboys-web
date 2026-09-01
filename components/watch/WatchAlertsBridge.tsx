"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { MEMBERS } from "@/lib/members";
import { useWatchReminders } from "@/lib/watch/reminders-client";
import { Tooltip } from "@/components/base/tooltip/tooltip";

type AlertNotice = {
  id: string;
  title: string;
  body: string;
  href: string;
};

async function browserNotify(title: string, body: string, href: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options: NotificationOptions = {
    body,
    icon: "/brand/logo-core-white.png",
    badge: "/brand/logo-core-white.png",
    tag: `core-watch:${href}`,
  };
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, { ...options, data: { href } });
        return;
      }
    }
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      window.location.assign(href);
      notification.close();
    };
  } catch {
    // The in-app notice below is the fallback on mobile or restricted browsers.
  }
}

function deliveredIds(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem("core-watch-alerts-delivered:v1") ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function rememberDelivered(ids: Set<string>) {
  try {
    sessionStorage.setItem("core-watch-alerts-delivered:v1", JSON.stringify([...ids].slice(-200)));
  } catch {
    // Session-only de-duplication is best effort.
  }
}

export function WatchAlertsBridge() {
  const { data } = useLiveStatus();
  const { items, creatorAlerts, browserState, ready } = useWatchReminders();
  const [notices, setNotices] = useState<AlertNotice[]>([]);
  const initializedLive = useRef(false);
  const priorLive = useRef(new Set<string>());
  const delivered = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data || !ready) return;
    const current = new Set(
      data.live.filter((entry) => entry.isLive).map((entry) => entry.login.toLowerCase()),
    );
    if (!initializedLive.current) {
      priorLive.current = current;
      initializedLive.current = true;
      return;
    }
    for (const login of current) {
      if (priorLive.current.has(login)) continue;
      const member = MEMBERS.find((entry) => entry.twitchLogin.toLowerCase() === login);
      if (!member || !(creatorAlerts.all || creatorAlerts[member.slug])) continue;
      const live = data.live.find((entry) => entry.login.toLowerCase() === login);
      const notice = {
        id: `live:${login}:${live?.startedAt ?? Date.now()}`,
        title: `${member.stageName} is live`,
        body: live?.title || live?.game || "A CORE broadcast just started.",
        href: `/watch/live/${encodeURIComponent(login)}`,
      };
      setNotices((previous) => [notice, ...previous].slice(0, 4));
      if (browserState === "granted") void browserNotify(notice.title, notice.body, notice.href);
    }
    priorLive.current = current;
  }, [browserState, creatorAlerts, data, ready]);

  useEffect(() => {
    if (!ready) return;
    if (!delivered.current) delivered.current = deliveredIds();
    const check = () => {
      const now = Date.now();
      const known = delivered.current ?? new Set<string>();
      for (const reminder of items) {
        if (!reminder.enabled || known.has(reminder.id)) continue;
        const startsAt = Date.parse(reminder.startsAt);
        if (!Number.isFinite(startsAt) || now < startsAt - 10 * 60_000 || now > startsAt + 30 * 60_000) continue;
        known.add(reminder.id);
        const minutes = Math.max(0, Math.round((startsAt - now) / 60_000));
        const notice = {
          id: reminder.id,
          title: minutes ? `${reminder.title} starts in ${minutes} min` : `${reminder.title} is starting`,
          body: reminder.memberSlug ? `Tonight on ${reminder.memberSlug.toUpperCase()}` : "Tonight on CORE",
          href: reminder.href,
        };
        setNotices((previous) => [notice, ...previous].slice(0, 4));
        if (browserState === "granted") void browserNotify(notice.title, notice.body, notice.href);
      }
      delivered.current = known;
      rememberDelivered(known);
    };
    check();
    const interval = window.setInterval(check, 30_000);
    return () => window.clearInterval(interval);
  }, [browserState, items, ready]);

  if (!notices.length) return <div data-watch-alerts-bridge data-browser-alert-state={browserState} hidden />;

  return (
    <section
      data-watch-alerts-bridge
      data-browser-alert-state={browserState}
      aria-label="Watch alerts"
      className="fixed right-3 top-[calc(4.25rem+var(--live-ribbon-h,0px))] z-[95] flex w-[min(23rem,calc(100vw-1.5rem))] flex-col gap-2"
    >
      {notices.map((notice) => (
        <div key={notice.id} data-watch-alert-toast role="status" className="flex items-start gap-3 rounded-2xl border border-white/15 bg-[#151519]/95 p-3 text-white shadow-2xl backdrop-blur-xl">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--core)]/18 text-[color:var(--core)]">
            <Bell className="size-4" aria-hidden />
          </span>
          <Link href={notice.href as never} className="min-w-0 flex-1">
            <strong className="block text-xs font-semibold">{notice.title}</strong>
            <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-white/50">{notice.body}</span>
          </Link>
          <Tooltip title="Dismiss alert" description="Remove this Watch notification from the screen." placement="left">
            <button type="button" onClick={() => setNotices((previous) => previous.filter((entry) => entry.id !== notice.id))} className="grid size-8 shrink-0 place-items-center rounded-lg text-white/35 hover:bg-white/8 hover:text-white" aria-label="Dismiss alert">
              <X className="size-3.5" aria-hidden />
            </button>
          </Tooltip>
        </div>
      ))}
    </section>
  );
}
