"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Maximize2, Minimize2, Minus, Plus, RotateCcw, Settings2, Tv, TvMinimal, X } from "lucide-react";
import { TwitchChat } from "@/components/live/TwitchChat";
import { useLiveStatus } from "@/hooks/useLiveStatus";

const TEXT_SCALE_MIN = 0.7;
const TEXT_SCALE_MAX = 1.8;
const TEXT_SCALE_STEP = 0.1;

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, Math.round(n * 10) / 10));
}

const STORAGE_KEY = "coreboys-chat-hub:v1";

export type ChatChannel = {
  /** Twitch login. */
  login: string;
  /** Twitch numeric user ID — required for BTTV/7TV. */
  userId: string;
  /** Display name (Twitch's display_name or stage name). */
  displayName: string;
  /** Twitch profile picture URL. */
  avatarUrl?: string;
  /** Member-accent color, falls back to Twitch purple for guests. */
  accent: string;
  /** Whether this channel is one of the six CORE members. */
  isCore: boolean;
  /** For CORE members only — slug for the comm/portrait link. */
  slug?: string;
  /** For CORE members only — comm logo path. */
  commLogo?: string;
  /** For CORE members only — comm name. */
  commName?: string;
};

type Persisted = {
  /** Logins the viewer has explicitly hidden — wins over auto-show. */
  hidden: string[];
  /** Logins the viewer has explicitly pinned visible — wins over the
   *  default "hide if offline" behavior. */
  shown?: string[];
  guests: Array<Pick<ChatChannel, "login" | "userId" | "displayName" | "avatarUrl">>;
  /** Login order — applied to both core + guest channels. Anything not
   *  listed here falls to its natural position at the end. */
  order?: string[];
  /** Multiplier applied to chat font + emote sizing across every tile. */
  textScale?: number;
  /** Whether the multistream player grid is visible above the chats. */
  streamsVisible?: boolean;
};

export type ChatHubProps = {
  coreChannels: ChatChannel[];
};

/**
 * Customizable chat hub. Renders the six CORE channels by default plus
 * any guest channels the viewer has added. State (hidden core members,
 * guest channels) persists to localStorage; nothing leaves the browser.
 *
 * The settings panel is a slide-down sheet anchored under the page title.
 * Modern UI — checkboxes for the six CORE members, a small input + Add
 * button for guest channels, "reset to defaults" link at the bottom.
 */
