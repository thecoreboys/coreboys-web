"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import { Toggle } from "@/components/base/toggle/toggle";
import { Input } from "@/components/base/input/input";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { LinkExternal01, RefreshCcw01, Trophy01 } from "@untitledui/icons";

type CatalogItem = {
  key: string;
  label: string;
  color: string;
  connectable: boolean;
  configured: boolean;
  why: string;
  scopes: string[];
  interaction: "twitch-chat" | "youtube-write" | "read-only";
  interactionLabel: string;
  interactionNote?: string;
  watchHistorySync: { supported: boolean; label: string; detail: string };
};

type Connection = {
  provider: string;
  username: string | null;
  avatarUrl: string | null;
  connectedAt: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  status: "active" | "expired" | "revoked";
  scopes: string[];
};

type MemberRow = {
  slug: string;
  label: string;
  twitchFollow: boolean;
  twitchSub: boolean;
  twitchSubMeta: { tier?: string | null; gift?: boolean } | null;
  youtubeSub: boolean;
  xFollow: boolean;
  siteChat: boolean;
  siteWatch: boolean;
};

type Card = {
  rows: MemberRow[];
  house: { youtubeSub: boolean; xFollow: boolean; communityAttested: boolean };
  completion: { done: number; total: number };
  radar: { twitch: number; youtube: number; x: number; site: number };
  houseStatus: "none" | "og-path" | "super";
  favoriteSlug: string | null;
  xProfiles: Array<{ id: string; name: string; profileUrl: string }>;
  honestGaps: string[];
  siteWatch: {
    minutes7d: number; watchMinutes7d: number; watchMinutesTotal: number;
    playbackCompleted: number; manuallyCompleted: number;
    ytPlays7d: number; vodPlays7d: number; chatMinutes7d: number;
  };
};

