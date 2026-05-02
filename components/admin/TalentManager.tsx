"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Search, Sparkles, Trash2, X } from "lucide-react";

const TALENTS_KEY = "coreboys-talents:v1";

type SocialKey = "twitch" | "youtube" | "x" | "tiktok" | "instagram" | "snapchat";

type SocialSuggestion = {
  platform: SocialKey;
  handle: string;
  url: string;
  approved: boolean;
};

export type Talent = {
  id: string;
  name: string;
  twitchLogin?: string;
  /** Public URL for the avatar. Twitch profile pic when sourced from a
   * Twitch handle; admin-uploaded image URL when manual. */
  avatarUrl?: string;
  socials: SocialSuggestion[];
  createdAt: string;
};

type Mode = "twitch" | "manual";

/**
 * Talent admin: lookup-by-Twitch + manual-create with AI social
 * discovery. Phase 1 persists everything to localStorage; Phase 4
 * targets `collab_people` and a `POST /v1/talents` endpoint that
 * delegates to Anthropic for the social-discovery step.
 */
export function TalentManager() {
  const [mode, setMode] = useState<Mode>("twitch");
  const [talents, setTalents] = useState<Talent[]>([]);

  // Twitch-lookup state
  const [login, setLogin] = useState("");
  const [tLooking, setTLooking] = useState(false);
  const [tError, setTError] = useState<string | null>(null);

  // Manual state
  const [manualName, setManualName] = useState("");
  const [manualImage, setManualImage] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<SocialSuggestion[]>([]);
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TALENTS_KEY);
      if (raw) setTalents(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: Talent[]) => {
    setTalents(next);
    try {
      localStorage.setItem(TALENTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // --- Twitch lookup add path ---
  const addByTwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = login.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!cleaned) return;
    setTLooking(true);
    setTError(null);
    try {
      const res = await fetch(`/api/twitch/user/${encodeURIComponent(cleaned)}`);
      if (!res.ok) {
        setTError(res.status === 404 ? "Twitch user not found" : "Lookup failed");
        return;
      }
      const data: {
        id: string;
        login: string;
        displayName: string;
        profileImageUrl: string | null;
      } = await res.json();
      const t: Talent = {
        id: `talent:${data.login}`,
        name: data.displayName,
        twitchLogin: data.login,
        avatarUrl: data.profileImageUrl ?? undefined,
        socials: [
          {
            platform: "twitch",
            handle: data.login,
            url: `https://twitch.tv/${data.login}`,
            approved: true,
          },
        ],
        createdAt: new Date().toISOString(),
      };
      persist([t, ...talents.filter((x) => x.id !== t.id)]);
      setLogin("");
    } catch {
      setTError("Network error");
    } finally {
      setTLooking(false);
    }
  };

  // --- Manual + AI search ---
  const runAiSearch = () => {
    const name = manualName.trim();
    if (!name) return;
    setAiSearching(true);
    // Phase 1 stub: heuristic guesses. Phase 4 calls Anthropic with a
    // grounded "find this person's verified socials" prompt and feeds
    // the result here for admin approve/deny.
    const slug = name.toLowerCase().replace(/[^a-z0-9_]+/g, "");
    const guesses: SocialSuggestion[] = [
      {
        platform: "x",
        handle: `@${slug}`,
        url: `https://x.com/${slug}`,
        approved: false,
      },
      {
        platform: "youtube",
        handle: `@${slug}`,
        url: `https://www.youtube.com/@${slug}`,
        approved: false,
      },
      {
        platform: "tiktok",
        handle: `@${slug}`,
        url: `https://www.tiktok.com/@${slug}`,
        approved: false,
      },
      {
        platform: "instagram",
        handle: `@${slug}`,
        url: `https://www.instagram.com/${slug}`,
        approved: false,
      },
    ];
    window.setTimeout(() => {
      setAiSuggestions(guesses);
      setAiSearching(false);
    }, 700);
  };

  const toggleSuggestion = (i: number) => {
    setAiSuggestions((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, approved: !s.approved } : s)),
    );
  };

  const saveManual = (e: React.FormEvent) => {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    setSavingManual(true);
    const id = `talent:custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const t: Talent = {
      id,
      name,
      avatarUrl: manualImage.trim() || undefined,
      socials: aiSuggestions.filter((s) => s.approved),
      createdAt: new Date().toISOString(),
    };
    persist([t, ...talents.filter((x) => x.id !== t.id)]);
    setManualName("");
    setManualImage("");
    setAiSuggestions([]);
    setSavingManual(false);
  };

  const remove = (id: string) => {
    if (!confirm("Remove this talent?")) return;
    persist(talents.filter((t) => t.id !== id));
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Mode picker */}
      <div className="inline-flex w-fit rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-1">
        <button
          type="button"
          onClick={() => setMode("twitch")}
          aria-pressed={mode === "twitch"}
          className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
            mode === "twitch"
              ? "bg-[color:var(--surface)] text-[color:var(--ink)]"
              : "text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
          }`}
        >
          Add by Twitch handle
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          aria-pressed={mode === "manual"}
          className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
            mode === "manual"
              ? "bg-[color:var(--surface)] text-[color:var(--ink)]"
              : "text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
          }`}
        >
          Create manually
        </button>
      </div>

      {/* Twitch path */}
      {mode === "twitch" ? (
        <form onSubmit={addByTwitch} className="flex flex-wrap items-end gap-3 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4">
          <label className="flex flex-1 min-w-[260px] flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[color:var(--ink)]">
              Twitch handle
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[12px] text-[color:var(--ink-faint)]">
                twitch.tv/
              </span>
              <input
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setTError(null);
                }}
                placeholder="username"
                className="w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] py-2 pl-[88px] pr-3 text-[14px] text-[color:var(--ink)] focus:border-[color:var(--core)] focus:outline-none"
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={tLooking || !login.trim()}
            className="btn btn-primary disabled:opacity-50"
          >
            {tLooking ? (
              "Looking up…"
            ) : (
              <>
                <Plus size={14} /> Add talent
              </>
            )}
          </button>
          {tError ? (
            <p className="basis-full text-[11px] text-[color:var(--core)]">{tError}</p>
          ) : null}
        </form>
      ) : (
        // Manual path
        <form
          onSubmit={saveManual}
          className="flex flex-col gap-4 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Name" required>
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Some Streamer"
                className={inputClass}
              />
            </Field>
            <Field label="Profile image URL" hint="Direct link to a hosted image. Phase 4: S3 upload.">
              <input
                value={manualImage}
                onChange={(e) => setManualImage(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--rule)] pt-3">
            <button
              type="button"
              onClick={runAiSearch}
              disabled={aiSearching || !manualName.trim()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--core)]/40 bg-[color:var(--core)]/10 px-3 py-2 text-[12px] font-medium text-[color:var(--core)] transition-colors hover:bg-[color:var(--core)]/16 disabled:opacity-50 cursor-pointer"
            >
              {aiSearching ? (
                <>
                  <Sparkles size={13} className="animate-pulse" /> Searching…
                </>
              ) : (
                <>
                  <Sparkles size={13} /> Find socials with AI
                </>
              )}
            </button>
            <p className="text-[11px] text-[color:var(--ink-faint)]">
              <Search size={10} className="inline" /> Phase 1 returns heuristic guesses; Phase 4
              calls Claude with a grounded prompt.
            </p>
          </div>

          {aiSuggestions.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                Approve / deny per platform
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {aiSuggestions.map((s, i) => (
                  <li
                    key={`${s.platform}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="rounded border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight text-[color:var(--ink-dim)]">
                        {s.platform}
                      </span>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[12px] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
                      >
                        {s.url}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSuggestion(i)}
                      aria-pressed={s.approved}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                        s.approved
                          ? "border-[color:var(--success)]/50 bg-[color:var(--success)]/12 text-[color:var(--success)]"
                          : "border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
                      }`}
                    >
                      {s.approved ? (
                        <>
                          <Check size={12} /> Approved
                        </>
                      ) : (
                        <>
                          <X size={12} /> Pending
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={savingManual || !manualName.trim()}
              className="btn btn-primary disabled:opacity-50"
            >
              <Plus size={14} /> Save talent
            </button>
          </div>
        </form>
      )}

      {/* Talent list */}
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight text-[color:var(--ink)]">
          Saved talents · {talents.length}
        </h2>
        {talents.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-6 text-center text-[12px] text-[color:var(--ink-faint)]">
            No talents yet. Add via Twitch handle or create manually above — they&apos;ll be
            available for tagging in <code className="font-mono">/media</code> +{" "}
            <code className="font-mono">/clips</code>.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {talents.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3"
              >
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-1 ring-inset ring-[color:var(--rule-strong)]">
                  {t.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.avatarUrl} alt={t.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-[color:var(--bg)] text-[14px] font-bold text-[color:var(--ink-faint)]">
                      {t.name[0]}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[color:var(--ink)]">{t.name}</p>
                  <p className="truncate text-[11px] text-[color:var(--ink-dim)]">
                    {t.twitchLogin ? `twitch.tv/${t.twitchLogin}` : "Manual entry"}
                    {t.socials.filter((s) => s.approved).length > 0
                      ? ` · ${t.socials.filter((s) => s.approved).length} socials`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:border-[color:var(--core)] hover:text-[color:var(--core)]"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-2 text-[13px] text-[color:var(--ink)] focus:border-[color:var(--core)] focus:outline-none";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-tight text-[color:var(--ink)]">
        {label}
        {required ? <span className="ml-1 text-[color:var(--core)]">*</span> : null}
      </span>
      {hint ? <span className="-mt-0.5 text-[11px] text-[color:var(--ink-dim)]">{hint}</span> : null}
      {children}
    </label>
  );
}