export function ChatHub({ coreChannels }: ChatHubProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState<ChatChannel[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftLogin, setDraftLogin] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [dragLogin, setDragLogin] = useState<string | null>(null);
  const [dragOverLogin, setDragOverLogin] = useState<string | null>(null);
  const [dragOverSide, setDragOverSide] = useState<"before" | "after">("before");
  const [mobileActive, setMobileActive] = useState<string | null>(null);
  const [textScale, setTextScale] = useState<number>(1);
  const [streamsVisible, setStreamsVisible] = useState<boolean>(true);
  const [playerParent, setPlayerParent] = useState<string | null>(null);
  const fullscreenRootRef = useRef<HTMLDivElement | null>(null);

  // Twitch's player iframe rejects requests until the embedding host
  // is sent as `parent=`. Defer mounting the stream grid until we know
  // the hostname client-side.
  useEffect(() => {
    setPlayerParent(window.location.hostname);
  }, []);

  // Real browser fullscreen via the Fullscreen API. Sync the local
  // boolean with the actual document.fullscreenElement so the user
  // exiting via ESC / browser chrome flips our state too.
  const toggleFullscreen = useCallback(() => {
    const el = fullscreenRootRef.current ?? document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      const isFs = !!document.fullscreenElement;
      setFullscreen(isFs);
      // Collapse the customize sheet when entering fullscreen so the
      // chat grid gets the full viewport.
      if (isFs) setSettingsOpen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Hydrate persisted state.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Persisted;
      if (Array.isArray(parsed.hidden)) {
        setHidden(new Set(parsed.hidden.map((s) => s.toLowerCase())));
      }
      if (Array.isArray(parsed.shown)) {
        setShown(new Set(parsed.shown.map((s) => s.toLowerCase())));
      }
      if (Array.isArray(parsed.guests)) {
        setGuests(
          parsed.guests.map((g) => ({
            login: g.login.toLowerCase(),
            userId: g.userId,
            displayName: g.displayName || g.login,
            avatarUrl: g.avatarUrl,
            accent: "#9146FF",
            isCore: false,
          })),
        );
      }
      if (Array.isArray(parsed.order)) {
        setOrder(parsed.order.map((s) => s.toLowerCase()));
      }
      if (typeof parsed.textScale === "number" && Number.isFinite(parsed.textScale)) {
        setTextScale(clampScale(parsed.textScale));
      }
      if (typeof parsed.streamsVisible === "boolean") {
        setStreamsVisible(parsed.streamsVisible);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback(
    (
      nextHidden: Set<string>,
      nextShown: Set<string>,
      nextGuests: ChatChannel[],
      nextOrder: string[],
      nextTextScale: number,
      nextStreamsVisible: boolean,
    ) => {
      const payload: Persisted = {
        hidden: [...nextHidden],
        shown: [...nextShown],
        guests: nextGuests.map((g) => ({
          login: g.login,
          userId: g.userId,
          displayName: g.displayName,
          avatarUrl: g.avatarUrl,
        })),
        order: nextOrder,
        textScale: nextTextScale,
        streamsVisible: nextStreamsVisible,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // Live status — drives the auto-hide-when-offline default. SWR
  // refresh interval lives in useLiveStatus (60s).
  const { data: liveData } = useLiveStatus();
  const liveByLogin = useMemo(() => {
    const set = new Set<string>();
    for (const e of liveData?.live ?? []) {
      if (e.isLive) set.add(e.login.toLowerCase());
    }
    return set;
  }, [liveData]);

  /**
   * Toggle the effective visibility of a CORE channel:
   *   - hidden ∪ shown encode the user's explicit overrides
   *   - default: visible iff live, hidden otherwise
   *   - clicking ON  → drop from hidden, pin in shown when offline
   *   - clicking OFF → add to hidden, drop from shown
   */
  const toggleChannelVisibility = useCallback(
    (login: string, isCurrentlyVisible: boolean) => {
      const lower = login.toLowerCase();
      const isLive = liveByLogin.has(lower);
      const nextHidden = new Set(hidden);
      const nextShown = new Set(shown);
      if (isCurrentlyVisible) {
        nextHidden.add(lower);
        nextShown.delete(lower);
      } else {
        nextHidden.delete(lower);
        if (!isLive) nextShown.add(lower);
        // No need to explicitly mark live channels as shown — the
        // default for live IS show, so just removing them from hidden
        // is sufficient.
      }
      setHidden(nextHidden);
      setShown(nextShown);
      persist(nextHidden, nextShown, guests, order, textScale, streamsVisible);
    },
    [hidden, shown, liveByLogin, guests, order, persist, textScale, streamsVisible],
  );

  const removeGuest = useCallback(
    (login: string) => {
      setGuests((prev) => {
        const next = prev.filter((g) => g.login.toLowerCase() !== login.toLowerCase());
        persist(hidden, shown, next, order, textScale, streamsVisible);
        return next;
      });
    },
    [hidden, shown, order, persist, textScale, streamsVisible],
  );

  /** Move `dragged` to before/after `target`. */
  const reorder = useCallback(
    (dragged: string, target: string, side: "before" | "after") => {
      if (dragged === target) return;
      const all = [...coreChannels.map((c) => c.login.toLowerCase()), ...guests.map((g) => g.login.toLowerCase())];
      const seen = new Set(all);
      // Build the current effective order: stored order ∪ any new logins.
      const current = [...order.filter((l) => seen.has(l)), ...all.filter((l) => !order.includes(l))];
      const fromIdx = current.indexOf(dragged);
      if (fromIdx < 0) return;
      current.splice(fromIdx, 1);
      const toIdx = current.indexOf(target);
      if (toIdx < 0) return;
      current.splice(side === "before" ? toIdx : toIdx + 1, 0, dragged);
      setOrder(current);
      persist(hidden, shown, guests, current, textScale, streamsVisible);
    },
    [coreChannels, guests, hidden, shown, order, persist, textScale, streamsVisible],
  );

  const adjustTextScale = useCallback(
    (delta: number) => {
      setTextScale((prev) => {
        const next = clampScale(prev + delta);
        persist(hidden, shown, guests, order, next, streamsVisible);
        return next;
      });
    },
    [hidden, shown, guests, order, persist, streamsVisible],
  );

  const resetTextScale = useCallback(() => {
    setTextScale(1);
    persist(hidden, shown, guests, order, 1, streamsVisible);
  }, [hidden, shown, guests, order, persist, streamsVisible]);

  const toggleStreams = useCallback(() => {
    setStreamsVisible((prev) => {
      const next = !prev;
      persist(hidden, shown, guests, order, textScale, next);
      return next;
    });
  }, [hidden, shown, guests, order, persist, textScale]);

  const addGuest = useCallback(async () => {
    const cleaned = draftLogin.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!cleaned) {
      setAddError("Enter a Twitch username");
      return;
    }
    if (coreChannels.some((c) => c.login.toLowerCase() === cleaned)) {
      setAddError("That's a CORE member — already in the hub");
      return;
    }
    if (guests.some((g) => g.login.toLowerCase() === cleaned)) {
      setAddError("Already added");
      return;
    }

    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/twitch/user/${encodeURIComponent(cleaned)}`);
      if (!res.ok) {
        setAddError(res.status === 404 ? "Twitch user not found" : "Couldn't look up that user");
        return;
      }
      const data: { id: string; login: string; displayName: string; profileImageUrl: string | null } =
        await res.json();
      const next: ChatChannel = {
        login: data.login.toLowerCase(),
        userId: data.id,
        displayName: data.displayName,
        avatarUrl: data.profileImageUrl ?? undefined,
        accent: "#9146FF",
        isCore: false,
      };
      const nextGuests = [...guests, next];
      setGuests(nextGuests);
      persist(hidden, shown, nextGuests, order, textScale, streamsVisible);
      setDraftLogin("");
    } catch {
      setAddError("Network error — try again");
    } finally {
      setAdding(false);
    }
  }, [draftLogin, coreChannels, guests, hidden, shown, order, persist, textScale, streamsVisible]);

  const reset = useCallback(() => {
    setHidden(new Set());
    setShown(new Set());
    setGuests([]);
    setOrder([]);
    setTextScale(1);
    setStreamsVisible(true);
    persist(new Set(), new Set(), [], [], 1, true);
  }, [persist]);

  /** Effective visibility per CORE channel:
   *    - explicit `hidden` always wins (hide it regardless of state)
   *    - otherwise: live channels show; offline channels show only if
   *      pinned in `shown` … UNLESS no one is currently live, in which
   *      case the chat page falls back to showing everyone so the room
   *      isn't empty when the entire group is offline. */
  const anyoneLive = liveByLogin.size > 0;
  const isCoreVisible = useCallback(
    (login: string): boolean => {
      const lower = login.toLowerCase();
      if (hidden.has(lower)) return false;
      if (liveByLogin.has(lower)) return true;
      if (shown.has(lower)) return true;
      return !anyoneLive;
    },
    [hidden, shown, liveByLogin, anyoneLive],
  );

  const visibleCore = useMemo(
    () => coreChannels.filter((c) => isCoreVisible(c.login)),
    [coreChannels, isCoreVisible],
  );

  const visible: ChatChannel[] = useMemo(() => {
    const merged = [...visibleCore, ...guests];
    if (order.length === 0) return merged;
    const byLogin = new Map(merged.map((c) => [c.login.toLowerCase(), c] as const));
    const sorted: ChatChannel[] = [];
    for (const login of order) {
      const ch = byLogin.get(login);
      if (ch) {
        sorted.push(ch);
        byLogin.delete(login);
      }
    }
    // Append any channels not in the saved order (newcomers).
    for (const ch of byLogin.values()) sorted.push(ch);
    return sorted;
  }, [visibleCore, guests, order]);

  // Default the mobile active chat to the first visible channel; when the
  // active one disappears (hidden / removed), fall back to the first.
  const activeMobileLogin = (() => {
    if (mobileActive && visible.some((c) => c.login.toLowerCase() === mobileActive)) {
      return mobileActive;
    }
    return visible[0]?.login.toLowerCase() ?? null;
  })();

  // Grid column count adapts to channel count. As channels are toggled
  // off, the remaining ones fan out to fill the row.
  const gridCols = (() => {
    const n = visible.length;
    if (n <= 1) return "grid-cols-1";
    if (n === 2) return "grid-cols-1 md:grid-cols-2";
    if (n === 3) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    if (n === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
    if (n === 5) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
    if (n === 6) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6";
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  })();

  return (
    <div
      ref={fullscreenRootRef}
      className={`bg-[color:var(--bg)] ${fullscreen ? "flex h-screen flex-col overflow-hidden" : ""}`}
    >
      {/* Action bar — clean, minimal. */}
      <div
        className={`flex items-center justify-end gap-2 ${
          fullscreen ? "shrink-0 px-4 pt-4 pb-3" : "mb-5"
        }`}
      >
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--ink-dim)] transition-all hover:-translate-y-px hover:border-[color:var(--core)] hover:text-[color:var(--ink)] cursor-pointer"
        >
          <Settings2 size={13} />
          Customize
        </button>
        <button
          type="button"
          onClick={toggleStreams}
          aria-pressed={streamsVisible}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-all hover:-translate-y-px cursor-pointer ${
            streamsVisible
              ? "border-[color:var(--core)] bg-[color:var(--core)]/12 text-[color:var(--core)]"
              : "border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] hover:border-[color:var(--core)] hover:text-[color:var(--ink)]"
          }`}
        >
          {streamsVisible ? <TvMinimal size={13} /> : <Tv size={13} />}
          {streamsVisible ? "Hide streams" : "Show streams"}
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-pressed={fullscreen}
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--ink-dim)] transition-all hover:-translate-y-px hover:border-[color:var(--core)] hover:text-[color:var(--ink)] cursor-pointer"
        >
          {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>

      {/* Settings panel */}
      {settingsOpen ? (
        <div className="mb-6 rounded-lg border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-4 md:p-5">
          <p className="text-[12px] font-semibold tracking-tight text-[color:var(--ink)]">
            Customize
          </p>
          <p className="mt-1 text-[13px] text-[color:var(--ink-dim)]">
            Toggle members on or off, or add another Twitch channel.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {coreChannels.map((c) => {
              const visible = isCoreVisible(c.login);
              const isLive = liveByLogin.has(c.login.toLowerCase());
              return (
                <button
                  key={c.login}
                  type="button"
                  onClick={() => toggleChannelVisibility(c.login, visible)}
                  aria-pressed={visible}
                  title={
                    isLive
                      ? `${c.displayName} is live`
                      : `${c.displayName} is offline — toggle on to pin visible`
                  }
                  className={`group flex items-center gap-2.5 rounded-md border px-2 py-2 text-left transition-colors cursor-pointer ${
                    visible
                      ? "border-[color:var(--rule-strong)] bg-[color:var(--surface)]"
                      : "border-[color:var(--rule)] bg-[color:var(--bg)] opacity-60 hover:opacity-100"
                  }`}
                  style={visible ? { boxShadow: `inset 0 0 0 1px ${c.accent}55` } : undefined}
                >
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                    {c.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-[color:var(--bg)] text-[10px] font-bold uppercase">
                        {c.displayName[0]}
                      </span>
                    )}
                    {/* Tiny live dot in the corner of the avatar so the
                        viewer can tell who's actually streaming right
                        now without reading the toggle state. */}
                    {isLive ? (
                      <span
                        aria-hidden
                        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-[color:var(--bg-elev)] bg-[color:var(--core)] shadow-[0_0_6px_rgba(239,68,68,0.7)]"
                        style={{ animation: "live-blink 1s ease-in-out infinite" }}
                      />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-[13px] font-semibold text-[color:var(--ink)]">
                      {c.displayName}
                    </span>
                    <span className="mt-0.5 truncate text-[11px] text-[color:var(--ink-dim)]">
                      {isLive ? "Live now" : "Offline"}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                      visible ? "bg-[color:var(--core)]" : "bg-[color:var(--ink-faint)]/40"
                    }`}
                  >
                    <span
                      className={`mx-0.5 inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                        visible ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Text size control — applies to every chat tile. */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-semibold tracking-tight text-[color:var(--ink-dim)]">
              Text size
            </p>
            <div className="inline-flex items-center gap-1 rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--surface)] p-0.5">
              <button
                type="button"
                onClick={() => adjustTextScale(-TEXT_SCALE_STEP)}
                disabled={textScale <= TEXT_SCALE_MIN + 1e-6}
                aria-label="Decrease chat text size"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus size={13} />
              </button>
              <span
                className="min-w-[44px] text-center font-mono text-[12px] tabular-nums text-[color:var(--ink)]"
                aria-live="polite"
              >
                {Math.round(textScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => adjustTextScale(TEXT_SCALE_STEP)}
                disabled={textScale >= TEXT_SCALE_MAX - 1e-6}
                aria-label="Increase chat text size"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={13} />
              </button>
            </div>
            <button
              type="button"
              onClick={resetTextScale}
              disabled={Math.abs(textScale - 1) < 1e-6}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[color:var(--ink-dim)]"
            >
              <RotateCcw size={11} /> Reset
            </button>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
              Applies to every chat
            </span>
          </div>

          {guests.length > 0 ? (
            <div className="mt-5">
              <p className="text-[11px] font-semibold tracking-tight text-[color:var(--ink-dim)]">
                Guests · {guests.length}
              </p>
              <ul className="mt-3 flex flex-wrap items-center gap-2">
                {guests.map((g) => (
                  <li
                    key={g.login}
                    className="inline-flex items-center gap-2 rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--surface)] px-2.5 py-1.5"
                  >
                    {g.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.avatarUrl}
                        alt=""
                        className="h-5 w-5 rounded-full"
                      />
                    ) : null}
                    <span className="text-[12px] font-medium text-[color:var(--ink)]">
                      {g.displayName}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeGuest(g.login)}
                      aria-label={`Remove ${g.displayName}`}
                      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-transparent text-[color:var(--ink-dim)] transition-all hover:-translate-y-px hover:border-[color:var(--core)] hover:bg-[color:var(--core)]/10 hover:text-[color:var(--core)] hover:shadow-[0_4px_10px_-4px_rgba(255,106,0,0.4)] active:translate-y-0"
                    >
                      <X size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!adding) addGuest();
            }}
            className="mt-5 flex flex-wrap items-center gap-2"
          >
            <label
              htmlFor="add-guest"
              className="text-[12px] font-medium tracking-tight text-[color:var(--ink-dim)]"
            >
              Add guest
            </label>
            <div className="relative flex-1 min-w-[220px]">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-[12px] text-[color:var(--ink-faint)]">
                twitch.tv/
              </span>
              <input
                id="add-guest"
                type="text"
                value={draftLogin}
                onChange={(e) => {
                  setDraftLogin(e.target.value);
                  setAddError(null);
                }}
                placeholder="username"
                className="w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] py-2 pl-[88px] pr-3 font-mono text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] focus:border-[color:var(--core)] focus:outline-none"
                disabled={adding}
              />
            </div>
            <button type="submit" disabled={adding} className="btn btn-primary disabled:opacity-50">
              {adding ? "Adding…" : (
                <>
                  <Plus size={13} />
                  Add channel
                </>
              )}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)] cursor-pointer"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </form>
          {addError ? (
            <p className="mt-2 font-mono text-[11px] text-[color:var(--core)]">{addError}</p>
          ) : null}
        </div>
      ) : null}

      {/* Multistream player grid — toggled via "Show streams". Mounted
          above the chat grid so the chats stay where they are; default
          off so the page is light by default. */}
      {streamsVisible && playerParent && visible.length > 0 ? (
        <StreamGrid channels={visible} parent={playerParent} />
      ) : null}

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
          <div>
            <p className="eyebrow">No channels visible</p>
            <p className="mt-3 text-[14px] text-[color:var(--ink-dim)]">
              Open <span className="font-semibold text-[color:var(--ink)]">Customize</span> and turn
              channels back on, or add a guest channel.
            </p>
          </div>
        </div>
      ) : (
        <div className={fullscreen ? "flex min-h-0 flex-1 flex-col px-4 pb-4" : ""}>
          {/* Mobile chat picker — desktop hides since all tiles fit on screen. */}
          {visible.length > 1 ? (
            <div className="mb-3 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 md:hidden">
              {visible.map((c) => {
                const isActive = c.login.toLowerCase() === activeMobileLogin;
                return (
                  <button
                    key={c.login}
                    type="button"
                    onClick={() => setMobileActive(c.login.toLowerCase())}
                    aria-pressed={isActive}
                    className={`group inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 transition-all cursor-pointer ${
                      isActive
                        ? "border-[color:var(--core)] bg-[color:var(--surface)] text-[color:var(--ink)]"
                        : "border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
                    }`}
                    style={isActive ? { boxShadow: `inset 0 0 0 1px ${c.accent}55` } : undefined}
                  >
                    {c.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.avatarUrl}
                        alt=""
                        className="h-5 w-5 rounded-full ring-1 ring-inset"
                        style={{ ["--tw-ring-color" as string]: c.accent }}
                      />
                    ) : (
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--bg)] text-[9px] font-bold uppercase"
                        style={{ color: c.accent }}
                      >
                        {c.displayName[0]}
                      </span>
                    )}
                    <span className="text-[12px] font-semibold leading-none">{c.displayName}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div
            className={`grid gap-3 ${gridCols} ${fullscreen ? "min-h-0 flex-1" : ""}`}
          >
            {visible.map((c) => {
              const isDragOver = dragOverLogin === c.login.toLowerCase();
              const isDragging = dragLogin === c.login.toLowerCase();
              const isHiddenOnMobile = c.login.toLowerCase() !== activeMobileLogin;
              return (
                <div
                  key={c.login}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    if (dragLogin && dragLogin !== c.login.toLowerCase()) {
                      setDragOverLogin(c.login.toLowerCase());
                    }
                  }}
                  onDragOver={(e) => {
                    if (!dragLogin || dragLogin === c.login.toLowerCase()) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const rect = e.currentTarget.getBoundingClientRect();
                    // Use the longer axis as the drop axis: on a row of tiles
                    // (wider than tall) split horizontally, otherwise vertically.
                    const horizontal = rect.width >= rect.height;
                    const before = horizontal
                      ? e.clientX < rect.left + rect.width / 2
                      : e.clientY < rect.top + rect.height / 2;
                    setDragOverSide(before ? "before" : "after");
                    if (dragOverLogin !== c.login.toLowerCase()) {
                      setDragOverLogin(c.login.toLowerCase());
                    }
                  }}
                  onDragLeave={(e) => {
                    // Only clear when leaving the tile itself, not when crossing
                    // into a child (which fires dragLeave on this element too).
                    const related = e.relatedTarget as Node | null;
                    if (related && e.currentTarget.contains(related)) return;
                    if (dragOverLogin === c.login.toLowerCase()) setDragOverLogin(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = e.dataTransfer.getData("text/plain") || dragLogin;
                    if (from && from !== c.login.toLowerCase()) {
                      reorder(from, c.login.toLowerCase(), dragOverSide);
                    }
                    setDragLogin(null);
                    setDragOverLogin(null);
                  }}
                  className={`group/tile relative flex min-w-0 flex-col overflow-hidden pt-7 transition-all ${
                    fullscreen ? "h-full min-h-0" : "h-[calc(100vh-260px)] min-h-[480px]"
                  } ${isDragging ? "opacity-40 scale-[0.98]" : ""} ${
                    isHiddenOnMobile ? "hidden md:flex" : ""
                  }`}
                >
                  {isDragOver ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute z-20 rounded-full bg-[color:var(--core)] shadow-[0_0_12px_rgba(255,106,0,0.7)]"
                      style={(() => {
                        // Match the indicator orientation to the drop axis we
                        // computed in onDragOver. Lines sit just outside the
                        // tile so the gap between cells lights up.
                        const horizontal = (() => {
                          // Heuristic: if there are >= 2 columns active in the
                          // grid we treat indicator as a vertical line on
                          // before/after edge; on single-col mobile use a
                          // horizontal line on top/bottom.
                          if (typeof window === "undefined") return true;
                          return window.innerWidth >= 768 && visible.length > 1;
                        })();
                        if (horizontal) {
                          return {
                            top: 0,
                            bottom: 0,
                            width: "3px",
                            [dragOverSide === "before" ? "left" : "right"]: "-7px",
                          } as React.CSSProperties;
                        }
                        return {
                          left: 0,
                          right: 0,
                          height: "3px",
                          [dragOverSide === "before" ? "top" : "bottom"]: "-7px",
                        } as React.CSSProperties;
                      })()}
                    />
                  ) : null}
                  {/* Drag handle — sits in the 28px gap ABOVE the chat
                      tile so it never overlaps the username. Hover-revealed
                      via the parent `group/tile`. */}
                  <span
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => {
                      setDragLogin(c.login.toLowerCase());
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.login.toLowerCase());
                    }}
                    onDragEnd={() => {
                      setDragLogin(null);
                      setDragOverLogin(null);
                    }}
                    aria-label={`Drag ${c.displayName} to reorder`}
                    title="Drag to reorder"
                    className="absolute left-1/2 top-0.5 z-20 inline-flex h-5 w-12 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-[color:var(--rule)] bg-[color:var(--bg-elev)]/95 text-[color:var(--ink-dim)] opacity-0 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5)] transition-all hover:border-[color:var(--core)] hover:text-[color:var(--core)] active:cursor-grabbing group-hover/tile:opacity-100"
                  >
                    <GripVertical size={11} />
                  </span>
                  <TwitchChat
                    login={c.login}
                    userId={c.userId}
                    displayName={c.displayName}
                    accent={c.accent}
                    avatarUrl={c.avatarUrl}
                    isCore={c.isCore}
                    onClose={c.isCore ? () => toggleChannelVisibility(c.login, true) : () => removeGuest(c.login)}
                    compact
                    textScale={textScale}
                    monitorSlug={c.isCore ? c.slug : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Multistream player grid — drops one Twitch player per visible channel
 * into a responsive grid above the chats. Each iframe autoplays muted
 * (browser autoplay policy: muted autoplay is allowed everywhere); the
 * viewer can unmute individually via the player's own UI.
 *
 * Tiles keep a 16:9 aspect ratio so the row heights stay even regardless
 * of how many streams are visible, and the column count scales with the
 * total — same step pattern as the chat grid below.
 */
function StreamGrid({
  channels,
  parent,
}: {
  channels: ChatChannel[];
  parent: string;
}) {
  const cols = (() => {
    const n = channels.length;
    if (n <= 1) return "grid-cols-1";
    if (n === 2) return "grid-cols-1 md:grid-cols-2";
    if (n === 3) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    if (n === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4";
    if (n === 5) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
    if (n === 6) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3";
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  })();

  return (
    <section
      aria-label="Live multistream"
      className={`mb-5 grid gap-3 ${cols}`}
    >
      {channels.map((c) => (
        <div
          key={c.login}
          className="relative overflow-hidden rounded-lg border border-[color:var(--rule)] bg-black ring-1 ring-inset"
          style={{ ["--tw-ring-color" as string]: `${c.accent}55`, aspectRatio: "16 / 9" }}
        >
          <iframe
            key={`${c.login}-${parent}`}
            src={`https://player.twitch.tv/?channel=${encodeURIComponent(c.login)}&parent=${encodeURIComponent(parent)}&muted=true&autoplay=true`}
            title={`${c.displayName} live stream`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
          {/* Channel pill in the corner so the user can tell tiles apart
              while every player loads in parallel. */}
          <span
            className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2 py-1 text-[11px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-sm"
            style={{ borderLeft: `2px solid ${c.accent}` }}
          >
            {c.displayName}
          </span>
        </div>
      ))}
    </section>
  );
}
