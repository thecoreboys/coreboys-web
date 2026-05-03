"use client";

import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Instagram, Menu, Moon, Sun, X, Youtube } from "lucide-react";

function TikTokGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function XGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { useTwitchProfiles } from "@/hooks/useTwitchProfiles";
import { useTheme } from "@/components/providers/ThemeProvider";
import { MEMBERS } from "@/lib/members";
import { GROUP } from "@/lib/group";
import { cn } from "@/lib/utils";

const GROUP_SOCIAL_LINKS: Array<{
  href: string;
  Icon: React.ComponentType<{ size?: number }>;
  label: string;
  handle: string;
  /** Brand color used on hover in dark mode. */
  brand: string;
  /** Brand color used on hover in light mode (defaults to brand). */
  brandLight?: string;
}> = [
  {
    href: GROUP.socials.youtube.url,
    Icon: Youtube,
    label: "YouTube",
    handle: GROUP.socials.youtube.handle,
    brand: "#FF0033",
  },
  {
    href: GROUP.socials.tiktok.url,
    Icon: TikTokGlyph,
    label: "TikTok",
    handle: GROUP.socials.tiktok.handle,
    brand: "#FE2C55",
  },
  {
    href: GROUP.socials.instagram.url,
    Icon: Instagram,
    label: "Instagram",
    handle: GROUP.socials.instagram.handle,
    brand: "#E1306C",
  },
  {
    href: GROUP.socials.x.url,
    Icon: XGlyph,
    label: "X",
    handle: GROUP.socials.x.handle,
    brand: "#FFFFFF",
    brandLight: "#0a0a0a",
  },
];

/**
 * Global top navigation. Sticky, glass-blurred at scroll > 8px.
 *
 * The Members dropdown is **click-driven** (not hover-driven) so the
 * gap between trigger and panel doesn't kill the interaction. Closes
 * on outside click, Escape, or selecting a route.
 */
