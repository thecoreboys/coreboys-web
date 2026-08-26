"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  CheckCheck,
  CircleOff,
  Copy,
  ExternalLink,
  Heart,
  Info,
  LayoutPanelTop,
  Link as LinkIcon,
  ListPlus,
  Play,
  RefreshCw,
  Search,
  Share2,
  ThumbsDown,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useWatchDiscovery } from "@/lib/watch/discovery-state";
import { readMyList, redirectToMyListSignIn, toggleMyList } from "@/lib/watch/mylist";
import type { WatchItem } from "@/lib/watch/types";

export type WatchContextTarget =
  | {
      type: "content";
      item: WatchItem;
      context?: readonly WatchItem[];
      moment?: { seconds: number };
    }
  | { type: "text"; text: string }
  | { type: "link"; href: string; label: string }
  | { type: "page"; surface?: "page" | "media" | "image" };

type WatchContextMenuState = {
  target: WatchContextTarget;
  x: number;
  y: number;
};

type WatchContextMenuPlacement = {
  left: number;
  top: number;
  scale: number;
};

type WatchContextMenuApi = {
  open: (event: { clientX: number; clientY: number }, target: WatchContextTarget) => void;
  close: () => void;
};

type MenuAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  active?: boolean;
  disabled?: boolean;
  hint?: string;
};

type MenuSection = { label?: string; actions: MenuAction[] };

const WatchContextMenuContext = createContext<WatchContextMenuApi | null>(null);

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

function internalOrSourceHref(item: WatchItem) {
  if (item.href.startsWith("/")) return new URL(item.href, window.location.origin).toString();
  return item.sourceUrl || item.href;
}

async function writeClipboard(value: string) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

export function useWatchContextMenu() {
  return useContext(WatchContextMenuContext);
}

/**
 * A shared, local-first menu surface for Watch. Individual cards supply their
 * content target; the provider owns real player, DVR, feedback, and history
 * actions so every placement stays consistent as the menu expands.
 */
