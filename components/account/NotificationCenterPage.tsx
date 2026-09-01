"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, ChevronRight, Clock3, Inbox, Settings2 } from "lucide-react";
import { useNotificationActivation } from "@/components/notifications/useNotificationActivation";
import type { InboxCategory, InboxNotification, NotificationCenterPage as NotificationCenterData } from "@/lib/inbox-notification";
import { cn } from "@/lib/utils";

type Filter = "all" | InboxCategory;
type Reminder = { id: string; title: string; href: string; startsAt: string; enabled: boolean };

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "creator", label: "Creator" },
  { value: "reminder", label: "Reminders" },
  { value: "account", label: "Account" },
  { value: "community", label: "Community" },
];

function relativeTime(value: string): string {
  const difference = Date.now() - Date.parse(value);
  if (!Number.isFinite(difference) || difference < 60_000) return "just now";
  const minutes = Math.round(difference / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function scheduledTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Scheduled soon";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function categoryLabel(category: InboxCategory): string {
  if (category === "creator") return "Creator alert";
  if (category === "reminder") return "Guide reminder";
  if (category === "community") return "Community";
  return "Account";
}

function NotificationArtwork({ image }: { image: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) {
    return <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-primary text-brand-secondary"><Bell className="size-5" aria-hidden /></span>;
  }
  return <img src={image} alt="" onError={() => setFailed(true)} className="size-12 shrink-0 rounded-xl object-cover" />;
}

async function fetchPage(filter: Filter, cursor?: string | null): Promise<NotificationCenterData> {
  const params = new URLSearchParams({ limit: "30" });
  if (filter !== "all") params.set("category", filter);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/account/notification-center?${params}`, { credentials: "same-origin" });
  if (!response.ok) throw new Error("notification_center_unavailable");
  return response.json() as Promise<NotificationCenterData>;
}

export function NotificationCenterPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const { activate, previewDialog } = useNotificationActivation();

  const load = useCallback(async (nextFilter: Filter, cursor?: string | null, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(false);
    try {
      const page = await fetchPage(nextFilter, cursor);
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setUnreadCount(page.unreadCount);
      setNextCursor(page.nextCursor);
    } catch {
      setError(true);
      if (!append) setItems([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  useEffect(() => {
    let active = true;
    void fetch("/api/account/reminders", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() as Promise<{ items?: Reminder[] }> : null)
      .then((data) => {
        if (!active) return;
        const now = Date.now() - 30 * 60_000;
        setReminders((data?.items ?? [])
          .filter((item) => item.enabled && Date.parse(item.startsAt) >= now)
          .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
          .slice(0, 3));
      })
      .catch(() => { if (active) setReminders([]); });
    return () => { active = false; };
  }, []);

  async function markRead(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || item.readAt) return;
    const now = new Date().toISOString();
    setItems((current) => current.map((candidate) => candidate.id === id ? { ...candidate, readAt: now } : candidate));
    setUnreadCount((count) => Math.max(0, count - 1));
    const response = await fetch("/api/account/notification-center", {
      method: "PATCH",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_read", id }),
    }).catch(() => null);
    if (!response?.ok) void load(filter);
  }

  async function markAllRead() {
    if (!unreadCount) return;
    const unreadHere = items.filter((item) => !item.readAt).length;
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    setUnreadCount((count) => Math.max(0, count - unreadHere));
    const response = await fetch("/api/account/notification-center", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read", ...(filter === "all" ? {} : { category: filter }) }),
    }).catch(() => null);
    if (!response?.ok) void load(filter);
    else void load(filter);
  }

  function activateNotification(item: InboxNotification) {
    void markRead(item.id);
    activate({
      href: item.href,
      title: item.title,
      body: item.body,
      imageUrl: item.imageUrl,
      avatarUrl: item.avatarUrl,
      xPost: item.xPost,
    });
  }

  return (
    <main className="mx-auto min-h-[70vh] max-w-5xl px-5 py-10 sm:px-6 lg:px-8 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex gap-3">
          <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-brand-primary text-brand-secondary ring-1 ring-inset ring-brand">
            <Bell className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-secondary">Account center</p>
            <h1 className="mt-1 text-display-sm font-semibold tracking-tight text-primary">Notifications</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-6 text-tertiary">Creator activity, CORE account updates, and community notices — all in one place.</p>
          </div>
        </div>
        <button
          type="button"
          disabled={!unreadCount}
          onClick={() => void markAllRead()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold text-secondary ring-1 ring-inset ring-secondary transition hover:bg-primary_hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
        >
          <CheckCheck className="size-4" aria-hidden />
          Mark {filter === "all" ? "all" : "shown"} read
        </button>
      </div>

      <section className="mt-8 overflow-hidden rounded-3xl bg-secondary/80 shadow-2xl shadow-black/10 ring-1 ring-inset ring-secondary">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-5 py-4 sm:px-6">
          <nav className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-primary p-1 ring-1 ring-inset ring-secondary" aria-label="Notification categories">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  "min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition",
                  filter === option.value ? "bg-brand-primary text-brand-secondary" : "text-tertiary hover:bg-secondary hover:text-primary",
                )}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <p className="text-xs font-semibold text-tertiary">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p>
        </div>

        <div className="p-2 sm:p-3">
          {loading ? <div className="h-64 animate-pulse rounded-xl bg-primary" /> : null}
          {error ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-semibold text-primary">Notifications are temporarily unavailable</p>
              <button type="button" onClick={() => void load(filter)} className="mt-3 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">Try again</button>
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Inbox className="mx-auto size-8 text-quaternary" aria-hidden />
              <h2 className="mt-4 text-base font-semibold text-primary">No notifications yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-tertiary">New creator activity and CORE updates will show up here when they’re available.</p>
              <Link href="/account/settings#notifications" className="mt-5 inline-flex text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">Manage creator alerts</Link>
            </div>
          ) : null}
          {!loading && !error ? (
            <ul className="space-y-1">
              {items.map((item) => {
                const image = item.imageUrl;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => activateNotification(item)}
                      aria-label={`Open notification: ${item.title}`}
                      className={cn("group flex w-full items-start gap-3 rounded-2xl px-3 py-4 text-left transition hover:bg-primary_hover sm:px-4", !item.readAt ? "bg-primary ring-1 ring-inset ring-secondary" : "hover:ring-1 hover:ring-inset hover:ring-secondary")}
                    >
                      <NotificationArtwork image={image} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-quaternary">{categoryLabel(item.category)}</span>
                          <span className="text-xs text-quaternary">{relativeTime(item.createdAt)}</span>
                        </span>
                        <strong className="mt-1 block text-[15px] leading-6 text-primary">{item.title}</strong>
                        {item.body ? <span className="mt-1 block text-sm leading-6 text-tertiary line-clamp-2">{item.body}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {!item.readAt ? <span className="size-2 rounded-full bg-brand-solid" aria-label="Unread" /> : null}
                        <ChevronRight className="size-4 text-quaternary transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {nextCursor && !loading && !error ? (
            <button type="button" disabled={loadingMore} onClick={() => void load(filter, nextCursor, true)} className="mx-auto mt-4 flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold text-brand-secondary transition hover:bg-brand-primary disabled:cursor-wait disabled:opacity-50">
              {loadingMore ? "Loading…" : "Load older notifications"}
            </button>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-2xl bg-secondary p-5 ring-1 ring-inset ring-secondary sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-tertiary ring-1 ring-inset ring-secondary"><Clock3 className="size-5" aria-hidden /></span>
            <div>
              <h2 className="text-base font-semibold text-primary">Coming up</h2>
              <p className="mt-1 text-sm text-tertiary">Saved Guide reminders stay here while you plan what to watch.</p>
            </div>
          </div>
          <Link href="/guide" className="text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">Open Guide</Link>
        </div>
        {reminders.length ? (
          <ul className="mt-4 divide-y divide-secondary rounded-xl bg-primary px-4 ring-1 ring-inset ring-secondary">
            {reminders.map((reminder) => <li key={reminder.id}><Link href={reminder.href as never} className="flex min-h-12 items-center justify-between gap-4 py-3 text-sm transition hover:text-brand-secondary"><span className="min-w-0 truncate font-medium text-primary">{reminder.title}</span><span className="shrink-0 text-xs text-tertiary">{scheduledTime(reminder.startsAt)}</span></Link></li>)}
          </ul>
        ) : <p className="mt-4 text-sm text-tertiary">No saved reminders are coming up.</p>}
        <Link href="/account/settings#notifications" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover"><Settings2 className="size-4" aria-hidden />Manage alert settings</Link>
      </section>
      {previewDialog}
    </main>
  );
}
