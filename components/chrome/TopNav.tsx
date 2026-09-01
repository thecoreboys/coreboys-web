"use client";

import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Award,
  Bookmark,
  ChevronDown,
  Gem,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Button } from "@/components/base/buttons/button";
import { LiveNowModal } from "@/components/live/LiveNowModal";
import { useAuth } from "@/components/providers/AuthProvider";
import { openAuthModal } from "@/lib/auth/modal";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { useTheme } from "@/components/providers/ThemeProvider";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import { NETWORK_CHANNELS } from "@/lib/watch/channels";
import { cn } from "@/lib/utils";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { supporterPriceLabel, useSupporterBillingControls } from "@/hooks/useSupporterBillingControls";
import { NotificationBell } from "@/components/notifications/NotificationBell";

/**
 * Global top navigation. Sticky, glass-blurred at scroll > 8px.
 *
 * The Networks dropdown opens on hover (and remains keyboard/click
 * accessible). It closes on pointer exit, outside click, Escape, or route
 * selection.
 */
export function TopNav({
  initialAvatars: _initialAvatars,
}: {
  initialAvatars?: Record<string, string>;
} = {}) {
  const pathname = usePathname();
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
  useEffect(() => setMounted(true), []);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const accountDropdownRef = useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { data } = useLiveStatus();
  const liveEntries = (data?.live ?? []).filter((l) => l.isLive);
  const liveCount = liveEntries.length;
  const combinedViewers = liveEntries.reduce(
    (sum, e) => sum + (e.viewerCount ?? 0),
    0,
  );
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, loading: authLoading, logout } = useAuth();
  const supporterControls = useSupporterBillingControls();
  const supporterPrice = supporterControls?.renewalsDisabledAt
    ? "Closed"
    : supporterControls
      ? `${supporterPriceLabel(supporterControls.minimumAmountCents)}+`
      : "Monthly";
  const supporterAriaLabel = supporterControls?.renewalsDisabledAt
    ? "View CORE membership information; new recurring support is closed"
    : supporterControls
      ? `Support the CORE website from ${supporterPriceLabel(supporterControls.minimumAmountCents)} per month`
      : "Explore CORE website membership";

  const openAuth = (mode: "login" | "signup" = "login") => {
    openAuthModal({ mode, next: `${pathname}${searchParams.size ? `?${searchParams}` : ""}` });
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
        "relative z-40 transition-colors duration-300",
        solidChrome
          ? "border-b border-[color:var(--rule)] bg-[color:var(--bg)]/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto grid h-14 max-w-container grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:gap-4 sm:px-6 md:h-16 md:px-8">
        <Link
          href="/"
          aria-label="CORE — watch"
          className="group inline-flex w-fit min-w-0 shrink-0 items-center gap-2 cursor-pointer"
        >
          <span className="inline-flex" style={{ fontSize: "clamp(2.25rem, 2.75vw, 2.75rem)" }}>
            <CoreWordmark className="text-[color:var(--ink)] transition-transform group-hover:-translate-y-px" />
          </span>
        </Link>

        <nav className="hidden items-center justify-center gap-0.5 lg:flex">
          <NavLink
            href="/"
            primary
            active={pathname === "/" || pathname.startsWith("/watch") || pathname.startsWith("/theater")}
          >
            Watch
          </NavLink>
          <span aria-hidden className="mx-1 h-4 w-px bg-[color:var(--rule)]" />
          <NavLink
            href={"/channels/core?mode=continuous" as never}
            primary
            active={pathname === "/channels/core" && (searchParams.get("mode") === "continuous" || !searchParams.get("mode"))}
          >
            24/7
          </NavLink>
          <NavLink href="/shorts" primary active={pathname.startsWith("/shorts")}>
            Shorts
          </NavLink>
          <NavLink href="/guide" primary active={pathname === "/guide"}>
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
                "inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer xl:px-3",
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
                  <Link href="/guide" onClick={() => setMembersOpen(false)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-secondary hover:text-brand-secondary_hover">
                    Open guide →
                  </Link>
                </div>
                <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-7">
                  {NETWORK_CHANNELS.map((network) => {
                    const member = network.memberSlug ? MEMBERS_BY_SLUG[network.memberSlug] : null;
                    const username = member ? `@${member.twitchLogin}` : "All CORE";
                    return (
                      <li key={network.slug}>
                        <Link
                          href={`/channels/${network.slug}` as `/channels/${string}`}
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

        <div className="hidden items-center justify-end gap-2 lg:flex">
          {watchSearchAvailable ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("core-watch-search"))}
              onPointerEnter={() => window.dispatchEvent(new Event("core-watch-search-warm"))}
              onFocus={() => window.dispatchEvent(new Event("core-watch-search-warm"))}
              className="group inline-flex min-h-10 w-10 cursor-pointer items-center justify-start gap-2 rounded-lg bg-[color:var(--bg-elev)] px-2.5 text-sm font-semibold text-[color:var(--ink-dim)] ring-1 ring-inset ring-[color:var(--rule)] transition-[color,background-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)] hover:ring-[color:var(--ink-faint)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.28)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)] lg:w-36 xl:w-56 2xl:w-72"
              aria-label="Search CORE Watch"
              aria-keyshortcuts="Control+K Meta+K /"
            >
              <Search size={16} aria-hidden className="shrink-0 transition-transform duration-150 group-hover:scale-110" />
              <span className="hidden whitespace-nowrap lg:inline">Search</span>
            </button>
          ) : null}

          <Link
            href="/upgrade"
            data-cursor-hint="Explore member benefits"
            aria-label={supporterAriaLabel}
            className="nav-membership-cta group relative isolate hidden min-h-10 items-center gap-2 overflow-hidden rounded-lg px-3 text-xs font-bold text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200 lg:inline-flex"
          >
            <span className="grid size-5 place-items-center rounded-md bg-white/15 ring-1 ring-inset ring-white/20">
              <Gem size={13} aria-hidden />
            </span>
            <span className="whitespace-nowrap">Support the site</span>
            <span className="hidden text-[10px] font-semibold text-white/70 xl:inline">{supporterPrice}</span>
          </Link>

          {/* LIVE / OFFLINE pill — opens member-picker modal when live.
              When live, the whole pill blinks red (live-pill-blink) and
              shows the combined viewer count across every live member. */}
          {liveCount > 0 ? (
            <button
              type="button"
              onClick={() => setLiveModalOpen(true)}
              className="live-pill-blink group relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 shadow-xs-skeuomorphic cursor-pointer"
              aria-label={`Live — ${liveCount} ${liveCount === 1 ? "person" : "people"} — open picker`}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full bg-[color:var(--core)] shadow-[0_0_8px_rgba(219,3,104,0.7)]"
                style={{ animation: "live-blink 1s ease-in-out infinite" }}
              />
              <span className="text-xs font-bold tracking-tight text-[color:var(--core)]">
                LIVE
                <span className="mx-1.5 text-[color:var(--core)]/50">·</span>
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

          {/* Theme stays in account / mobile — not identity chrome. */}

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
                        href="/account"
                        icon={UserRound}
                        label="Account"
                        active={pathname === "/account"}
                        onSelect={() => setAccountOpen(false)}
                      />
                      <AccountMenuLink
                        href="/account/settings"
                        icon={Settings}
                        label="Settings"
                        active={pathname.startsWith("/account/settings")}
                        onSelect={() => setAccountOpen(false)}
                      />
                      <AccountMenuLink
                        href="/account/plan"
                        icon={Gem}
                        label="Billing"
                        active={pathname.startsWith("/account/plan")}
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
        <div className="col-start-3 flex items-center gap-1 justify-self-end lg:hidden">
          {watchSearchAvailable ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("core-watch-search"))}
              onPointerEnter={() => window.dispatchEvent(new Event("core-watch-search-warm"))}
              onFocus={() => window.dispatchEvent(new Event("core-watch-search-warm"))}
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-[color:var(--ink-dim)] ring-1 ring-inset ring-[color:var(--rule)] transition-[color,background-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)] hover:ring-[color:var(--ink-faint)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.24)] active:translate-y-0 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)]"
              aria-label="Search CORE Watch"
            >
              <Search size={18} aria-hidden />
            </button>
          ) : null}
          {user ? <NotificationBell variant="mobile" /> : null}
          <ButtonUtility
            size="sm"
            color="secondary"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            icon={open ? X : Menu}
            className="min-h-11 min-w-11 shrink-0"
          />
        </div>
      </div>

      {open ? (
        <div className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-t border-[color:var(--rule)] bg-[color:var(--bg)] lg:hidden">
          <nav className="mx-auto max-w-container px-4 py-4 sm:px-6">
            <p className="eyebrow">Networks</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
              {NETWORK_CHANNELS.map((network) => {
                const member = network.memberSlug ? MEMBERS_BY_SLUG[network.memberSlug] : null;
                return (
                  <li key={network.slug}>
                    <Link
                      href={`/channels/${network.slug}` as `/channels/${string}`}
                      data-cursor-community={network.slug}
                      onClick={() => setOpen(false)}
                      className="group relative flex min-h-[6.5rem] items-end overflow-hidden rounded-xl border border-[color:var(--rule)] bg-black p-2.5 cursor-pointer transition-colors hover:border-[color:var(--rule-strong)]"
                    >
                      <Image src={network.backdrop} alt="" fill sizes="50vw" className="object-cover opacity-75 transition duration-300 group-hover:scale-105 group-hover:opacity-100" />
                      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                      <Image src={network.artwork} alt="" width={112} height={48} className={cn("absolute left-1/2 top-3 h-10 w-[78%] -translate-x-1/2 object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.8)]", network.slug === "marlon" && "scale-[1.3]")} />
                      <span className="relative min-w-0">
                        <span className="block text-xs font-semibold text-white">{network.name}</span>
                        <span className="mt-0.5 block break-words text-[10px] leading-snug text-white/65">{member ? `@${member.twitchLogin}` : "All CORE"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <p className="eyebrow mt-6">Watch</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  ["/", "Watch"],
                  ["/channels/core?mode=continuous", "24/7"],
                  ["/shorts", "Shorts"],
                  ["/guide", "Guide"],
                ] as Array<[string, string]>
              ).map(([href, label]) => (
                <Link
                  key={href}
                  href={href as never}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3.5 py-2 text-sm font-medium text-[color:var(--ink)] cursor-pointer transition-colors hover:bg-[color:var(--surface)]"
                >
                  {label}
                </Link>
              ))}
            </div>

            <Link
              href="/upgrade"
              onClick={() => setOpen(false)}
              className="relative mt-5 flex min-h-12 items-center justify-between overflow-hidden rounded-xl border border-pink-300/35 px-3.5 text-sm font-bold text-white shadow-[0_10px_26px_rgba(190,8,109,0.25)]"
            >
              <span aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_120%,rgba(255,89,177,0.74),transparent_48%),linear-gradient(135deg,rgba(124,17,83,0.96),rgba(55,17,82,0.96))]" />
              <span className="inline-flex items-center gap-2"><Gem size={16} aria-hidden /> Support the site</span>
              <span className="text-xs font-medium text-white/75">{supporterPrice}</span>
            </Link>

            {/* Account + theme controls — mirror the desktop right rail so
                everything reachable on desktop is reachable here too. */}
            <p className="eyebrow mt-6">Account</p>
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
                  <Link
                    href={"/passport" as Route}
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                  >
                    <Award size={16} aria-hidden />
                    CORE Passport
                  </Link>
                  <Link
                    href={"/dvr" as never}
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                  >
                    <Bookmark size={16} aria-hidden />
                    DVR
                  </Link>
                  <Link
                    href="/account"
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                  >
                    <UserRound size={16} aria-hidden />
                    Account
                  </Link>
                  <Link
                    href="/account/plan"
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                  >
                    <Gem size={16} aria-hidden />
                    Billing
                  </Link>
                </div>
              ) : (
                <Button color="secondary" size="lg" className="flex-1" onPress={() => { setOpen(false); openAuth(); }}>
                  Sign in
                </Button>
              )}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] shadow-xs-skeuomorphic transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
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
  children,
  primary = false,
  active = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
  active?: boolean;
}) {
  return (
    <Link
      href={href as never}
      className={cn(
        "cursor-pointer rounded-md px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors xl:px-3",
        active
          ? "bg-[color:var(--bg-elev)] text-[color:var(--ink)]"
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
    <Link
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
