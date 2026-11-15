"use client";

import Link from "next/link";
import Image from "@/components/ui/SiteImage";
import dynamic from "next/dynamic";
import type { Route } from "next";
import { createPortal, flushSync } from "react-dom";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  Bookmark,
  ChevronDown,
  Gem,
  LogOut,
  Menu,
  Radio,
  Search,
  Settings,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Button } from "@/components/base/buttons/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { openAuthModal } from "@/lib/auth/modal";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { ThemeToggle } from "@/components/chrome/ThemeToggle";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { MultiviewRemoteMenuLink } from "@/components/watch/MultiviewRemoteLinks";
import { countLiveCreators } from "@/lib/watch/live-source-groups";
import { NETWORK_CHANNELS } from "@/lib/watch/channels";
import { cn } from "@/lib/utils";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { UnifiedLiveEntry, UnifiedLiveSnapshot } from "@/lib/watch/live-snapshot";
import { OPEN_CONTRIBUTOR_FORM_EVENT, OPEN_RADIO_CONTROLS_EVENT, OPEN_WATCH_TOGETHER_EVENT } from "@/lib/site-utility-events";

const LiveNowModal = dynamic(
  () => import("@/components/live/LiveNowModal").then((module) => module.LiveNowModal),
  { ssr: false },
);

const unifiedLiveFetcher = async (url: string): Promise<UnifiedLiveSnapshot> => {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`unified_live_${response.status}`);
  return (await response.json()) as UnifiedLiveSnapshot;
};

function isYouTubeLiveEntry(entry: UnifiedLiveEntry): entry is UnifiedLiveEntry & {
  platform: "youtube";
  youtubeId: string;
} {
  return entry.platform === "youtube" && Boolean(entry.youtubeId);
}

/**
 * Global top navigation. Sticky, glass-blurred at scroll > 8px.
 *
 * The Networks dropdown opens on hover (and remains keyboard/click
 * accessible). It closes on pointer exit, outside click, Escape, or route
 * selection.
 */