export function ConnectedAccounts({
  members,
}: {
  members: Array<{ slug: string; stageName: string }>;
}) {
  const search = useSearchParams();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [card, setCard] = useState<Card | null>(null);
  const [publicCard, setPublicCard] = useState(false);
  const [publicSlug, setPublicSlug] = useState("");
  const [favorite, setFavorite] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const oauthFlash = useMemo(() => {
    const oauth = search.get("oauth");
    const provider = search.get("provider") ?? "account";
    if (oauth === "ok") return `Connected ${provider}. Pulling your CORE loyalty now.`;
    if (oauth === "denied") return `You cancelled the ${provider} connect.`;
    if (oauth === "linked")
      return `That ${provider} account is already linked to another CORE profile. Sign in there, or disconnect it first.`;
    if (oauth === "unconfigured")
      return `${provider} isn’t set up on this environment yet (missing app credentials).`;
    if (oauth === "error") return `Couldn’t finish the ${provider} connect. Try again.`;
    return null;
  }, [search]);

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([
      fetch("/api/account/connections", { credentials: "same-origin" }).then((r) => r.json()),
      fetch("/api/account/loyalty", { credentials: "same-origin" }).then((r) => r.json()),
    ]);
    setCatalog(c.catalog ?? []);
    setConnections(c.connections ?? []);
    setCard(l.card ?? null);
    setPublicCard(Boolean(l.publicCard));
    setPublicSlug(l.publicSlug ?? "");
    setFavorite(l.favoriteMember ?? "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function disconnect(provider: string) {
    if (!confirm(`Disconnect ${provider}? We’ll wipe tokens and inferred stats. Your CORE account stays.`)) {
      return;
    }
    setBusy(`off-${provider}`);
    try {
      await fetch(`/api/oauth/${provider}`, { method: "DELETE", credentials: "same-origin" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("sync");
    try {
      const response = await fetch("/api/account/sync", { method: "POST", credentials: "same-origin" });
      const result = (await response.json().catch(() => null)) as {
        results?: Array<{ provider: string; ok: boolean; error?: string }>;
      } | null;
      await load();
      const failures = result?.results?.filter((entry) => !entry.ok) ?? [];
      setFlash(
        failures.length
          ? `${failures.map((entry) => entry.provider).join(", ")} need attention. Reconnect or try again.`
          : "Synced.",
      );
      window.setTimeout(() => setFlash(null), failures.length ? 6000 : 2000);
    } finally {
      setBusy(null);
    }
  }

  async function savePrefs() {
    setBusy("prefs");
    try {
      await fetch("/api/account/loyalty", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          favoriteMember: favorite || null,
          publicCard,
          publicSlug: publicSlug || null,
        }),
      });
      setFlash("Saved.");
      window.setTimeout(() => setFlash(null), 2000);
    } finally {
      setBusy(null);
    }
  }

  const byProvider = new Map(connections.map((c) => [c.provider, c]));

  return (
    <div className="mt-6 space-y-6">
      {oauthFlash ? (
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary ring-1 ring-inset ring-secondary">
          {oauthFlash}
        </p>
      ) : null}

      <section id="connected-accounts" className="scroll-mt-24 rounded-2xl bg-secondary p-6 shadow-xl ring-1 ring-inset ring-secondary">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-primary">Connected accounts</h2>
          <div className="flex items-center gap-2">
            {flash ? <span className="text-xs font-medium text-brand-secondary">{flash}</span> : null}
            <Button
              color="secondary"
              size="sm"
              iconLeading={RefreshCcw01}
              onClick={() => void syncNow()}
              isDisabled={busy === "sync" || connections.length === 0}
            >
              Sync now
            </Button>
          </div>
        </div>
        <p className="mb-5 text-sm text-tertiary">
          Link your platforms to personalize CORE TV, your loyalty card, and live notifications.
          CORE only acts as you when you deliberately submit a Twitch chat or YouTube
          comment/live-chat message. Every other connection is read-only. Disconnect wipes that
          provider’s tokens and inferred stats.
        </p>
        <p className="mb-4 text-xs text-quaternary">
          You must be 13+ to connect a platform account. We ask only the scopes listed on each
          row — no tweet-as-you, no YouTube upload.
        </p>
        <ul className="flex flex-col divide-y divide-[color:var(--color-border-secondary)]">
          {catalog.map((p) => {
            const conn = byProvider.get(p.key);
            return (
              <li key={p.key} className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                    <span className="text-sm font-medium text-secondary">{p.label}</span>
                    {conn ? (
                      <Badge color={conn.status === "active" ? "success" : "warning"} size="sm">
                        {conn.status === "active" ? `@${conn.username ?? "connected"}` : conn.status}
                      </Badge>
                    ) : p.connectable ? (
                      p.configured ? null : (
                        <Badge color="gray" size="sm">Needs app keys</Badge>
                      )
                    ) : (
                      <Badge color="gray" size="sm">Coming soon</Badge>
                    )}
                  </div>
                  <p className="mt-1 max-w-xl text-xs text-quaternary">{p.why}</p>
                  <p className="mt-0.5 text-xs font-medium text-tertiary">
                    {p.interactionLabel}
                    {conn && p.scopes.some((scope) => !conn.scopes.includes(scope))
                      ? " · reconnect to approve updated permissions"
                      : ""}
                  </p>
                  {p.interactionNote ? (
                    <p className="mt-0.5 max-w-xl text-xs text-quaternary">{p.interactionNote}</p>
                  ) : null}
                  <p className="mt-1 max-w-xl text-xs text-quaternary">
                    <span className="font-semibold text-tertiary">{p.watchHistorySync.label}.</span>{" "}
                    {p.watchHistorySync.detail}
                  </p>
                  {conn?.lastSyncAt ? (
                    <p className="mt-0.5 text-xs text-quaternary">
                      Last sync {new Date(conn.lastSyncAt).toLocaleString()}
                      {conn.lastSyncError ? ` · ${conn.lastSyncError}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {conn ? (
                    <>
                      <Button
                        color="secondary"
                        size="sm"
                        href={`/api/oauth/${p.key}/start` as never}
                        isDisabled={busy === `off-${p.key}`}
                      >
                        Reconnect
                      </Button>
                      <Button
                        color="secondary"
                        size="sm"
                        onClick={() => void disconnect(p.key)}
                        isDisabled={busy === `off-${p.key}`}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    p.connectable && p.configured ? (
                      <Button
                        color="primary"
                        size="sm"
                        href={`/api/oauth/${p.key}/start` as never}
                      >
                        Connect
                      </Button>
                    ) : (
                      <Button color="secondary" size="sm" isDisabled>
                        Connect
                      </Button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {card ? <LoyaltyPanel card={card} members={members} /> : null}

      <section className="rounded-2xl bg-secondary p-6 shadow-xl ring-1 ring-inset ring-secondary">
        <h2 className="text-lg font-semibold text-primary">Your card</h2>
        <p className="mt-1 text-sm text-tertiary">
          Private by default. Turn this on to publish a badge-only profile at{" "}
          <code className="text-xs">/u/your-handle</code> — never your email.
        </p>
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-secondary bg-primary p-4">
          <div>
            <p className="text-sm font-semibold text-primary">Public fan card</p>
            <p className="text-xs text-tertiary">Shows platform badges and house loyalty, not identity.</p>
          </div>
          <Toggle size="md" isSelected={publicCard} onChange={setPublicCard} aria-label="Make fan card public" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            size="md"
            label="Public handle"
            value={publicSlug}
            onChange={setPublicSlug}
            placeholder="your-name"
            hint="Letters, numbers, dashes."
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-secondary">Favorite member</span>
            <select
              value={favorite}
              onChange={(e) => setFavorite(e.target.value)}
              className="rounded-lg bg-primary px-3 py-2 text-sm text-primary ring-1 ring-inset ring-secondary"
            >
              <option value="">Auto from your activity</option>
              {members.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.stageName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button color="primary" size="sm" onClick={() => void savePrefs()} isDisabled={busy === "prefs"}>
            Save
          </Button>
          <Button color="secondary" size="sm" href={"/api/account/export" as never} iconLeading={LinkExternal01}>
            Export my data
          </Button>
        </div>
      </section>
    </div>
  );
}

function LoyaltyPanel({
  card,
  members,
}: {
  card: Card;
  members: Array<{ slug: string; stageName: string }>;
}) {
  const fav = members.find((m) => m.slug === card.favoriteSlug);
  const [perk, setPerk] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/perk", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { code?: string } | null) => setPerk(d?.code ?? null))
      .catch(() => {});
  }, [card.houseStatus]);
  return (
    <section className="rounded-2xl bg-secondary p-6 shadow-xl ring-1 ring-inset ring-secondary">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <FeaturedIcon icon={Trophy01} size="lg" color="brand" theme="modern" />
          <div>
            <h2 className="text-lg font-semibold text-primary">House loyalty</h2>
            <p className="mt-1 text-sm text-tertiary">
              {card.completion.done} of {card.completion.total} connections across the six + the house.
              {fav ? ` Closest to ${fav.stageName}.` : ""}
            </p>
          </div>
        </div>
        <Badge color={card.houseStatus === "super" ? "brand" : "gray"} size="lg">
          {card.houseStatus === "super"
            ? "House Super"
            : card.houseStatus === "og-path"
              ? "On the Super path"
              : "Just getting started"}
        </Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["Measured watch (7d)", card.siteWatch.watchMinutes7d],
            ["Saved watch time", card.siteWatch.watchMinutesTotal],
            ["Finished by playback", card.siteWatch.playbackCompleted],
            ["Marked watched", card.siteWatch.manuallyCompleted],
            ["/videos plays", card.siteWatch.ytPlays7d],
            ["VOD plays on-site", card.siteWatch.vodPlays7d],
            ["Chat minutes (7d)", card.siteWatch.chatMinutes7d],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-xl bg-primary px-3 py-2 ring-1 ring-inset ring-secondary">
            <p className="text-xs text-quaternary">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-primary">{n}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-quaternary">
              <th className="pb-2 font-medium">Member</th>
              <th className="pb-2 font-medium">Twitch follow</th>
              <th className="pb-2 font-medium">Twitch sub</th>
              <th className="pb-2 font-medium">YouTube</th>
              <th className="pb-2 font-medium">X</th>
              <th className="pb-2 font-medium">On-site</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border-secondary)]">
            <tr>
              <td className="py-2 font-medium text-primary">CORE house</td>
              <td className="py-2 text-quaternary">—</td>
              <td className="py-2 text-quaternary">—</td>
              <td className="py-2">{mark(card.house.youtubeSub)}</td>
              <td className="py-2">{mark(card.house.xFollow)}</td>
              <td className="py-2 text-quaternary">—</td>
            </tr>
            {card.rows.map((r) => (
              <tr key={r.slug}>
                <td className="py-2 font-medium text-primary">{r.label}</td>
                <td className="py-2">{mark(r.twitchFollow)}</td>
                <td className="py-2">
                  {mark(r.twitchSub)}
                  {r.twitchSub && r.twitchSubMeta?.tier ? (
                    <span className="ml-1 text-xs text-quaternary">T{String(r.twitchSubMeta.tier).slice(0, 1)}</span>
                  ) : null}
                </td>
                <td className="py-2">{mark(r.youtubeSub)}</td>
                <td className="py-2">{mark(r.xFollow)}</td>
                <td className="py-2 text-xs text-tertiary">
                  {[r.siteChat ? "chat" : null, r.siteWatch ? "watch" : null].filter(Boolean).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold text-primary">Official X profiles</p>
        <ul className="mt-2 space-y-2">
          {card.xProfiles.map((profile) => (
            <li key={profile.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-secondary">
                {profile.name} <span className="text-xs text-quaternary">Profile link</span>
              </span>
              <div className="flex gap-2">
                <Button href={profile.profileUrl as never} size="sm" color="secondary" iconTrailing={LinkExternal01} target="_blank">
                  Open
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 rounded-xl border border-secondary bg-primary p-4">
        <p className="text-sm font-semibold text-primary">House merch perk</p>
        <p className="mt-1 text-xs text-tertiary">
          Super Fans get a checkout code. This is a CORE code — not Twitch watch time.
        </p>
        {perk ? (
          <p
            className="mt-3 inline-block rounded-xl px-4 py-2 font-mono text-md font-semibold tracking-[0.18em] text-white"
            style={{
              background: "var(--core-glow)",
            }}
          >
            {perk}
          </p>
        ) : (
          <p className="mt-2 text-sm text-quaternary">Hit House Super (3 Twitch subs or house YT + 2 member YTs) to unlock.</p>
        )}
        <Button href={"/account/digest" as never} size="sm" color="secondary" className="mt-3">
          This week’s recap
        </Button>
        <PresenceReceipt />
      </div>

      <ul className="mt-5 space-y-1.5 text-xs text-quaternary">
        {card.honestGaps.map((g) => (
          <li key={g}>· {g}</li>
        ))}
      </ul>
    </section>
  );
}

function PresenceReceipt() {
  const [fp, setFp] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/account/receipt", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { stamped?: boolean; fingerprint?: string; minutes?: number }) => {
        if (d.stamped) {
          setFp(d.fingerprint ?? null);
          setMinutes(d.minutes ?? 0);
        }
      })
      .catch(() => {});
  }, []);
  if (!fp) return null;
  return (
    <p className="mt-3 font-mono text-[11px] text-quaternary">
      Proof of presence · {minutes}m on-site this week · {fp}
    </p>
  );
}

function mark(on: boolean) {
  return on ? (
    <span className="font-semibold text-brand-secondary">Yes</span>
  ) : (
    <span className="text-quaternary">No</span>
  );
}
