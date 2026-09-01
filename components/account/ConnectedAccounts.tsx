"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import { Toggle } from "@/components/base/toggle/toggle";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { PlatformLogo, PLATFORM_BRAND } from "@/components/clips/PlatformLogo";
import { LinkExternal01, RefreshCcw01, Trophy01 } from "@untitledui/icons";
import {
  connectedAccountError,
  readConnectedAccountResponse,
} from "./connected-account-request";

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

type AccountNotice = {
  message: string;
  tone: "success" | "error";
};

type ConnectionsPayload = {
  catalog?: CatalogItem[];
  connections?: Connection[];
};

type LoyaltyPayload = {
  card?: Card | null;
  publicCard?: boolean;
  publicSlug?: string | null;
  favoriteMember?: string | null;
};

type SyncPayload = {
  results?: Array<{ provider: string; ok: boolean; error?: string }>;
};

function ConnectedIdentity({ connection }: { connection: Connection }) {
  const [imageFailed, setImageFailed] = useState(false);
  const accountName = connection.username?.trim() || "Connected account";

  return (
    <span className="inline-flex max-w-[15rem] items-center gap-1.5 rounded-full bg-primary py-1 pl-1 pr-2 text-xs font-medium text-primary ring-1 ring-inset ring-secondary" title={accountName}>
      {connection.avatarUrl && !imageFailed ? (
        <img src={connection.avatarUrl} alt="" onError={() => setImageFailed(true)} className="size-5 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-tertiary" aria-hidden>@</span>
      )}
      <span className="truncate">{accountName}</span>
    </span>
  );
}

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
  const [confirmingDisconnect, setConfirmingDisconnect] = useState<string | null>(null);
  const [notice, setNotice] = useState<AccountNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const oauthFlash = useMemo(() => {
    const oauth = search.get("oauth");
    const provider = search.get("provider") ?? "account";
    if (oauth === "ok") return `Connected ${provider} and completed the first sync.`;
    if (oauth === "sync-error")
      return `Connected ${provider}, but its first sync failed. Use Sync now or reconnect if the error persists.`;
    if (oauth === "denied") return `You cancelled the ${provider} connect.`;
    if (oauth === "linked")
      return `That ${provider} account is already linked to another CORE profile. Sign in there, or disconnect it first.`;
    if (oauth === "unconfigured")
      return `${provider} isn’t set up on this environment yet (missing app credentials).`;
    if (oauth === "error") return `Couldn’t finish the ${provider} connect. Try again.`;
    return null;
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connectionsResponse, loyaltyResponse] = await Promise.all([
        fetch("/api/account/connections", { credentials: "same-origin" }),
        fetch("/api/account/loyalty", { credentials: "same-origin" }),
      ]);
      const [connectionsPayload, loyaltyPayload] = await Promise.all([
        readConnectedAccountResponse<ConnectionsPayload>(
          connectionsResponse,
          "Connected accounts could not be loaded.",
        ),
        readConnectedAccountResponse<LoyaltyPayload>(
          loyaltyResponse,
          "Loyalty details could not be loaded.",
        ),
      ]);
      if (!Array.isArray(connectionsPayload.catalog) || !Array.isArray(connectionsPayload.connections)) {
        throw new Error("The connected-account response was incomplete. Try again.");
      }
      if (!loyaltyPayload.card || typeof loyaltyPayload.card !== "object") {
        throw new Error("The loyalty response was incomplete. Try again.");
      }
      setCatalog(connectionsPayload.catalog ?? []);
      setConnections(connectionsPayload.connections ?? []);
      setCard(loyaltyPayload.card ?? null);
      setPublicCard(Boolean(loyaltyPayload.publicCard));
      setPublicSlug(loyaltyPayload.publicSlug ?? "");
      setFavorite(loyaltyPayload.favoriteMember ?? "");
      setLoadError(null);
      return true;
    } catch (error) {
      setLoadError(connectedAccountError(error, "Connected account details could not be loaded."));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Loyalty counters are backed by the account event tables, so keep this
  // panel fresh while it is open instead of making a reload the only way to
  // see watch/chat activity recorded in another tab.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function disconnect(provider: string) {
    setBusy(`off-${provider}`);
    setNotice(null);
    try {
      const response = await fetch(`/api/oauth/${provider}`, { method: "DELETE", credentials: "same-origin" });
      const result = await readConnectedAccountResponse<{ ok?: boolean }>(
        response,
        `Couldn’t disconnect ${provider}.`,
      );
      if (result.ok !== true) throw new Error(`Couldn’t confirm that ${provider} was disconnected.`);
      const refreshed = await load();
      setNotice(refreshed
        ? { message: `Disconnected ${provider}.`, tone: "success" }
        : { message: `Disconnected ${provider}, but the updated account list could not be loaded.`, tone: "error" });
    } catch (error) {
      setNotice({
        message: connectedAccountError(error, `Couldn’t disconnect ${provider}. Try again.`),
        tone: "error",
      });
    } finally {
      setBusy(null);
      setConfirmingDisconnect(null);
    }
  }

  async function syncNow() {
    setBusy("sync");
    setNotice(null);
    try {
      const response = await fetch("/api/account/sync", { method: "POST", credentials: "same-origin" });
      const result = await readConnectedAccountResponse<SyncPayload>(
        response,
        "Connected accounts could not be synced.",
      );
      if (!Array.isArray(result.results)) {
        throw new Error("The sync response was incomplete. No success was recorded.");
      }
      const refreshed = await load();
      const failures = result.results.filter((entry) => !entry.ok);
      if (failures.length) {
        setNotice({
          message: `${failures.map((entry) => entry.provider).join(", ")} need attention. Reconnect or try again.`,
          tone: "error",
        });
      } else if (!result.results.length) {
        setNotice({ message: "No active connected accounts were available to sync.", tone: "error" });
      } else if (!refreshed) {
        setNotice({ message: "Sync finished, but refreshed account details could not be loaded.", tone: "error" });
      } else {
        setNotice({ message: "Connected accounts synced.", tone: "success" });
        window.setTimeout(() => setNotice(null), 2000);
      }
    } catch (error) {
      setNotice({
        message: connectedAccountError(error, "Connected accounts could not be synced. Try again."),
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function savePrefs() {
    setBusy("prefs");
    setNotice(null);
    try {
      const response = await fetch("/api/account/loyalty", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          favoriteMember: favorite || null,
          publicCard,
          publicSlug: publicSlug || null,
        }),
      });
      const result = await readConnectedAccountResponse<{ ok?: boolean }>(
        response,
        "Your card settings could not be saved.",
      );
      if (result.ok !== true) throw new Error("The server did not confirm your saved card settings.");
      setNotice({ message: "Saved.", tone: "success" });
      window.setTimeout(() => setNotice(null), 2000);
    } catch (error) {
      setNotice({
        message: connectedAccountError(error, "Your card settings could not be saved. Try again."),
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  // Instagram posts are handled through public embeds. Do not offer a new
  // account connection here, but keep an existing grant visible so its owner
  // can remove it immediately.
  const visibleCatalog = catalog.filter((provider) => provider.key !== "instagram" || byProvider.has(provider.key));

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
            {loading && catalog.length ? <span className="text-xs text-quaternary" role="status">Refreshing…</span> : null}
            <Button
              color="secondary"
              size="sm"
              iconLeading={RefreshCcw01}
              onClick={() => void syncNow()}
              isDisabled={loading || busy === "sync" || connections.length === 0}
            >
              Sync now
            </Button>
          </div>
        </div>
        <p className="mb-4 text-sm text-tertiary">
          Connect an account when you need it. Disconnect any time.
        </p>
        {notice ? (
          <p
            className={`mb-4 rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset ${
              notice.tone === "error"
                ? "bg-error-primary text-error-primary ring-error_subtle"
                : "bg-success-primary text-success-primary ring-success_subtle"
            }`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.message}
          </p>
        ) : null}
        {loadError ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-error-primary px-3 py-2 ring-1 ring-inset ring-error_subtle" role="alert">
            <p className="text-sm font-medium text-error-primary">{loadError}</p>
            <Button color="secondary" size="sm" onClick={() => void load()} isDisabled={loading}>
              Try again
            </Button>
          </div>
        ) : null}
        <ul className="flex flex-col divide-y divide-[color:var(--color-border-secondary)]">
          {loading && !catalog.length ? (
            <li className="py-4 text-sm text-tertiary" role="status">Loading connected accounts…</li>
          ) : null}
          {visibleCatalog.map((p) => {
            const conn = byProvider.get(p.key);
            const syncNeedsAttention = Boolean(conn?.lastSyncError);
            const connectionNeedsReconnect = Boolean(conn && (conn.status !== "active" || syncNeedsAttention));
            return (
              <li key={p.key} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-primary ring-1 ring-inset ring-secondary" style={{ color: PLATFORM_BRAND[p.key as keyof typeof PLATFORM_BRAND] }} aria-hidden><PlatformLogo platform={p.key as keyof typeof PLATFORM_BRAND} size={16} /></span>
                    <span className="text-sm font-medium text-secondary">{p.label}</span>
                    {conn ? (
                      <>
                        <ConnectedIdentity connection={conn} />
                        <Badge color={conn.status === "active" && !syncNeedsAttention ? "success" : "warning"} size="sm">
                          {conn.status === "active" && !syncNeedsAttention ? "Connected" : "Reconnect needed"}
                        </Badge>
                      </>
                    ) : p.connectable ? (
                      p.configured ? null : (
                        <Badge color="gray" size="sm">Not configured</Badge>
                      )
                    ) : (
                      <Badge color="gray" size="sm">Coming soon</Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {conn ? (
                    confirmingDisconnect === p.key ? (
                      <>
                        <Button color="secondary" size="sm" onClick={() => setConfirmingDisconnect(null)} isDisabled={busy === `off-${p.key}`}>
                          Cancel
                        </Button>
                        <Button
                          color="secondary-destructive"
                          size="sm"
                          onClick={() => void disconnect(p.key)}
                          isLoading={busy === `off-${p.key}`}
                          showTextWhileLoading
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <>
                      {connectionNeedsReconnect && p.key !== "instagram" ? (
                      <Button
                        color="secondary"
                        size="sm"
                        href={`/api/oauth/${p.key}/start` as never}
                        isDisabled={busy === `off-${p.key}`}
                      >
                        Reconnect
                      </Button>
                      ) : null}
                      <Button
                        color="secondary"
                        size="sm"
                        onClick={() => setConfirmingDisconnect(p.key)}
                        isDisabled={busy === `off-${p.key}`}
                      >
                        Disconnect
                      </Button>
                      </>
                    )
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
          <NativeSelect
            label="Favorite member"
            value={favorite}
            onChange={(e) => setFavorite(e.target.value)}
            options={[
              { value: "", label: "Auto from your activity" },
              ...members.map((m) => ({ value: m.slug, label: m.stageName })),
            ]}
          />
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
        <p className="text-sm font-semibold text-primary">Weekly activity</p>
        <p className="mt-1 text-xs text-tertiary">
          Review your recent activity and keep your connected accounts in sync.
        </p>
        <Button href={"/account/digest" as never} size="sm" color="secondary" className="mt-3">
          This week’s recap
        </Button>
        <PresenceReceipt />
      </div>

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
