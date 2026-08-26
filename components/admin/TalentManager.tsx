"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Stars02, Trash01, X, Users01, LinkExternal01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Input } from "@/components/base/input/input";
import { Badge } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

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
  avatarUrl?: string;
  socials: SocialSuggestion[];
  createdAt: string;
};

type ApiTalent = {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  socials: Array<{ platform: SocialKey; url: string; handle?: string; label?: string }>;
  created_at: string;
};

type Mode = "twitch" | "manual";

/**
 * Talent admin — manages external_people via /api/admin/talents.
 * Add path 1: lookup a Twitch login to seed name + avatar + twitch
 * social. Path 2: enter a name manually + AI-suggest socials, admin
 * approves each, save.
 *
 * UUI controls: ButtonGroup mode picker, Input fields, Badge platform
 * pills, Button actions, FeaturedIcon empty state, card surfaces.
 */
export function TalentManager() {
  const [mode, setMode] = useState<Mode>("twitch");
  const [talents, setTalents] = useState<Talent[]>([]);
  const [, setLoading] = useState(true);
  const [, setLoadError] = useState<string | null>(null);

  const [login, setLogin] = useState("");
  const [tLooking, setTLooking] = useState(false);
  const [tError, setTError] = useState<string | null>(null);

  const [manualName, setManualName] = useState("");
  const [manualImage, setManualImage] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<SocialSuggestion[]>([]);
  const [savingManual, setSavingManual] = useState(false);

  function fromApi(t: ApiTalent): Talent {
    const twitch = t.socials.find((s) => s.platform === "twitch");
    return {
      id: t.id,
      name: t.name,
      twitchLogin: twitch?.handle ?? twitch?.url.split("/").pop(),
      avatarUrl: t.avatar_url ?? undefined,
      socials: t.socials.map((s) => ({
        platform: s.platform,
        handle: s.handle ?? s.url,
        url: s.url,
        approved: true,
      })),
      createdAt: t.created_at,
    };
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/talents", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { talents: ApiTalent[] };
      setTalents(json.talents.map(fromApi));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // load() is stable per-render and intentionally not memoised; the
    // mount-time call doesn't need to refire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistCreate(t: Talent): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/talents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          twitchLogin: t.twitchLogin,
          avatarUrl: t.avatarUrl,
          socials: t.socials
            .filter((s) => s.approved)
            .map((s) => ({ platform: s.platform, url: s.url, handle: s.handle })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      return true;
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

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
        id: "",
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
      const ok = await persistCreate(t);
      if (ok) setLogin("");
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
      { platform: "x", handle: `@${slug}`, url: `https://x.com/${slug}`, approved: false },
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

  const saveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    setSavingManual(true);
    const t: Talent = {
      id: "",
      name,
      avatarUrl: manualImage.trim() || undefined,
      socials: aiSuggestions.filter((s) => s.approved),
      createdAt: new Date().toISOString(),
    };
    const ok = await persistCreate(t);
    if (ok) {
      setManualName("");
      setManualImage("");
      setAiSuggestions([]);
    }
    setSavingManual(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this talent?")) return;
    try {
      const res = await fetch(`/api/admin/talents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTalents((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Mode picker */}
      <ButtonGroup
        size="md"
        selectedKeys={new Set([mode])}
        onSelectionChange={(keys) => {
          const next = Array.from(keys)[0] as Mode | undefined;
          if (next) setMode(next);
        }}
      >
        <ButtonGroupItem id="twitch">Add by Twitch handle</ButtonGroupItem>
        <ButtonGroupItem id="manual">Create manually</ButtonGroupItem>
      </ButtonGroup>

      {/* Twitch path */}
      {mode === "twitch" ? (
        <form
          onSubmit={addByTwitch}
          className="flex flex-wrap items-end gap-4 rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs md:p-6"
        >
          <div className="min-w-[260px] flex-1">
            <Input
              label="Twitch handle"
              hint="Seeds name, avatar, and the Twitch social automatically."
              size="md"
              value={login}
              onChange={(v) => {
                setLogin(v);
                setTError(null);
              }}
              placeholder="twitch.tv/username"
              isInvalid={!!tError}
            />
          </div>
          <Button
            type="submit"
            color="primary"
            size="md"
            isDisabled={tLooking || !login.trim()}
            isLoading={tLooking}
            iconLeading={Plus}
          >
            Add talent
          </Button>
          {tError ? (
            <p className="basis-full text-sm font-medium text-error-primary">{tError}</p>
          ) : null}
        </form>
      ) : (
        // Manual path
        <form
          onSubmit={saveManual}
          className="flex flex-col gap-5 rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs md:p-6"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              isRequired
              label="Name"
              size="md"
              value={manualName}
              onChange={(v) => setManualName(v)}
              placeholder="Some Streamer"
            />
            <Input
              label="Profile image URL"
              hint="Direct link to a hosted image. Phase 4: S3 upload."
              size="md"
              value={manualImage}
              onChange={(v) => setManualImage(v)}
              placeholder="https://..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-secondary pt-4">
            <Button
              type="button"
              color="secondary"
              size="md"
              onClick={runAiSearch}
              isDisabled={aiSearching || !manualName.trim()}
              isLoading={aiSearching}
              iconLeading={Stars02}
            >
              Find socials with AI
            </Button>
            <p className="text-xs text-tertiary">
              Phase 1 returns heuristic guesses; Phase 4 calls Claude with a grounded prompt.
            </p>
          </div>

          {aiSuggestions.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-secondary">Approve / deny per platform</p>
              <ul className="mt-3 flex flex-col gap-2">
                {aiSuggestions.map((s, i) => (
                  <li
                    key={`${s.platform}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3.5 py-2.5 ring-1 ring-inset ring-secondary"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Badge type="pill-color" size="sm" color="gray">
                        {s.platform}
                      </Badge>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm text-tertiary transition-colors hover:text-primary"
                      >
                        {s.url}
                      </a>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      color={s.approved ? "primary" : "secondary"}
                      iconLeading={s.approved ? Check : X}
                      onClick={() => toggleSuggestion(i)}
                    >
                      {s.approved ? "Approved" : "Pending"}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="border-t border-secondary pt-4">
            <Button
              type="submit"
              color="primary"
              size="md"
              isDisabled={savingManual || !manualName.trim()}
              isLoading={savingManual}
              iconLeading={Plus}
            >
              Save talent
            </Button>
          </div>
        </form>
      )}

      {/* Talent list */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-primary">
          Saved talents · {talents.length}
        </h2>
        {talents.length === 0 ? (
          <div className="mt-4 flex min-h-[200px] flex-col items-center justify-center rounded-xl bg-secondary p-10 text-center ring-1 ring-inset ring-secondary shadow-xs">
            <FeaturedIcon icon={Users01} size="xl" color="gray" theme="modern" />
            <p className="mt-4 text-md font-semibold text-primary">No talents yet</p>
            <p className="mt-1 max-w-[44ch] text-sm text-tertiary">
              Add via Twitch handle or create manually above — they&apos;ll be available for
              tagging in <code className="font-mono">/media</code> and{" "}
              <code className="font-mono">/clips</code>.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {talents.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3.5 rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-inset ring-secondary">
                  {t.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.avatarUrl} alt={t.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm font-bold text-quaternary">
                      {t.name[0]}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">{t.name}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 truncate text-xs text-tertiary">
                    {t.twitchLogin ? (
                      <>
                        <LinkExternal01 className="size-3" /> twitch.tv/{t.twitchLogin}
                      </>
                    ) : (
                      "Manual entry"
                    )}
                  </p>
                  {t.socials.filter((s) => s.approved).length > 0 ? (
                    <span className="mt-1.5 inline-block">
                      <Badge type="pill-color" size="sm" color="brand">
                        {t.socials.filter((s) => s.approved).length} socials
                      </Badge>
                    </span>
                  ) : null}
                </div>
                <ButtonUtility
                  size="sm"
                  color="tertiary"
                  tooltip="Remove"
                  icon={Trash01}
                  onClick={() => remove(t.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