export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const watchSearchAvailable = !pathname.startsWith("/admin")
    && pathname !== "/login"
    && pathname !== "/signup";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const solidChrome = pathname === "/" || scrolled;
  const [membersOpen, setMembersOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  // Mount flag so the portal target (`document.body`) is only consulted
  // after hydration. `typeof window` checks at render time are subtle —
  // on the first client render the body may still be the SSR markup,
  // and createPortal can quietly resolve into a containing-block-bound
  // ancestor instead of body. This guarantees a post-hydration mount.
  const [mounted, setMounted] = useState(false);
  const prefetchedRoutes = useRef(new Set<string>());
  useEffect(() => setMounted(true), []);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const accountDropdownRef = useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { data } = useLiveStatus();
  const liveEntries = (data?.live ?? []).filter((l) => l.isLive);
  const { data: unifiedLive } = useSWR<UnifiedLiveSnapshot>(
    "/api/watch/live",
    unifiedLiveFetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 15_000,
    },
  );
  const youtubeLiveEntries = (unifiedLive?.live ?? []).filter(isYouTubeLiveEntry);
  const liveCount = countLiveCreators([
    ...liveEntries.flatMap((entry) => {
      const member = MEMBERS.find((candidate) => candidate.twitchLogin.toLowerCase() === entry.login.toLowerCase());
      return member ? [{ key: `twitch:${entry.login.toLowerCase()}`, kind: "live", memberSlug: member.slug }] : [];
    }),
    ...youtubeLiveEntries.map((entry) => ({ key: `youtube:${entry.id}`, kind: "live", memberSlug: entry.memberSlug })),
  ]);
  const combinedViewers = liveEntries.reduce(
    (sum, e) => sum + (e.viewerCount ?? 0),
    0,
  ) + youtubeLiveEntries.reduce((sum, e) => sum + (e.viewerCount ?? 0), 0);
  const { user, loading: authLoading, logout } = useAuth();

  const prefetchOnIntent = (href: string) => {
    if (prefetchedRoutes.current.has(href)) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;
    prefetchedRoutes.current.add(href);
    router.prefetch(href as never);
  };

  const openAuth = (mode: "login" | "signup" = "login") => {
    openAuthModal({ mode, next: `${pathname}${searchParams.size ? `?${searchParams}` : ""}` });
  };

  const openMobileUtility = (eventName: string) => {
    // Release navigation's scroll/focus handlers before opening a utility.
    flushSync(() => setOpen(false));
    window.dispatchEvent(new Event(eventName));
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname, searchParams]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.navigationOpen = "true";
    const close = () => { setOpen(false); mobileTriggerRef.current?.focus(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onDesktop = () => { if (desktop.matches) setOpen(false); };
    const onOutside = (event: Event) => {
      if (event.target instanceof Node && !mobileTriggerRef.current?.closest("header")?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onOutside);
    document.addEventListener("pointerdown", onOutside);
    desktop.addEventListener("change", onDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.navigationOpen;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onOutside);
      document.removeEventListener("pointerdown", onOutside);
      desktop.removeEventListener("change", onDesktop);
    };
  }, [open]);

  // Lock body scroll + close-on-Escape while the live modal is open so
  // it doesn't drift visually with Lenis-driven background scroll.
  useEffect(() => {
    if (!liveModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLiveModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [liveModalOpen]);

  useEffect(() => {
    if (!membersOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMembersOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) setMembersOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [membersOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setAccountOpen(false);
      accountTriggerRef.current?.focus();
    }
    function onClick(e: MouseEvent) {
      if (!accountDropdownRef.current) return;
      if (!accountDropdownRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [accountOpen]);

  // The media player is a dedicated screen with its own exit controls.
  if (pathname.startsWith("/theater")) return null;

  return (
    <header
      className={cn(
        "core-topnav relative z-40 transition-colors duration-300",
        solidChrome
          ? "border-b border-[color:var(--rule)] bg-[color:var(--bg)]/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="core-topnav__inner mx-auto grid h-14 max-w-container grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:gap-4 sm:px-6 md:h-16 md:px-8">
        <Link prefetch={false}
          href="/"
          aria-label="CORE — watch"
          className="group inline-flex w-fit min-w-0 shrink-0 items-center gap-2 cursor-pointer"
        >
          <span className="inline-flex" style={{ fontSize: "clamp(2.25rem, 2.75vw, 2.75rem)" }}>
            <CoreWordmark className="text-[color:var(--ink)] transition-transform group-hover:-translate-y-px" />
          </span>
        </Link>

        <nav aria-label="Main navigation" className="core-topnav__links hidden items-center justify-center gap-0.5 lg:flex">
          <NavLink
            href="/"
            onIntent={() => prefetchOnIntent("/")}
            primary
            active={pathname === "/" || pathname.startsWith("/watch") || pathname.startsWith("/theater")}
          >
            Watch
          </NavLink>
          <span aria-hidden className="mx-1 h-4 w-px bg-[color:var(--rule)]" />
          <NavLink
            href={"/channels/core?mode=continuous" as never}
            onIntent={() => prefetchOnIntent("/channels/core?mode=continuous")}
            primary
            active={pathname === "/channels/core" && (searchParams.get("mode") === "continuous" || !searchParams.get("mode"))}
          >
            24/7
          </NavLink>
          <NavLink href="/shorts" onIntent={() => prefetchOnIntent("/shorts")} primary active={pathname.startsWith("/shorts")}>
            Shorts
          </NavLink>
          <NavLink href="/guide" onIntent={() => prefetchOnIntent("/guide")} primary active={pathname === "/guide"}>
            Guide
          </NavLink>
          <span aria-hidden className="mx-1 h-4 w-px bg-[color:var(--rule)]" />
          <div
            className="relative"
            ref={dropdownRef}
            onMouseEnter={() => setMembersOpen(true)}
            onMouseLeave={() => setMembersOpen(false)}
            onFocusCapture={() => setMembersOpen(true)}
          >
            <button
              type="button"
              data-cursor-hint="Browse communities"
              onClick={() => setMembersOpen((v) => !v)}
              aria-expanded={membersOpen}
              aria-haspopup="menu"
              className={cn(
                "core-topnav__link inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer xl:px-3",
                membersOpen
                  ? "bg-[color:var(--bg-elev)] text-[color:var(--ink)]"
                  : "text-[color:var(--ink-dim)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)]",
              )}
            >
              Networks
              <ChevronDown
                size={14}
                className={cn("transition-transform", membersOpen && "rotate-180")}
              />
            </button>
            {membersOpen ? (
              <div
                role="menu"
                className="absolute left-1/2 top-full w-[1080px] max-w-[calc(100vw-3rem)] -translate-x-1/2 pt-2"
              >
                <div
                  className="overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xl ring-1 ring-black/5 backdrop-blur"
                >
                <div className="flex items-center justify-between border-b border-secondary bg-secondary px-4 py-3">
                  <span className="text-xs font-semibold tracking-tight text-primary">
                    Networks · 7 communities
                  </span>
                  <Link prefetch={false} href="/guide" onClick={() => setMembersOpen(false)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-secondary hover:text-brand-secondary_hover">
                    Open guide →
                  </Link>
                </div>
                <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-7">
                  {NETWORK_CHANNELS.map((network) => {
                    const member = network.memberSlug ? MEMBERS_BY_SLUG[network.memberSlug] : null;
                    const username = member ? `@${member.twitchLogin}` : "All CORE";
                    return (
                      <li key={network.slug}>
                        <Link prefetch={false}
                          href={`/channels/${network.slug}` as `/channels/${string}`}
                          onPointerEnter={() => prefetchOnIntent(`/channels/${network.slug}`)}
                          onFocus={() => prefetchOnIntent(`/channels/${network.slug}`)}
                          data-accent={network.accent}
                          data-cursor-community={network.slug}
                          onClick={() => setMembersOpen(false)}
                          className="group relative block aspect-[1.03] w-full overflow-hidden rounded-xl border border-[color:var(--rule)] bg-black transition-all duration-300 cursor-pointer"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = network.accent;
                            e.currentTarget.style.boxShadow = `0 8px 24px -12px ${network.accent}99, inset 0 0 0 1px ${network.accent}55`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "";
                            e.currentTarget.style.boxShadow = "";
                          }}
                        >
                          <Image
                            src={network.backdrop}
                            alt=""
                            fill
                            sizes="(min-width: 1024px) 148px, 25vw"
                            className="object-cover opacity-80 transition duration-500 group-hover:scale-[1.05] group-hover:opacity-100"
                          />
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0"
                            style={{
                              background:
                                "linear-gradient(180deg, rgba(8,8,10,0.14) 8%, rgba(8,8,10,0.14) 38%, rgba(8,8,10,0.96) 100%)",
                            }}
                          />
                          {network.slug === "core" ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute left-1/2 top-[35%] inline-flex -translate-x-1/2 -translate-y-1/2 text-[color:var(--ink)] drop-shadow-[0_3px_10px_rgba(0,0,0,0.8)] transition duration-300 group-hover:scale-105"
                              style={{ fontSize: "clamp(2.15rem, 3.2vw, 3rem)" }}
                            >
                              <CoreWordmark />
                            </span>
                          ) : (
                            <Image
                              src={network.artwork}
                              alt=""
                              width={150}
                              height={64}
                              className={cn(
                                "absolute left-1/2 top-[35%] h-12 w-[88%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.8)] transition duration-300 group-hover:scale-105",
                                network.slug === "marlon" && "scale-[1.32] group-hover:scale-[1.39]",
                              )}
                            />
                          )}
                          <span className="absolute inset-x-3 bottom-3 flex flex-col leading-snug">
                            <span className="text-sm font-bold tracking-tight text-on-image">
                              {network.name}
                            </span>
                            <span className="mt-1 break-words text-[10px] font-medium text-on-image-dim">
                              {username}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                </div>
              </div>
            ) : null}
          </div>
        </nav>

        <div className="core-topnav__actions hidden items-center justify-end gap-2 lg:flex">
          {watchSearchAvailable ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("core-watch-search"))}
              onPointerEnter={() => window.dispatchEvent(new Event("core-watch-search-warm"))}
              onFocus={() => window.dispatchEvent(new Event("core-watch-search-warm"))}
              className="group inline-flex min-h-10 w-10 cursor-pointer items-center justify-start gap-2.5 rounded-xl bg-[color:var(--ui-surface)] px-3 text-sm font-normal text-[color:var(--ink-dim)] ring-1 ring-inset ring-[color:var(--ui-line)] transition-colors duration-150 hover:bg-[color:var(--ui-hover)] hover:text-[color:var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] lg:w-32 xl:w-44 2xl:w-56"
              aria-label="Search CORE Watch"
              aria-keyshortcuts="Control+K Meta+K /"
            >
              <Search size={16} strokeWidth={1.6} aria-hidden className="shrink-0" />
              <span className="luxury-glisten hidden whitespace-nowrap lg:inline">Search</span>
            </button>
          ) : null}

          <ThemeToggle />

          {/* Keep live status visible without an animated promotion. */}
          {liveCount > 0 ? (
            <button
              type="button"
              onClick={() => setLiveModalOpen(true)}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-[color:var(--ui-hover)]"
              aria-label={`Live — ${liveCount} ${liveCount === 1 ? "person" : "people"} — open picker`}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-[color:var(--live)]"
              />
              <span className="text-xs font-medium text-[color:var(--ink)]">
                LIVE
                <span className="mx-1.5 text-[color:var(--ink-dim)]">·</span>
                <span className="tabular-nums">{liveCount}</span>
              </span>
            </button>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 px-1 text-[11px] font-semibold text-[color:var(--ink-faint)]"
              aria-label="No one is live"
            >
              <span className="size-1.5 rounded-full bg-[color:var(--ink-faint)]" aria-hidden />
              Offline
            </span>
          )}

          {/* Fan account — signed-in destinations live in this menu instead
              of competing with the primary entertainment navigation. */}
          {authLoading ? (
            <span
              aria-label="Loading account"
              className="inline-flex h-9 w-[4.75rem] animate-pulse rounded-full bg-[color:var(--bg-elev)] ring-1 ring-inset ring-[color:var(--rule)]"
            />
          ) : user ? (
            <>
            <NotificationBell variant="desktop" />
            <div className="relative" ref={accountDropdownRef}>
              <button
                ref={accountTriggerRef}
                type="button"
                aria-label={`Open account menu for ${user.displayName}`}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                aria-controls="fan-account-menu"
                onClick={() => setAccountOpen((value) => !value)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full p-0.5 pr-2 text-[color:var(--ink-dim)] shadow-xs-skeuomorphic ring-1 ring-inset transition-colors",
                  accountOpen
                    ? "bg-[color:var(--bg-elev)] text-[color:var(--ink)] ring-[color:var(--rule-strong)]"
                    : "ring-[color:var(--rule)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)]",
                )}
              >
                <span className="relative inline-flex size-8 items-center justify-center rounded-full bg-brand-solid text-xs font-semibold text-white ring-1 ring-inset ring-white/10">
                  {user.displayName
                    .split(" ")
                    .map((word) => word[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <ChevronDown
                  size={13}
                  aria-hidden
                  className={cn("transition-transform", accountOpen && "rotate-180")}
                />
              </button>

              {accountOpen ? (
                <div
                  id="fan-account-menu"
                  role="menu"
                  aria-label="Your account"
                  className="absolute right-0 top-full z-50 w-64 pt-2"
                >
                  <div className="overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xl ring-1 ring-black/5">
                    <div className="border-b border-secondary bg-secondary px-4 py-3">
                      <p className="truncate text-sm font-semibold text-primary">{user.displayName}</p>
                      <p className="mt-0.5 truncate text-xs text-tertiary">{user.email}</p>
                    </div>
                    <div className="p-1.5">
                      <AccountMenuLink
                        href="/passport"
                        icon={Award}
                        label="CORE Passport"
                        active={pathname.startsWith("/passport")}
                        onSelect={() => setAccountOpen(false)}
                      />
                      <AccountMenuLink
                        href="/dvr"
                        icon={Bookmark}
                        label="DVR"
                        active={pathname.startsWith("/dvr") || pathname.startsWith("/my-list")}
                        onSelect={() => setAccountOpen(false)}
                      />
                      <AccountMenuLink
                        href="/account/settings"
                        icon={Settings}
                        label="Account settings"
                        active={pathname === "/account/settings" || pathname === "/account"}
                        onSelect={() => setAccountOpen(false)}
                      />
                      <AccountMenuLink
                        href="/account/settings/billing"
                        icon={Gem}
                        label="Billing"
                        active={pathname.startsWith("/account/settings/billing") || pathname.startsWith("/account/plan")}
                        onSelect={() => setAccountOpen(false)}
                      />
                    </div>
                    <div className="border-t border-secondary p-1.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAccountOpen(false);
                          void logout();
                        }}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-[color:var(--ink-dim)] transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]"
                      >
                        <LogOut size={16} aria-hidden />
                        Sign out
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            </>
          ) : (
            <Button onPress={() => openAuth()} color="secondary" size="sm">
              Sign in
            </Button>
          )}
        </div>

        {/* Mobile / tablet menu — Untitled UI utility button. Lives in
            grid column 3 + right-aligned so it hugs the navbar's right
            edge. 44px touch target. */}
        <div className="core-topnav__mobile-actions col-start-3 flex items-center gap-0.5 justify-self-end lg:hidden">
          {watchSearchAvailable ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("core-watch-search"))}
              onPointerEnter={() => window.dispatchEvent(new Event("core-watch-search-warm"))}
              onFocus={() => window.dispatchEvent(new Event("core-watch-search-warm"))}
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-[color:var(--ink-dim)] transition-colors hover:bg-[color:var(--ui-hover)] hover:text-[color:var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"
              aria-label="Search CORE Watch"
            >
              <Search size={18} aria-hidden />
            </button>
          ) : null}
          <ThemeToggle />
          {user ? <NotificationBell variant="mobile" /> : null}
          <ButtonUtility
            ref={mobileTriggerRef}
            size="sm"
            color="tertiary"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((v) => !v)}
            icon={open ? X : Menu}
            className="min-h-11 min-w-11 shrink-0"
          />
        </div>
      </div>

      {open ? (
        <div id="mobile-navigation" data-lenis-prevent className="core-topnav__mobile-menu absolute inset-x-0 top-full overflow-y-auto overscroll-contain border-y border-[color:var(--rule)] bg-[color:var(--bg)] shadow-xl lg:hidden">
          <nav aria-label="Mobile navigation" className="mx-auto max-w-container px-4 py-4 sm:px-6">
            <MultiviewRemoteMenuLink onNavigate={() => setOpen(false)} />
            {!pathname.startsWith("/admin") && !pathname.startsWith("/studio") && !pathname.startsWith("/access") ? (
              <div className="mb-5 grid grid-cols-2 gap-2 md:hidden" aria-label="Site tools">
                <button type="button" onClick={() => openMobileUtility(OPEN_RADIO_CONTROLS_EVENT)} className="flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 text-sm font-medium text-[color:var(--ink)] hover:bg-[color:var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"><Radio size={16} aria-hidden />DJ Cora</button>
                <button type="button" onClick={() => openMobileUtility(OPEN_CONTRIBUTOR_FORM_EVENT)} className="flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 text-sm font-medium text-[color:var(--ink)] hover:bg-[color:var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"><Sparkles size={16} aria-hidden />Help improve CORE</button>
                {pathname.startsWith("/multiview") ? <button type="button" onClick={() => openMobileUtility(OPEN_WATCH_TOGETHER_EVENT)} className="col-span-2 flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 text-sm font-medium text-[color:var(--ink)] hover:bg-[color:var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"><UsersRound size={16} aria-hidden />Watch together</button> : null}
              </div>
            ) : null}
            {!authLoading && !user ? (
              <Button color="secondary" size="lg" className="mb-5 w-full" onPress={() => { setOpen(false); openAuth(); }}>
                Sign in
              </Button>
            ) : null}
            <p className="text-xs font-medium text-[color:var(--ink-dim)]">Networks</p>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {NETWORK_CHANNELS.map((network) => {
                const member = network.memberSlug ? MEMBERS_BY_SLUG[network.memberSlug] : null;
                return (
                  <li key={network.slug}>
                    <Link prefetch={false}
                      href={`/channels/${network.slug}` as `/channels/${string}`}
                      onPointerEnter={() => prefetchOnIntent(`/channels/${network.slug}`)}
                      onFocus={() => prefetchOnIntent(`/channels/${network.slug}`)}
                      data-cursor-community={network.slug}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[4.5rem] cursor-pointer items-center gap-3 overflow-hidden rounded-xl bg-[color:var(--ui-surface)] p-3 transition-colors hover:bg-[color:var(--ui-hover)]"
                    >
                      <span aria-hidden="true" className="relative hidden size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-black min-[360px]:grid">
                        {network.slug === "core" ? <CoreWordmark className="text-xl text-white" /> : <Image src={network.artwork} alt="" fill sizes="36px" className="object-contain p-1" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-[color:var(--ink)]">{network.name}</span>
                        <span className="mt-1 block truncate text-[11px] text-[color:var(--ink-dim)]">{member ? `@${member.twitchLogin}` : "All CORE"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 text-xs font-medium text-[color:var(--ink-dim)]">Watch</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  ["/", "Watch"],
                  ["/channels/core?mode=continuous", "24/7"],
                  ["/shorts", "Shorts"],
                  ["/guide", "Guide"],
                ] as Array<[string, string]>
              ).map(([href, label]) => (
                <Link prefetch={false}
                  key={href}
                  href={href as never}
                  onPointerEnter={() => prefetchOnIntent(href)}
                  onFocus={() => prefetchOnIntent(href)}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3.5 py-2 text-sm font-medium text-[color:var(--ink)] cursor-pointer transition-colors hover:bg-[color:var(--surface)]"
                >
                  {label}
                </Link>
              ))}
            </div>

            {/* Account + theme controls — mirror the desktop right rail so
                everything reachable on desktop is reachable here too. */}
            {authLoading || user ? <p className="mt-6 text-xs font-medium text-[color:var(--ink-dim)]">Account</p> : null}
            <div className="mt-3 flex items-center gap-2">
              {authLoading ? (
                <span
                  aria-label="Loading account"
                  className="inline-flex min-h-11 flex-1 animate-pulse items-center justify-center rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-sm text-[color:var(--ink-faint)]"
                >
                  Account
                </span>
              ) : user ? (
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <Link prefetch={false}
                    href={"/passport" as Route}
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                  >
                    <Award size={16} aria-hidden />
                    CORE Passport
                  </Link>
                  <Link prefetch={false}
                    href={"/dvr" as never}
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                  >
                    <Bookmark size={16} aria-hidden />
                    DVR
                  </Link>
                  <Link prefetch={false}
                    href="/account/settings"
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                  >
                    <UserRound size={16} aria-hidden />
                    Account settings
                  </Link>
                  <Link prefetch={false}
                    href="/account/settings/billing"
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                  >
                    <Gem size={16} aria-hidden />
                    Billing
                  </Link>
                </div>
              ) : null}
            </div>

          </nav>
        </div>
      ) : null}

      {/* Live members modal — portaled to document.body so it escapes the
          navbar's `backdrop-filter`, which would otherwise turn the
          navbar into the containing block for this `fixed` element and
          break centering once the navbar gains its scrolled blur. */}
      {mounted && liveModalOpen && liveCount > 0
        ? createPortal(
            <LiveNowModal
              entries={liveEntries}
              youtubeEntries={youtubeLiveEntries}
              combinedViewers={combinedViewers}
              onClose={() => setLiveModalOpen(false)}
            />,
            document.body,
          )
        : null}
    </header>
  );
}

function NavLink({
  href,
  onIntent,
  children,
  primary = false,
  active = false,
}: {
  href: string;
  onIntent?: () => void;
  children: React.ReactNode;
  primary?: boolean;
  active?: boolean;
}) {
  return (
    <Link prefetch={false}
      href={href as never}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      aria-current={active ? "page" : undefined}
      className={cn(
        "core-topnav__link relative inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors xl:px-3",
        active
          ? "text-[color:var(--ink)] after:absolute after:inset-x-3 after:bottom-1 after:h-px after:bg-[color:var(--ink)]"
          : primary
            ? "font-semibold text-[color:var(--ink)] hover:bg-[color:var(--bg-elev)]"
            : "text-[color:var(--ink-dim)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)]",
      )}
    >
      {children}
    </Link>
  );
}

function AccountMenuLink({
  href,
  icon: Icon,
  label,
  active = false,
  onSelect,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  label: string;
  active?: boolean;
  onSelect: () => void;
}) {
  return (
    <Link prefetch={false}
      href={href as never}
      role="menuitem"
      onClick={onSelect}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-[color:var(--surface)] text-[color:var(--ink)]"
          : "text-[color:var(--ink-dim)] hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]",
      )}
    >
      <Icon size={16} aria-hidden />
      {label}
    </Link>
  );
}
