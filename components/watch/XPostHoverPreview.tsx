"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { PlatformLogo } from "@/components/clips/PlatformLogo";
import { BrowserRelativeTime } from "@/components/ui/BrowserDateTime";
import { parseXPostReference } from "@/lib/x/parsing";
import type { WatchItem } from "@/lib/watch/types";
import styles from "./XPostHoverPreview.module.css";

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

function safeHandle(value: string | undefined, fallback: string): string {
  const handle = value?.trim().replace(/^@+/, "") ?? "";
  return X_HANDLE.test(handle) ? handle : fallback;
}

function safeImage(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    // X profile photos are served from Twimg. Reject local CORE artwork (or
    // another site's image) so an X post never masquerades as a site account.
    const isTwimg = host === "twimg.com" || host.endsWith(".twimg.com");
    return url.protocol === "https:" && isTwimg ? url.toString() : null;
  } catch {
    return null;
  }
}

function postText(item: WatchItem): string {
  return (item.x?.noteText ?? item.title).replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
    "",
  );
}

export function XPostHoverPreview({
  item,
  anchorRef,
  onPreviewEnter,
  onPreviewLeave,
  panelId,
  keyboardActive = false,
  onKeyboardDismiss,
}: {
  item: WatchItem;
  anchorRef: RefObject<HTMLElement | null>;
  onPreviewEnter?: () => void;
  onPreviewLeave?: () => void;
  panelId?: string;
  keyboardActive?: boolean;
  onKeyboardDismiss?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const reference = parseXPostReference(item.sourceUrl ?? item.href);

  const updatePosition = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const anchor = anchorRef.current;
      if (!anchor) return;
      const target = anchor.getBoundingClientRect();
      const gutter = 12;
      const width = Math.min(520, Math.max(280, window.innerWidth - gutter * 2));
      const height = panelRef.current?.offsetHeight ?? Math.min(620, window.innerHeight - gutter * 2);
      const left = Math.min(window.innerWidth - width - gutter, Math.max(gutter, target.left + target.width / 2 - width / 2));
      const top = Math.min(window.innerHeight - height - gutter, Math.max(gutter, target.top + target.height / 2 - height / 2));
      setPosition({ left, top, width });
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!panelRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updatePosition);
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!keyboardActive || !position) return;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("a,button")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [keyboardActive, position]);

  if (!position || !reference || typeof document === "undefined") return null;
  const handle = safeHandle(item.x?.authorHandle, reference.authorHandle);
  const profileUrl = `https://x.com/${handle}`;
  const avatar = safeImage(item.x?.authorAvatarUrl);
  const media = item.kind !== "post" || item.mediaUrl ? safeImage(item.poster) : null;
  const text = postText(item);
  return createPortal(
    <article
      ref={panelRef}
      id={panelId}
      className={styles.preview}
      style={{ left: position.left, top: position.top, width: position.width }}
      role={keyboardActive ? "dialog" : undefined}
      tabIndex={keyboardActive ? -1 : undefined}
      onKeyDown={(event) => {
        if (keyboardActive && event.key === "Escape") {
          event.preventDefault();
          onKeyboardDismiss?.();
        }
      }}
      onMouseEnter={onPreviewEnter}
      onMouseLeave={keyboardActive ? undefined : onPreviewLeave}
      aria-label={`Post by ${item.x?.authorName ?? item.memberLabel} on X`}
    >
      <header className={styles.header}>
        <a className={styles.avatar} href={profileUrl} target="_blank" rel="noopener noreferrer" aria-label={`${item.x?.authorName ?? item.memberLabel} on X`}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" decoding="async" />
          ) : (
            <PlatformLogo platform="x" size={18} />
          )}
        </a>
        <span className={styles.identity}>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer"><strong>{item.x?.authorName ?? item.memberLabel}</strong></a>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer">@{handle}</a>
        </span>
        <a className={styles.mark} href={reference.url} target="_blank" rel="noopener noreferrer" aria-label="View post on X">
          <PlatformLogo platform="x" size={18} />
        </a>
      </header>

      <p className={styles.text}>{text}</p>

      {media ? (
        <a className={styles.media} href={reference.url} target="_blank" rel="noopener noreferrer" aria-label="View attached media on X">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media} alt="" decoding="async" />
          {item.mediaUrl && item.kind !== "tour" ? <span aria-hidden="true">Video</span> : null}
        </a>
      ) : null}

      <footer className={styles.footer}>
        {item.publishedAt ? (
          <a href={reference.url} target="_blank" rel="noopener noreferrer">
            <BrowserRelativeTime value={item.publishedAt} absoluteAfterDays={30} fallback="Posted on X" />
          </a>
        ) : <span>Posted on X</span>}
        <a className={styles.viewLink} href={reference.url} target="_blank" rel="noopener noreferrer">
          View on X <ExternalLink aria-hidden="true" />
        </a>
      </footer>
    </article>,
    document.getElementById("watch-preview-root") ?? document.body,
  );
}
