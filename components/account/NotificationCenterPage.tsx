"use client";

import { NotificationArtwork } from "@/components/notifications/NotificationArtwork";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Clock3, History, Inbox, Play, Settings2 } from "lucide-react";
import { useNotificationActivation } from "@/components/notifications/useNotificationActivation";
import type { InboxCategory, InboxNotification, NotificationCenterPage as NotificationCenterData } from "@/lib/inbox-notification";
import { notificationProviderForUrl, notificationTargetFor } from "@/lib/notification-target";
import { cn } from "@/lib/utils";
import { groupInboxNotifications } from "@/lib/notification-groups";

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

function NotificationFeedItem({
  item,
  onOpen,
  onRead,
}: {
  item: InboxNotification;
  onOpen: (item: InboxNotification) => void;
  onRead: (id: string) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const observedRef = useRef(false);
  const provider = notificationProviderForUrl(item.href);
  const target = notificationTargetFor({
    href: item.href,
    title: item.title,
    body: item.body,
    imageUrl: item.imageUrl,
    avatarUrl: item.avatarUrl,
    xPost: item.xPost ?? null,
  });

  useEffect(() => {
    if (item.readAt || observedRef.current || !rootRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.55 || observedRef.current) return;
      observedRef.current = true;
      onRead(item.id);
      observer.disconnect();
    }, { threshold: [0, 0.55] });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [item.id, item.readAt, onRead]);

  return (
    <article
      ref={rootRef}
      className={cn(
        "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 px-4 py-4 transition-colors sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-5",
        !item.readAt && "border-l-2 border-l-[color:var(--core)] bg-brand-primary/20 pl-[calc(1rem-2px)] sm:pl-[calc(1.25rem-2px)]",
      )}
      data-notification-feed-item
      data-read={item.readAt ? "true" : "false"}
    >
      <NotificationArtwork href={item.href} imageUrl={item.imageUrl || item.xPost?.media[0]?.thumbnailUrl} avatarUrl={item.avatarUrl || item.xPost?.authorAvatarUrl} variant="feed" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.13em] text-quaternary">{categoryLabel(item.category)}</span>
          <span className="size-1 shrink-0 rounded-full bg-quaternary" aria-hidden />
          <time dateTime={item.createdAt} className="shrink-0 text-xs text-tertiary">{relativeTime(item.createdAt)}</time>
          {!item.readAt ? <span className="ml-auto size-2 shrink-0 rounded-full bg-brand-solid" aria-label="Unread" /> : null}
        </div>
        <button type="button" onClick={() => onOpen(item)} className="mt-1 block max-w-full text-left text-sm font-semibold leading-5 text-primary transition hover:text-brand-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)]">
          <span className="line-clamp-2">{item.title}</span>
        </button>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-tertiary">{item.body || (provider === "core" ? "Open this CORE update for the full details." : `Open a preview of this ${provider} update.`)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:hidden">
          <FeedActions item={item} targetKind={target.kind} onOpen={onOpen} onRead={onRead} />
        </div>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <FeedActions item={item} targetKind={target.kind} onOpen={onOpen} onRead={onRead} />
      </div>
    </article>
  );
}

function FeedActions({ item, targetKind, onOpen, onRead }: { item: InboxNotification; targetKind: string; onOpen: (item: InboxNotification) => void; onRead: (id: string) => void }) {
  return <>
    <button type="button" onClick={() => onOpen(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-solid px-3 text-xs font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)]">
      <Play className="size-3.5" aria-hidden />{targetKind === "theater" ? "Watch" : "View"}
    </button>
    {!item.readAt ? <button type="button" onClick={() => onRead(item.id)} aria-label="Mark notification as read" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-tertiary transition hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)]"><Check className="size-3.5" aria-hidden /><span className="sm:hidden lg:inline">Mark read</span></button> : null}
  </>;
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
  const loadMoreRef = useRef<HTMLDivElement>(null);
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
    const sentinel = loadMoreRef.current;
    if (!sentinel || !nextCursor || loading || loadingMore || error) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void load(filter, nextCursor, true);
    }, { rootMargin: "640px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, filter, load, loading, loadingMore, nextCursor]);

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
    <div className="mx-auto min-h-[70vh] max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-primary text-brand-secondary ring-1 ring-inset ring-brand">
            <Bell className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-secondary">Account center</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">Notifications</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-tertiary">Creator activity, account updates, and community notices in one place.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={"/account/catch-up" as never} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-secondary bg-primary px-3.5 text-sm font-semibold text-secondary transition hover:bg-primary_hover hover:text-primary">
            <History className="size-4" aria-hidden />
            Catch up
          </Link>
          <button
            type="button"
            disabled={!unreadCount}
            onClick={() => void markAllRead()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-secondary bg-primary px-3.5 text-sm font-semibold text-secondary transition hover:bg-primary_hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            <CheckCheck className="size-4" aria-hidden />
            Mark {filter === "all" ? "all" : "shown"} read
          </button>
        </div>
      </div>

      <section className="mt-7 overflow-hidden rounded-2xl border border-secondary bg-primary shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary bg-secondary/40 px-4 py-3 sm:px-5">
          <nav className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-primary p-1 ring-1 ring-inset ring-secondary [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Notification categories">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  "min-h-8 shrink-0 rounded-md px-3 text-xs font-semibold transition",
                  filter === option.value ? "bg-brand-solid text-white shadow-sm" : "text-tertiary hover:bg-secondary hover:text-primary",
                )}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <p className="text-xs font-medium text-tertiary" aria-live="polite">{unreadCount ? <><span className="font-semibold text-primary">{unreadCount.toLocaleString()}</span> unread</> : "All caught up"}</p>
        </div>

        <div>
          {loading ? <div className="m-4 h-32 animate-pulse rounded-xl bg-secondary sm:m-5" /> : null}
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
            <ol className="divide-y divide-secondary" aria-label="Notification feed">
              {groupInboxNotifications(items).map((group) => {
                const item = group.items[0]!;
                return (
                  <li key={group.key} className="first:border-t-0">
                    <NotificationFeedItem item={item} onOpen={activateNotification} onRead={(id) => void markRead(id)} />
                    {group.items.length > 1 ? <details className="px-5 pb-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-secondary">{group.items.length - 1} more {item.xPost?.authorName ? `from ${item.xPost.authorName}` : "updates"} on this day</summary><ol className="divide-y divide-secondary">{group.items.slice(1).map((older) => <li key={older.id}><NotificationFeedItem item={older} onOpen={activateNotification} onRead={(id) => void markRead(id)} /></li>)}</ol></details> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
          {nextCursor && !loading && !error ? (
            <div ref={loadMoreRef} className="flex justify-center border-t border-secondary p-4">
              <button type="button" disabled={loadingMore} onClick={() => void load(filter, nextCursor, true)} className="min-h-10 rounded-lg border border-secondary px-4 text-sm font-semibold text-secondary transition hover:bg-secondary disabled:cursor-wait disabled:opacity-50">
                {loadingMore ? "Loading…" : "Load older notifications"}
              </button>
            </div>
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
    </div>
  );
}