export function WatchContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<WatchContextMenuState | null>(null);
  const [placement, setPlacement] = useState<WatchContextMenuPlacement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const player = usePlayer();
  const router = useRouter();
  const { user } = useAuth();
  const discovery = useWatchDiscovery();
  const { markWatched } = useWatchProgress();

  const close = useCallback(() => {
    setMenu(null);
    setPlacement(null);
    restoreFocusRef.current?.focus({ preventScroll: true });
    restoreFocusRef.current = null;
  }, []);

  const open = useCallback((event: { clientX: number; clientY: number }, target: WatchContextTarget) => {
    const active = document.activeElement;
    restoreFocusRef.current = active instanceof HTMLElement ? active : null;
    setMenu({ target, x: event.clientX, y: event.clientY });
    setPlacement({ left: event.clientX, top: event.clientY, scale: 1 });
  }, []);

  const announce = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? null : current), 2200);
  }, []);

  const select = useCallback((action: () => void) => {
    action();
    close();
  }, [close]);

  const copy = useCallback((value: string, label = "Link copied") => {
    void writeClipboard(value).then((copied) => announce(copied ? label : "Could not copy"));
  }, [announce]);

  const contentSections = useMemo<MenuSection[]>(() => {
    if (!menu || menu.target.type !== "content") return [];
    const { item, context, moment } = menu.target;
    const sourceHref = item.sourceUrl || item.href;
    const canonicalHref = internalOrSourceHref(item);
    const playable = item.format !== "photo" && item.embeddable !== false;
    const isLive = item.kind === "live" || item.format === "live";
    const saved = readMyList().includes(item.id);
    const feedback = discovery.state.feedback[item.id]?.value;
    const duration = item.durationSeconds ?? 0;
    const play = () => player.play(item, [...(context ?? [item])], moment ? { startAtSeconds: moment.seconds } : undefined);

    const watchActions: MenuAction[] = [];
    if (playable) {
      watchActions.push({ id: "play", label: isLive ? "Watch live" : "Play now", icon: Play, onSelect: play, hint: "Enter" });
      watchActions.push({
        id: "theater",
        label: "Open in theater",
        icon: LayoutPanelTop,
        onSelect: () => player.play(item, [...(context ?? [item])], { mode: "theater", startAtSeconds: moment?.seconds }),
      });
      watchActions.push({ id: "next", label: "Play next", icon: ListPlus, onSelect: () => announce(player.addToQueue(item, "next") ? "Added to play next" : "Already queued") });
      watchActions.push({ id: "queue", label: "Add to queue", icon: ListPlus, onSelect: () => announce(player.addToQueue(item, "end") ? "Added to queue" : "Already queued") });
      watchActions.push({
        id: "multiview",
        label: "Add to multiview",
        icon: LayoutPanelTop,
        onSelect: () => {
          const tileId = player.addTile(item, { focus: true, muted: true });
          if (!tileId) {
            announce("Multiview limit reached");
            return;
          }
          router.push("/multiview");
        },
      });
    }

    const personalActions: MenuAction[] = [
      {
        id: "dvr",
        label: saved ? "Remove from DVR" : "Save to DVR",
        icon: Bookmark,
        active: saved,
        onSelect: () => {
          if (!user) {
            redirectToMyListSignIn();
            return;
          }
          announce(toggleMyList(item.id).includes(item.id) ? "Saved to DVR" : "Removed from DVR");
        },
      },
    ];
    if (playable && !isLive) {
      personalActions.push({ id: "watched", label: "Mark as watched", icon: CheckCheck, onSelect: () => {
        markWatched(item.id, item.kind, item.memberSlug, duration);
        announce("Marked as watched");
      } });
    }
    personalActions.push(
      { id: "like", label: feedback === "like" ? "Liked" : "Like", icon: Heart, active: feedback === "like", onSelect: () => discovery.setFeedback(item.id, feedback === "like" ? null : "like") },
      { id: "less", label: "Show less like this", icon: ThumbsDown, active: feedback === "dislike", onSelect: () => discovery.setFeedback(item.id, feedback === "dislike" ? null : "dislike") },
      { id: "not-interested", label: "Not interested", icon: CircleOff, active: feedback === "not_interested", onSelect: () => discovery.setFeedback(item.id, feedback === "not_interested" ? null : "not_interested") },
    );

    const shareActions: MenuAction[] = [
      { id: "copy-link", label: "Copy link", icon: Copy, onSelect: () => copy(canonicalHref) },
      { id: "copy-source", label: "Copy source link", icon: LinkIcon, onSelect: () => copy(sourceHref, "Source link copied") },
      {
        id: "share",
        label: "Share…",
        icon: Share2,
        onSelect: () => {
          if (navigator.share) {
            void navigator.share({ title: item.title, url: canonicalHref }).catch(() => undefined);
          } else copy(canonicalHref);
        },
      },
      { id: "source", label: `Open on ${item.platform === "x" ? "X" : item.platform}`, icon: ExternalLink, onSelect: () => window.open(sourceHref, "_blank", "noopener,noreferrer") },
    ];
    if (item.memberSlug) shareActions.push({ id: "creator", label: `View ${item.memberLabel}`, icon: Info, onSelect: () => router.push(`/members/${item.memberSlug}` as never) });

    return [
      ...(watchActions.length ? [{ actions: watchActions }] : []),
      { label: "Your library", actions: personalActions },
      { label: "Share", actions: shareActions },
    ];
  }, [copy, discovery, markWatched, menu, player, router, user, announce]);

  const textSections = useMemo<MenuSection[]>(() => {
    if (!menu || menu.target.type !== "text") return [];
    const text = menu.target.text;
    return [{
      actions: [
        { id: "copy-text", label: "Copy", icon: Copy, onSelect: () => copy(text, "Text copied"), hint: "⌘C" },
        { id: "search-core", label: "Search CORE", icon: Search, onSelect: () => {
          window.dispatchEvent(new CustomEvent("core-watch-search", { detail: { query: text } }));
          announce("Search opened");
        } },
        { id: "search-web", label: "Search the web", icon: ExternalLink, onSelect: () => window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer") },
      ],
    }];
  }, [copy, menu, announce]);

  const linkSections = useMemo<MenuSection[]>(() => {
    if (!menu || menu.target.type !== "link") return [];
    const { href, label } = menu.target;
    return [
      {
        actions: [
          { id: "open-link", label: "Open link", icon: ExternalLink, onSelect: () => window.location.assign(href), hint: "Enter" },
          { id: "open-new-tab", label: "Open in new tab", icon: ExternalLink, onSelect: () => window.open(href, "_blank", "noopener,noreferrer") },
          { id: "copy-link", label: "Copy link", icon: Copy, onSelect: () => copy(href) },
          { id: "share-link", label: "Share…", icon: Share2, onSelect: () => {
            if (navigator.share) void navigator.share({ title: label, url: href }).catch(() => undefined);
            else copy(href);
          } },
        ],
      },
      ...(label.trim() ? [{ label: "Explore", actions: [
        { id: "search-link", label: "Search CORE for this", icon: Search, onSelect: () => {
          window.dispatchEvent(new CustomEvent("core-watch-search", { detail: { query: label.trim().slice(0, 240) } }));
          announce("Search opened");
        } },
      ] }] : []),
    ];
  }, [announce, copy, menu]);

  const pageSections = useMemo<MenuSection[]>(() => {
    if (!menu || menu.target.type !== "page") return [];
    const pageHref = window.location.href;
    return [
      {
        actions: [
          { id: "search-page", label: "Search CORE", icon: Search, onSelect: () => window.dispatchEvent(new Event("core-watch-search")), hint: "/" },
          { id: "copy-page", label: "Copy page link", icon: Copy, onSelect: () => copy(pageHref, "Page link copied") },
          { id: "share-page", label: "Share page…", icon: Share2, onSelect: () => {
            if (navigator.share) void navigator.share({ title: document.title, url: pageHref }).catch(() => undefined);
            else copy(pageHref, "Page link copied");
          } },
        ],
      },
      {
        label: "Page",
        actions: [
          { id: "back", label: "Back", icon: ArrowLeft, onSelect: () => window.history.back() },
          { id: "forward", label: "Forward", icon: ArrowRight, onSelect: () => window.history.forward() },
          { id: "reload", label: "Reload", icon: RefreshCw, onSelect: () => window.location.reload() },
        ],
      },
    ];
  }, [copy, menu]);

  const sections = menu?.target.type === "content"
    ? contentSections
    : menu?.target.type === "text"
      ? textSections
      : menu?.target.type === "link"
        ? linkSections
        : pageSections;

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      const selected = window.getSelection()?.toString().trim();
      event.preventDefault();
      if (selected) {
        open(event, { type: "text", text: selected.slice(0, 8000) });
        return;
      }
      const element = event.target instanceof Element ? event.target : null;
      const link = element?.closest<HTMLAnchorElement>("a[href]");
      if (link?.href) {
        open(event, { type: "link", href: link.href, label: (link.innerText || link.getAttribute("aria-label") || "Link").trim().slice(0, 240) });
        return;
      }
      const surface = element?.closest("video, iframe") ? "media" : element?.closest("img, picture") ? "image" : "page";
      open(event, { type: "page", surface });
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [open]);

  useEffect(() => {
    if (!menu) return;
    const frame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not([disabled])")?.focus());
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not([disabled])") ?? [])];
      const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (!buttons.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[nextIndex]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, menu]);

  const placeMenu = useCallback(() => {
    if (!menu || !menuRef.current) return;
    const margin = 12;
    // offset dimensions stay unscaled, which lets a short viewport use a
    // compact visual scale without ever placing an edge outside the screen.
    const naturalWidth = menuRef.current.offsetWidth;
    const naturalHeight = menuRef.current.offsetHeight;
    const scale = Math.max(0.1, Math.min(
      1,
      (window.innerWidth - margin * 2) / naturalWidth,
      (window.innerHeight - margin * 2) / naturalHeight,
    ));
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    setPlacement({
      scale,
      left: Math.min(Math.max(margin, menu.x), Math.max(margin, window.innerWidth - width - margin)),
      top: Math.min(Math.max(margin, menu.y), Math.max(margin, window.innerHeight - height - margin)),
    });
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu) return;
    const frame = window.requestAnimationFrame(placeMenu);
    window.addEventListener("resize", placeMenu);
    window.visualViewport?.addEventListener("resize", placeMenu);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", placeMenu);
      window.visualViewport?.removeEventListener("resize", placeMenu);
    };
  }, [menu, placeMenu]);

  return (
    <WatchContextMenuContext.Provider value={{ open, close }}>
      {children}
      {menu ? (
        <div ref={menuRef} className="watch-context-menu" style={placement ? { left: placement.left, top: placement.top, ["--watch-context-scale" as string]: placement.scale } : undefined} role="menu" aria-label={menu.target.type === "content" ? `Actions for ${menu.target.item.title}` : menu.target.type === "link" ? `Actions for ${menu.target.label}` : menu.target.type === "text" ? "Text actions" : "Page actions"}>
          <div className="watch-context-menu__head">
            <span>{menu.target.type === "content" ? menu.target.item.title : menu.target.type === "link" ? menu.target.label || "Link" : menu.target.type === "text" ? "Selected text" : menu.target.surface === "media" ? "Media" : "Page"}</span>
            <button type="button" className="watch-context-menu__close" onClick={close} aria-label="Close menu"><X size={15} /></button>
          </div>
          {sections.map((section, index) => (
            <div className="watch-context-menu__section" key={`${section.label ?? "actions"}-${index}`}>
              {section.label ? <p>{section.label}</p> : null}
              {section.actions.map((action) => {
                const Icon = action.icon;
                return <button key={action.id} type="button" role="menuitem" className={action.active ? "is-active" : undefined} disabled={action.disabled} onClick={() => select(action.onSelect)}>
                  <Icon size={16} strokeWidth={1.9} aria-hidden />
                  <span>{action.label}</span>
                  {action.active ? <Check size={14} aria-hidden /> : action.hint ? <kbd>{action.hint}</kbd> : null}
                </button>;
              })}
            </div>
          ))}
        </div>
      ) : null}
      {notice ? <div className="watch-context-menu__notice" role="status">{notice}</div> : null}
    </WatchContextMenuContext.Provider>
  );
}