export function TopNav({
  initialAvatars,
}: {
  initialAvatars?: Record<string, string>;
} = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  // Mount flag so the portal target (`document.body`) is only consulted
  // after hydration. `typeof window` checks at render time are subtle —
  // on the first client render the body may still be the SSR markup,
  // and createPortal can quietly resolve into a containing-block-bound
  // ancestor instead of body. This guarantees a post-hydration mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const { data } = useLiveStatus();
  const liveEntries = (data?.live ?? []).filter((l) => l.isLive);
  const liveCount = liveEntries.length;
  const combinedViewers = liveEntries.reduce(
    (sum, e) => sum + (e.viewerCount ?? 0),
    0,
  );
  const liveProfiles = useTwitchProfiles();
  // Server pre-fetch first; client SWR fills in if it has fresher data.
  const profiles = { ...(initialAvatars ?? {}), ...liveProfiles };
  const { theme, toggle: toggleTheme } = useTheme();

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

  return (
    <header
      className={cn(
        "relative z-40 transition-colors duration-300",
        scrolled
          ? "border-b border-[color:var(--rule)] bg-[color:var(--bg)]/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto grid h-14 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 md:h-16 md:px-8">
        <Link
          href="/"
          aria-label="CORE — home"
          className="group inline-flex w-fit items-center gap-2 cursor-pointer"
        >
          <span className="font-logo text-[24px] leading-none text-[color:var(--ink)] transition-transform group-hover:-translate-y-px md:text-[26px]">
            CORE
          </span>
        </Link>

        <nav className="hidden items-center justify-center gap-1 md:flex">
          <NavLink href="/">Home</NavLink>
          <div
            className="relative"
            ref={dropdownRef}
            onMouseEnter={() => setMembersOpen(true)}
            onMouseLeave={() => setMembersOpen(false)}
          >
            <button
              type="button"
              onClick={() => setMembersOpen((v) => !v)}
              aria-expanded={membersOpen}
              aria-haspopup="menu"
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer",
                membersOpen
                  ? "bg-[color:var(--bg-elev)] text-[color:var(--ink)]"
                  : "text-[color:var(--ink-dim)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)]",
              )}
            >
              Members
              <ChevronDown
                size={14}
                className={cn("transition-transform", membersOpen && "rotate-180")}
              />
            </button>
            {membersOpen ? (
              <div
                role="menu"
                className="absolute left-1/2 top-full w-[760px] max-w-[calc(100vw-3rem)] -translate-x-1/2 pt-2"
              >
                <div
                  className="overflow-hidden rounded-2xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)] backdrop-blur"
                >
                <div className="flex items-center justify-between border-b border-[color:var(--rule)] bg-[color:var(--surface)] px-4 py-2.5">
                  <span className="text-[11px] font-semibold tracking-tight text-[color:var(--ink)]">
                    Roster · 6 members
                  </span>
                  <Link
                    href="/chat"
                    onClick={() => setMembersOpen(false)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--core)]"
                  >
                    Watch all chats →
                  </Link>
                </div>
                <ul className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-6">
                  {MEMBERS.map((m) => {
                    const avatar = m.portrait ?? profiles[m.twitchLogin.toLowerCase()];
                    return (
                      <li key={m.slug}>
                        <Link
                          href={`/m/${m.slug}` as `/m/${string}`}
                          onClick={() => setMembersOpen(false)}
                          className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-[color:var(--rule)] bg-black transition-all duration-300 cursor-pointer"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = m.accent;
                            e.currentTarget.style.boxShadow = `0 8px 24px -12px ${m.accent}99, inset 0 0 0 1px ${m.accent}55`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "";
                            e.currentTarget.style.boxShadow = "";
                          }}
                        >
                          <Image
                            src={avatar}
                            alt={m.stageName}
                            fill
                            sizes="120px"
                            className="object-cover grayscale-[0.35] transition duration-500 group-hover:grayscale-0 group-hover:scale-[1.05]"
                          />
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0"
                            style={{
                              background:
                                "linear-gradient(180deg, transparent 45%, rgba(8,8,10,0.92) 100%)",
                            }}
                          />
                          <span className="absolute inset-x-2 bottom-2 flex flex-col leading-tight">
                            <span className="text-[12px] font-bold tracking-tight text-on-image">
                              {m.stageName}
                            </span>
                            <span className="mt-0.5 truncate text-[10px] font-medium text-on-image-dim">
                              {m.realName}
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
          <NavLink href="/fanzone">Fanzone</NavLink>
          <NavLink href="/media">Photos</NavLink>
          <NavLink href="/clips">Clips</NavLink>
          <NavLink href="/chat">Chat</NavLink>
        </nav>

        <div className="hidden items-center justify-end gap-2 md:flex">
          {/* Group socials */}
          <ul className="flex items-center gap-1 border-r border-[color:var(--rule)] pr-2">
            {GROUP_SOCIAL_LINKS.map((s) => {
              const brand = theme === "light" ? (s.brandLight ?? s.brand) : s.brand;
              return (
              <li key={s.href} className="relative group">
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`CORE on ${s.label} (${s.handle})`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] transition-all hover:-translate-y-px"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = brand;
                    e.currentTarget.style.borderColor = brand;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.borderColor = "";
                  }}
                >
                  <s.Icon size={13} />
                </a>
                {/* Tooltip */}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg)] px-2.5 py-1.5 font-mono text-[12px] text-[color:var(--ink)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                >
                  {s.handle}
                </span>
              </li>
              );
            })}
          </ul>

          {/* LIVE / OFFLINE pill — opens member-picker modal when live.
              When live, the whole pill blinks red (live-pill-blink) and
              shows the combined viewer count across every live member. */}
          {liveCount > 0 ? (
            <button
              type="button"
              onClick={() => setLiveModalOpen(true)}
              className="live-pill-blink group relative inline-flex items-center gap-2 rounded-md border px-3 py-1.5 cursor-pointer"
              aria-label={`Live${combinedViewers > 0 ? ` — ${combinedViewers.toLocaleString("en-US")} watching` : ""} — open member picker`}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full bg-[color:var(--core)] shadow-[0_0_8px_rgba(239,68,68,0.7)]"
                style={{ animation: "live-blink 1s ease-in-out infinite" }}
              />
              <span className="text-[11px] font-bold tracking-tight text-[color:var(--core)]">
                LIVE
                {combinedViewers > 0 ? (
                  <>
                    <span className="mx-1.5 text-[color:var(--core)]/50">·</span>
                    <span className="tabular-nums">{formatCompactCount(combinedViewers)}</span>
                  </>
                ) : null}
              </span>
            </button>
          ) : (
            <span
              className="inline-flex items-center gap-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-1.5"
              aria-label="No one is live"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ink-faint)]" aria-hidden />
              <span className="text-[11px] font-medium tracking-tight text-[color:var(--ink-dim)]">
                OFFLINE
              </span>
            </span>
          )}

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)] cursor-pointer"
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>

        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center justify-self-end rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] cursor-pointer transition-colors hover:bg-[color:var(--surface)] md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[color:var(--rule)] bg-[color:var(--bg)] md:hidden">
          <nav className="mx-auto max-w-[1440px] px-6 py-4">
            <p className="eyebrow">Members</p>
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {MEMBERS.map((m) => {
                const avatar = m.portrait ?? profiles[m.twitchLogin.toLowerCase()];
                return (
                  <li key={m.slug}>
                    <Link
                      href={`/m/${m.slug}` as `/m/${string}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-2 cursor-pointer transition-colors hover:bg-[color:var(--surface)]"
                    >
                      <span className="relative h-7 w-7 overflow-hidden rounded-full">
                        <Image src={avatar} alt="" fill sizes="28px" className="object-cover" />
                      </span>
                      <span className="truncate text-[12px] font-medium">{m.stageName}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {(
                [
                  ["/", "Home"],
                  ["/fanzone", "Fanzone"],
                  ["/media", "Photos"],
                  ["/clips", "Clips"],
                ] as Array<[string, string]>
              ).map(([href, label]) => (
                <Link
                  key={href}
                  href={href as never}
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-[13px] font-medium text-[color:var(--ink)] cursor-pointer transition-colors hover:bg-[color:var(--surface)]"
                >
                  {label}
                </Link>
              ))}
              {/* /chat tile — matches the desktop LIVE pill: count of
                  live members + combined viewer total when applicable. */}
              <Link
                href="/chat"
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-md border px-3 py-2 text-[13px] font-medium cursor-pointer transition-colors",
                  liveCount > 0
                    ? "border-[color:var(--core)]/60 bg-[color:var(--core)]/12 text-[color:var(--core)] hover:bg-[color:var(--core)]/18"
                    : "border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink)] hover:bg-[color:var(--surface)]",
                )}
              >
                {liveCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-[color:var(--core)]"
                      style={{ animation: "live-blink 1s ease-in-out infinite" }}
                    />
                    <span className="font-bold tracking-tight">LIVE · {liveCount}</span>
                    {combinedViewers > 0 ? (
                      <>
                        <span className="text-[color:var(--core)]/50">·</span>
                        <span className="tabular-nums">{formatCompactCount(combinedViewers)} watching</span>
                      </>
                    ) : null}
                  </span>
                ) : (
                  "Chat · offline"
                )}
              </Link>
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Live members"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setLiveModalOpen(false)}
        >
          <div
            className="relative w-full max-w-[480px] overflow-hidden rounded-xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--rule)] bg-[color:var(--surface)] px-4 py-3">
              <div className="inline-flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full bg-white"
                  style={{ animation: "live-blink 1s ease-in-out infinite" }}
                />
                <span className="text-[12px] font-bold uppercase tracking-tight text-[color:var(--core)]">
                  LIVE · {liveCount}
                </span>
                {combinedViewers > 0 ? (
                  <>
                    <span className="text-[color:var(--ink-faint)]" aria-hidden>
                      ·
                    </span>
                    <span className="text-[12px] font-semibold tabular-nums text-[color:var(--ink)]">
                      {combinedViewers.toLocaleString("en-US")}{" "}
                      <span className="font-normal text-[color:var(--ink-dim)]">watching</span>
                    </span>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setLiveModalOpen(false)}
                aria-label="Close"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[color:var(--ink-dim)] transition-colors hover:bg-[color:var(--bg)] hover:text-[color:var(--ink)]"
              >
                <X size={14} />
              </button>
            </div>
            <ul className="flex flex-col p-2">
              {liveEntries.map((e) => {
                const member = MEMBERS.find(
                  (m) => m.twitchLogin.toLowerCase() === e.login.toLowerCase(),
                );
                if (!member) return null;
                const avatar = member.portrait ?? profiles[e.login.toLowerCase()];
                return (
                  <li key={e.login}>
                    <a
                      href={`https://twitch.tv/${e.login}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setLiveModalOpen(false)}
                      className="group flex items-center gap-3 rounded-md px-3 py-3 transition-colors cursor-pointer hover:bg-[color:var(--surface)]"
                    >
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-inset"
                        style={{ ["--tw-ring-color" as string]: `${member.accent}88` }}
                      >
                        <Image src={avatar} alt="" fill sizes="40px" className="object-cover" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-[color:var(--ink)]">
                          {member.stageName}
                        </p>
                        <p className="truncate text-[11px] text-[color:var(--ink-dim)]">
                          {e.title ?? "Streaming"}
                        </p>
                        {e.viewerCount != null ? (
                          <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--core)]">
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 rounded-full bg-[color:var(--core)]"
                              style={{ animation: "live-blink 1s ease-in-out infinite" }}
                            />
                            {e.viewerCount.toLocaleString("en-US")} watching
                          </p>
                        ) : null}
                      </div>
                      <span
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-tight"
                        style={{
                          borderColor: "rgba(145,70,255,0.5)",
                          background: "rgba(145,70,255,0.12)",
                          color: "#9146FF",
                        }}
                      >
                        Watch ↗
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-[color:var(--rule)] bg-[color:var(--bg)] p-3">
              <Link
                href="/chat"
                onClick={() => setLiveModalOpen(false)}
                className="group/cta inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[color:var(--core)] bg-[color:var(--core)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-tight text-white transition-all hover:-translate-y-px hover:shadow-[0_8px_20px_-6px_rgba(239,68,68,0.55)] active:translate-y-0"
              >
                Open all chats
                <span className="transition-transform group-hover/cta:translate-x-0.5" aria-hidden>
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>,
        document.body,
        )
        : null}
    </header>
  );
}

/** Compact viewer-count format: 12 → 12, 2300 → 2.3K, 1.5M → 1.5M. */
function formatCompactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href as never}
      className="rounded-md px-3 py-2 text-[13px] font-medium text-[color:var(--ink-dim)] transition-colors hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)] cursor-pointer"
    >
      {children}
    </Link>
  );
}
