"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { ACCOUNT_CHANGED_MESSAGE } from "@/lib/account-request";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import { Toggle } from "@/components/base/toggle/toggle";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { PlatformLogo, PLATFORM_BRAND } from "@/components/clips/PlatformLogo";
import { LinkExternal01, RefreshCcw01 } from "@untitledui/icons";
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

type PlatformFollowing = {
  provider: string;
  checkedAt: string | null;
  detail: string;
  members: Array<{ slug: string; label: string; status: "following" | "not_following" | "unknown" | "unsupported"; subscribed: boolean | null }>;
};

type ConnectionsPayload = {
  accountId: string;
  catalog?: CatalogItem[];
  connections?: Connection[];
  following?: PlatformFollowing[];
};

type LoyaltyPayload = {
  accountId: string;
  card?: Card | null;
  publicCard?: boolean;
  publicSlug?: string | null;
  favoriteMember?: string | null;
};

type SyncPayload = {
  accountId: string;
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

export function ConnectedAccounts({ members }: { members: Array<{ slug: string; stageName: string }> }) {
  const { user, loading } = useAuth();
  if (!user) return <p className="text-sm text-tertiary">{loading ? "Loading account…" : "Sign in to manage connected accounts."}</p>;
  return <ConnectedAccountsForUser key={user.id} accountId={user.id} members={members} />;
}

function ConnectedAccountsForUser({
  members,
  accountId,
}: {
  members: Array<{ slug: string; stageName: string }>;
  accountId: string;
}) {
  const search = useSearchParams();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [following, setFollowing] = useState<PlatformFollowing[]>([]);
  const [card, setCard] = useState<Card | null>(null);
  const [publicCard, setPublicCard] = useState(false);
  const [publicSlug, setPublicSlug] = useState("");
  const [favorite, setFavorite] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState<string | null>(null);
  const [notice, setNotice] = useState<AccountNotice | null>(null);
  const preferencesLoaded = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const oauthFlash = useMemo(() => {
    const oauth = search.get("oauth");
    const provider = search.get("provider") ?? "account";
    if (oauth === "ok") return `Connected ${provider} and completed the first sync.`;
    if (oauth === "account-changed") return ACCOUNT_CHANGED_MESSAGE;
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
      const results = await Promise.allSettled([
        (async () => {
          const response = await fetch("/api/account/connections", { credentials: "same-origin", cache: "no-store", headers: { "x-core-account-id": accountId } });
          const payload = await readConnectedAccountResponse<ConnectionsPayload>(response, "Connected accounts could not be loaded.");
          if (payload.accountId !== accountId) throw new Error(ACCOUNT_CHANGED_MESSAGE);
          if (!Array.isArray(payload.catalog) || !Array.isArray(payload.connections)) throw new Error("The connected-account response was incomplete. Try again.");
          setCatalog(payload.catalog);
          setConnections(payload.connections);
          setFollowing(payload.following ?? []);
        })(),
        (async () => {
          const response = await fetch("/api/account/loyalty", { credentials: "same-origin", cache: "no-store", headers: { "x-core-account-id": accountId } });
          const payload = await readConnectedAccountResponse<LoyaltyPayload>(response, "Activity details could not be loaded.");
          if (payload.accountId !== accountId) throw new Error(ACCOUNT_CHANGED_MESSAGE);
          if (!payload.card || typeof payload.card !== "object") throw new Error("Activity details are temporarily unavailable. Your connections are still available.");
          setCard(payload.card);
          if (!preferencesLoaded.current) {
            setPublicCard(Boolean(payload.publicCard));
            setPublicSlug(payload.publicSlug ?? "");
            setFavorite(payload.favoriteMember ?? "");
            preferencesLoaded.current = true;
          }
        })(),
      ]);
      const failed = results.find((result) => result.status === "rejected");
      setLoadError(failed?.status === "rejected" ? connectedAccountError(failed.reason, "Some account details could not be loaded.") : null);
      return !failed;
    } catch (error) {
      setLoadError(connectedAccountError(error, "Connected account details could not be loaded."));
      return false;
    } finally {
      setLoading(false);
    }
  }, [accountId]);

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
      const response = await fetch(`/api/oauth/${provider}`, { method: "DELETE", credentials: "same-origin", headers: { "x-core-account-id": accountId } });
      const result = await readConnectedAccountResponse<{ ok?: boolean; accountId: string }>(
        response,
        `Couldn’t disconnect ${provider}.`,
      );
      if (result.accountId !== accountId) throw new Error(ACCOUNT_CHANGED_MESSAGE);
      if (result.ok !== true) throw new Error(`Couldn’t confirm that ${provider} was disconnected.`);
      const refreshed = await load();
      window.dispatchEvent(new Event("core-account-sync"));
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
      const response = await fetch("/api/account/sync", { method: "POST", credentials: "same-origin", headers: { "x-core-account-id": accountId } });
      const result = await readConnectedAccountResponse<SyncPayload>(
        response,
        "Connected accounts could not be synced.",
      );
      if (result.accountId !== accountId) throw new Error(ACCOUNT_CHANGED_MESSAGE);
      if (!Array.isArray(result.results)) {
        throw new Error("The sync response was incomplete. No success was recorded.");
      }
      const refreshed = await load();
      window.dispatchEvent(new Event("core-account-sync"));
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
        headers: { "content-type": "application/json", "x-core-account-id": accountId },
        body: JSON.stringify({
          favoriteMember: favorite || null,
          publicCard,
          publicSlug: publicSlug || null,
        }),
      });
      const result = await readConnectedAccountResponse<{ ok?: boolean; accountId: string }>(
        response,
        "Your card settings could not be saved.",
      );
      if (result.accountId !== accountId) throw new Error(ACCOUNT_CHANGED_MESSAGE);
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
  const followingByProvider = new Map(following.map((item) => [item.provider, item]));
  const visibleCatalog = catalog.filter((provider) => provider.key !== "instagram" || byProvider.has(provider.key));

  return (
    <div className="space-y-6">
      {oauthFlash ? (
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary ring-1 ring-inset ring-secondary">
          {oauthFlash}
        </p>
      ) : null}

      <section id="connected-accounts" className="scroll-mt-24 rounded-xl border border-secondary bg-primary p-5 sm:p-6">
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
            const platformFollowing = followingByProvider.get(p.key);
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
                          {conn.status !== "active" ? "Reconnect needed" : syncNeedsAttention ? "Sync needs attention" : "Connected"}
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
                        href={`/api/oauth/${p.key}/start?accountId=${encodeURIComponent(accountId)}` as never}
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
                        href={`/api/oauth/${p.key}/start?accountId=${encodeURIComponent(accountId)}` as never}
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
                {conn ? <div className="w-full pl-0 sm:pl-10">
                  <p className="text-xs text-tertiary">{conn.lastSyncAt ? <>Last synced <time dateTime={conn.lastSyncAt}>{new Date(conn.lastSyncAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></> : "Waiting for the first successful sync"}</p>
                  {conn.lastSyncError ? <p className="mt-1 text-xs text-warning-primary">Sync needs attention. Try Sync now or reconnect this account.</p> : null}
                  <PlatformFollowingDetails following={platformFollowing} label={p.label} />
                  <p className="mt-2 text-xs leading-5 text-tertiary">{p.watchHistorySync.detail}</p>
                </div> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {card ? <LoyaltyPanel card={card} /> : null}

      {card ? <section className="rounded-xl border border-secondary bg-primary p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-primary">Public fan profile</h2>
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
          <Button color="secondary" size="sm" href={`/api/account/export?accountId=${encodeURIComponent(accountId)}` as never} iconLeading={LinkExternal01}>
            Export my data
          </Button>
        </div>
      </section> : null}
    </div>
  );
}

function PlatformFollowingDetails({ following, label }: { following?: PlatformFollowing; label: string }) {
  if (!following || !following.members.length) return <p className="mt-2 text-xs text-tertiary">Following status is not available yet.</p>;
  const supported = following.members.some((member) => member.status !== "unsupported");
  const verified = following.members.filter((member) => member.status === "following").length;
  const unknown = following.members.some((member) => member.status === "unknown");
  if (!supported) return <p className="mt-2 text-xs leading-5 text-tertiary">{following.detail || `${label} does not share follow status with CORE.`}</p>;
  return <details className="mt-3 rounded-lg border border-secondary">
    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-secondary">{unknown ? "Review creator following status" : `${label === "YouTube" ? "Subscribed to" : "Following"} ${verified} of ${following.members.length} creators`}</summary>
    <div className="border-t border-secondary px-3 py-2">
      <p className="mb-2 text-xs leading-5 text-tertiary">{following.detail}</p>
      <ul className="divide-y divide-[color:var(--rule)]">{following.members.map((member) => <li key={member.slug} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="font-medium text-primary">{member.label}</span><span className={member.status === "following" ? "text-success-primary" : "text-tertiary"}>{member.status === "following" ? label === "YouTube" ? "Subscribed" : "Following" : member.status === "not_following" ? label === "YouTube" ? "Not subscribed" : "Not following" : member.status === "unknown" ? "Not verified · sync needed" : "Not available"}{label === "Twitch" && member.subscribed !== null ? ` · ${member.subscribed ? "Subscribed" : "Not subscribed"}` : ""}</span></li>)}</ul>
    </div>
  </details>;
}

function LoyaltyPanel({ card }: { card: Card }) {
  return <section className="rounded-xl border border-secondary bg-primary p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-primary">Watching on CORE</h2><p className="mt-1 text-sm text-tertiary">Measured playback from your signed-in account.</p></div><Button href={"/passport" as never} size="sm" color="secondary">View Passport</Button></div>
    <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">{[
      ["Watched this week", `${card.siteWatch.watchMinutes7d.toLocaleString()} min`],
      ["Total watch time", `${card.siteWatch.watchMinutesTotal.toLocaleString()} min`],
      ["Finished by playback", card.siteWatch.playbackCompleted.toLocaleString()],
      ["Marked as watched", card.siteWatch.manuallyCompleted.toLocaleString()],
    ].map(([label, value]) => <div key={label}><dt className="text-xs text-tertiary">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-primary">{value}</dd></div>)}</dl>
    <p className="mt-4 border-t border-secondary pt-4 text-xs leading-5 text-tertiary">Watching Twitch or YouTube here counts as CORE activity. Connected platforms do not provide your viewing history from their own apps.</p>
  </section>;
}
