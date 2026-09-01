"use client";

import Link from "next/link";
import useSWR from "swr";
import { useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Inbox, Settings2, Trash2 } from "lucide-react";
import { useNotificationActivation } from "@/components/notifications/useNotificationActivation";
import type { InboxNotification, NotificationCenterPage } from "@/lib/inbox-notification";
import { cn } from "@/lib/utils";

type Variant = "desktop" | "mobile";

async function getInbox(url: string): Promise<NotificationCenterPage> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("notification_center_unavailable");
  return response.json() as Promise<NotificationCenterPage>;
}

function useActiveVariant(variant: Variant): boolean {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop !== null && (variant === "desktop" ? desktop : !desktop);
}

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

function categoryLabel(notification: InboxNotification): string {
  if (notification.category === "creator") return "Creator alert";
  if (notification.category === "community") return "Community";
  if (notification.category === "reminder") return "Guide reminder";
  return "Account";
}

function NotificationArtwork({ image }: { image: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) {
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-primary text-brand-secondary">
        <Bell className="size-4" aria-hidden />
      </span>
    );
  }
  return <img src={image} alt="" onError={() => setFailed(true)} className="size-10 shrink-0 rounded-lg object-cover" />;
}

function NotificationPreview({ item, onRead, onDelete, onActivate }: { item: InboxNotification; onRead: (id: string) => void; onDelete: (id: string) => void; onActivate: (item: InboxNotification) => void }) {
  const image = item.imageUrl ?? item.avatarUrl;
  return (
    <div className={cn("group flex gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[color:var(--surface)]", !item.readAt && "bg-[color:var(--bg-elev)]")}>
      <NotificationArtwork image={image} />
      <button type="button" onClick={() => onActivate(item)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)]">
        <span className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-quaternary">{categoryLabel(item)}</span>
          <span className="shrink-0 text-[10px] text-quaternary">{relativeTime(item.createdAt)}</span>
        </span>
        <strong className="mt-0.5 line-clamp-2 block text-sm leading-5 text-primary">{item.title}</strong>
        {item.body ? <span className="mt-0.5 line-clamp-1 block text-xs leading-5 text-tertiary">{item.body}</span> : null}
      </button>
      <span className="flex shrink-0 items-start gap-0.5">
        {!item.readAt ? <button type="button" onClick={() => onRead(item.id)} className="grid size-7 place-items-center rounded-md text-white/45 transition hover:bg-white/10 hover:text-white" aria-label="Mark notification as read"><Check className="size-3.5" aria-hidden /></button> : null}
        <button type="button" onClick={() => onDelete(item.id)} className="grid size-7 place-items-center rounded-md text-white/45 transition hover:bg-red-500/15 hover:text-red-300" aria-label="Delete notification"><Trash2 className="size-3.5" aria-hidden /></button>
      </span>
      {!item.readAt ? <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-solid" aria-label="Unread" /> : null}
    </div>
  );
}

export function NotificationBell({ variant }: { variant: Variant }) {
  const active = useActiveVariant(variant);
  const { data, mutate } = useSWR<NotificationCenterPage>(
    active ? "/api/account/notification-center?limit=5" : null,
    getInbox,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const [open, setOpen] = useState(false);
  const { activate, previewDialog } = useNotificationActivation();
  const [, setClock] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void mutate();
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, mutate]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!active) return null;
  const unread = data?.unreadCount ?? 0;
  const buttonLabel = unread
    ? `Open notifications, ${unread} unread`
    : "Open notifications";

  async function markRead(id: string) {
    const current = data;
    if (!current || current.items.find((item) => item.id === id)?.readAt) return;
    const now = new Date().toISOString();
    await mutate({
      ...current,
      unreadCount: Math.max(0, current.unreadCount - 1),
      items: current.items.map((item) => item.id === id ? { ...item, readAt: now } : item),
    }, false);
    const response = await fetch("/api/account/notification-center", {
      method: "PATCH",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_read", id }),
    }).catch(() => null);
    if (!response?.ok) await mutate(current, false);
    else void mutate();
  }

  async function markAllRead() {
    const current = data;
    if (!current || current.unreadCount === 0) return;
    const now = new Date().toISOString();
    await mutate({ ...current, unreadCount: 0, items: current.items.map((item) => ({ ...item, readAt: item.readAt ?? now })) }, false);
    const response = await fetch("/api/account/notification-center", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    }).catch(() => null);
    if (!response?.ok) await mutate(current, false);
    else void mutate();
  }

  async function deleteNotification(id: string) {
    const current = data;
    if (!current) return;
    const removed = current.items.find((item) => item.id === id);
    await mutate({ ...current, items: current.items.filter((item) => item.id !== id), unreadCount: Math.max(0, current.unreadCount - (removed?.readAt ? 0 : 1)) }, false);
    const response = await fetch("/api/account/notification-center", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id }) }).catch(() => null);
    if (!response?.ok) await mutate(current, false); else void mutate();
  }

  function activateNotification(item: InboxNotification) {
    void markRead(item.id);
    setOpen(false);
    activate({
      href: item.href,
      title: item.title,
      body: item.body,
      imageUrl: item.imageUrl,
      avatarUrl: item.avatarUrl,
    });
  }

  return (
    <>
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={`notification-center-${variant}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative grid size-10 cursor-pointer place-items-center rounded-lg text-[color:var(--ink-dim)] ring-1 ring-inset ring-[color:var(--rule)] transition-[color,background-color,transform] hover:-translate-y-px hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)] active:translate-y-0 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)]",
          open && "bg-[color:var(--bg-elev)] text-[color:var(--ink)]",
        )}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread ? (
          <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-brand-solid px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-[color:var(--bg)]">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <section
          id={`notification-center-${variant}`}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-[70] mt-2 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-secondary bg-primary shadow-2xl ring-1 ring-black/10"
        >
          <div className="flex items-center justify-between gap-3 border-b border-secondary px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-primary">Notifications</h2>
              <p className="mt-0.5 text-xs text-tertiary">{unread ? `${unread} unread` : "You’re all caught up"}</p>
            </div>
            <button
              type="button"
              disabled={!unread}
              onClick={() => void markAllRead()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-tertiary transition hover:bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck className="size-4" aria-hidden />
              Read all
            </button>
          </div>
          <div className="max-h-[min(27rem,calc(100dvh-8rem))] overscroll-contain overflow-y-auto p-1.5">
            {!data ? <div className="h-36 animate-pulse rounded-xl bg-secondary" /> : null}
            {data && data.items.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Inbox className="mx-auto size-6 text-quaternary" aria-hidden />
                <p className="mt-3 text-sm font-semibold text-primary">Nothing new right now</p>
                <p className="mt-1 text-xs leading-5 text-tertiary">Creator, account, and community updates will appear here.</p>
              </div>
            ) : null}
            {data?.items.map((item) => <NotificationPreview key={item.id} item={item} onRead={(id) => void markRead(id)} onDelete={(id) => void deleteNotification(id)} onActivate={activateNotification} />)}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-secondary p-2">
            <Link href={"/account/notifications" as never} onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-semibold text-brand-secondary transition hover:bg-brand-primary">
              View all notifications
            </Link>
            <Link href="/account/settings#notifications" onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-tertiary transition hover:bg-secondary hover:text-primary">
              <Settings2 className="size-3.5" aria-hidden />
              Alert settings
            </Link>
          </div>
        </section>
      ) : null}
    </div>
    {previewDialog}
    </>
  );
}
