"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import { Avatar } from "@/components/base/avatar/avatar";
import { ChannelLogo } from "@/components/live/ChannelLogo";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { loadEmoteMap, type ChatMessage, type RaidEvent } from "@/lib/twitch-chat-client";
import { formatHandleDisplay } from "@/lib/watch/display-label";
import type { PassportChatIdentity } from "@/lib/passport/chat-identity";

type Me = {
  signedIn: boolean;
  twitch: {
    username: string | null;
    avatarUrl: string | null;
    canSend: boolean;
    canReadEmotes?: boolean;
    needsReconnect?: boolean;
    needsEmoteReconnect?: boolean;
    status: string;
  } | null;
};

type ComposerChannel = {
  login: string;
  displayName: string;
  userId?: string;
  avatarUrl?: string;
  channelLogoUrl?: string;
  channelLogoName?: string;
  isCore?: boolean;
};

type DeliveryResult = {
  ok: boolean;
  channel: string;
  error?: string;
  retryAfterMs?: number;
};

export type ChatEmote = {
  code: string;
  url: string;
  provider: "twitch" | "bttv" | "7tv";
};

type EmoteProviderFilter = "all" | ChatEmote["provider"];

const normalize = (login: string) => login.toLowerCase();
const EMPTY_EMOTES: ChatEmote[] = [];

export function ChatComposer({
  channels,
  preferredTarget,
  reply,
  onClearReply,
  raid,
  onDismissRaid,
  onFollowRaid,
  emotes = EMPTY_EMOTES,
  nameplate,
  passportIdentity,
  onViewerLoginChange,
}: {
  channels: ComposerChannel[];
  preferredTarget?: string;
  reply?: { message: ChatMessage; channelLogin: string } | null;
  onClearReply?: () => void;
  raid?: RaidEvent | null;
  onDismissRaid?: () => void;
  onFollowRaid?: (toLogin: string) => void;
  emotes?: ChatEmote[];
  nameplate?: string | null;
  passportIdentity?: PassportChatIdentity | null;
  onViewerLoginChange?: (login: string | null) => void;
}) {
  const initialTarget = normalize(preferredTarget ?? channels[0]?.login ?? "");
  const [me, setMe] = useState<Me | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<string[]>(initialTarget ? [initialTarget] : []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [emoteSearch, setEmoteSearch] = useState("");
  const [emoteProvider, setEmoteProvider] = useState<EmoteProviderFilter>("all");
  const [targetEmotes, setTargetEmotes] = useState<ChatEmote[]>(emotes);
  const [twitchEmotes, setTwitchEmotes] = useState<ChatEmote[]>([]);
  const [emoteReconnectRequired, setEmoteReconnectRequired] = useState(false);
  const [emotesUnavailable, setEmotesUnavailable] = useState(false);
  const [confirmedMultiSend, setConfirmedMultiSend] = useState(false);
  const [failedTargets, setFailedTargets] = useState<string[]>([]);
  const [deliveryResults, setDeliveryResults] = useState<DeliveryResult[]>([]);
  const [meError, setMeError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { data: liveData } = useLiveStatus();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/me", { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`chat_me_${response.status}`);
        return response.json();
      })
      .then((data: Me) => {
        if (!cancelled) {
          setMeError(false);
          setMe(data);
          onViewerLoginChange?.(data.twitch?.username?.toLowerCase() ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMeError(true);
          onViewerLoginChange?.(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onViewerLoginChange]);

  useEffect(() => {
    let cancelled = false;
    if (!me?.signedIn || !me.twitch) {
      setTwitchEmotes([]);
      setEmoteReconnectRequired(false);
      setEmotesUnavailable(false);
      return;
    }
    if (!me.twitch.canReadEmotes) {
      setTwitchEmotes([]);
      setEmoteReconnectRequired(true);
      setEmotesUnavailable(false);
      return;
    }
    void fetch("/api/chat/emotes", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`chat_emotes_${response.status}`);
        return response.json() as Promise<{
          emotes?: ChatEmote[];
          reconnectRequired?: boolean;
          unavailable?: boolean;
        }>;
      })
      .then((result) => {
        if (cancelled) return;
        setTwitchEmotes(result.emotes ?? []);
        setEmoteReconnectRequired(Boolean(result.reconnectRequired));
        setEmotesUnavailable(Boolean(result.unavailable));
      })
      .catch(() => {
        if (!cancelled) {
          setTwitchEmotes([]);
          setEmotesUnavailable(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  const channelKey = channels.map((channel) => `${normalize(channel.login)}:${channel.userId ?? ""}`).join("|");

  useEffect(() => {
    const allowed = new Set(channels.map((channel) => normalize(channel.login)));
    setSelectedTargets((previous) => {
      const next = previous.filter((target) => allowed.has(target));
      if (next.length > 0) return next;
      const preferred = normalize(preferredTarget ?? "");
      if (preferred && allowed.has(preferred)) return [preferred];
      const first = normalize(channels[0]?.login ?? "");
      return first ? [first] : [];
    });
  }, [channelKey, preferredTarget, channels]);

  useEffect(() => {
    const preferred = normalize(preferredTarget ?? "");
    if (!preferred || !channels.some((channel) => normalize(channel.login) === preferred)) return;
    setSelectedTargets([preferred]);
    setConfirmedMultiSend(false);
  }, [preferredTarget, channels]);

  useEffect(() => {
    if (!reply) return;
    setSelectedTargets([normalize(reply.channelLogin)]);
    setText((current) =>
      current.includes(`@${reply.message.displayName}`)
        ? current
        : `@${reply.message.displayName} ${current}`,
    );
    setConfirmedMultiSend(false);
    inputRef.current?.focus();
  }, [reply]);

  const selectedKey = selectedTargets.join("|");
  useEffect(() => {
    let cancelled = false;
    const selectedChannels = selectedTargets
      .map((target) => channels.find((channel) => normalize(channel.login) === target))
      .filter((channel): channel is ComposerChannel => Boolean(channel));
    if (selectedChannels.length === 0) {
      setTargetEmotes(emotes);
      return;
    }
    void Promise.all(selectedChannels.map((channel) => loadEmoteMap(channel.userId ?? "")))
      .then((maps) => {
        if (cancelled) return;
        const merged = new Map<string, ChatEmote>();
        for (const emote of emotes) merged.set(emote.code, emote);
        for (let index = maps.length - 1; index >= 0; index--) {
          for (const [code, value] of maps[index] ?? []) {
            merged.set(code, { code, url: value.url, provider: value.provider });
          }
        }
        // Native Twitch emotes win when two providers expose the same code;
        // Twitch decides which codes the connected viewer may actually send.
        for (const emote of twitchEmotes) merged.set(emote.code, emote);
        setTargetEmotes([...merged.values()].slice(0, 800));
      })
      .catch(() => {
        if (!cancelled) setTargetEmotes(emotes);
      });
    return () => {
      cancelled = true;
    };
  }, [channelKey, selectedKey, emotes, channels, selectedTargets, twitchEmotes]);

  const primaryTarget = selectedTargets[0] ?? "";
  useEffect(() => {
    if (!me?.signedIn) return;
    const subject = primaryTarget || "house";
    void fetch("/api/account/presence", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "chat_open", subject, seconds: 0 }),
    });
    const timer = window.setInterval(() => {
      void fetch("/api/account/presence", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "heartbeat", subject, seconds: 60 }),
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [me?.signedIn, primaryTarget]);

  const liveLogins = useMemo(() => {
    const live = new Set(
      (liveData?.live ?? [])
        .filter((entry) => entry.isLive)
        .map((entry) => normalize(entry.login)),
    );
    return channels.map((channel) => normalize(channel.login)).filter((login) => live.has(login));
  }, [liveData, channels]);

  const emoteQuery = useMemo(() => {
    const match = /(?:^|\s):([a-zA-Z0-9_]{1,32})$/.exec(text);
    return match?.[1]?.toLowerCase() ?? null;
  }, [text]);

  const emoteHits = useMemo(() => {
    if (!emoteQuery) return [];
    return targetEmotes.filter((emote) => emote.code.toLowerCase().includes(emoteQuery)).slice(0, 8);
  }, [emoteQuery, targetEmotes]);

  const pickerEmotes = useMemo(() => {
    const query = emoteSearch.trim().toLowerCase();
    return targetEmotes
      .filter((emote) => emoteProvider === "all" || emote.provider === emoteProvider)
      .filter((emote) => !query || emote.code.toLowerCase().includes(query))
      .slice(0, 120);
  }, [emoteProvider, emoteSearch, targetEmotes]);

  function insertEmote(code: string) {
    setText((current) => {
      const colonQuery = /(?:^|\s):([a-zA-Z0-9_]{1,32})$/;
      if (colonQuery.test(current)) {
        return current.replace(colonQuery, (full) => {
        const lead = full.startsWith(" ") || full.startsWith("\t") ? full[0] : "";
        return `${lead}${code} `;
        });
      }
      const separator = current.length > 0 && !/\s$/.test(current) ? " " : "";
      return `${current}${separator}${code} `;
    });
    setEmoteOpen(false);
    setEmoteSearch("");
    inputRef.current?.focus();
  }

  function selectTargets(next: string[]) {
    setSelectedTargets([...new Set(next.map(normalize))]);
    setConfirmedMultiSend(false);
    setFailedTargets([]);
    setDeliveryResults([]);
    setHint(null);
    if (reply && (next.length !== 1 || normalize(next[0] ?? "") !== normalize(reply.channelLogin))) {
      onClearReply?.();
    }
  }

  async function deliver(targets: string[]) {
    if (!text.trim() || targets.length === 0) return;
    setBusy(true);
    setHint(null);
    setDeliveryResults([]);
    try {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          targets,
          replyParentMessageId:
            targets.length === 1 && reply && normalize(reply.channelLogin) === targets[0]
              ? reply.message.id
              : undefined,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        complete?: boolean;
        error?: string;
        results?: DeliveryResult[];
      };
      const results = data.results ?? [];
      const successes = results.filter((result) => result.ok);
      const failures = results.filter((result) => !result.ok);
      setDeliveryResults(results);

      if (successes.length === 0) {
        setFailedTargets(failures.map((result) => result.channel).filter(Boolean));
        setHint(failures[0]?.error ?? data.error ?? "Couldn’t send.");
        return;
      }
      if (failures.length > 0) {
        const failed = failures.map((result) => result.channel).filter(Boolean);
        setFailedTargets(failed);
        setSelectedTargets(failed);
        setHint(`Sent to ${successes.length}; ${failures.length} need another try.`);
        return;
      }

      setText("");
      setFailedTargets([]);
      onClearReply?.();
      setHint(successes.length > 1 ? `Sent to ${successes.length} chats.` : "Sent.");
    } catch {
      setHint("Network error. Your message is still here.");
      setFailedTargets(targets);
    } finally {
      setBusy(false);
      setConfirmedMultiSend(false);
    }
  }

  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || selectedTargets.length === 0 || busy) return;
    if (selectedTargets.length > 1 && !confirmedMultiSend) {
      setConfirmedMultiSend(true);
      setHint(`Ready to send to ${selectedTargets.length} selected chats. Confirm once more.`);
      return;
    }
    void deliver(selectedTargets);
  }

  if (meError) {
    return (
      <ChatAccessBar
        title="Messages stay read-only"
        description="We couldn't check your Twitch connection. Reload to try again."
        actionLabel="Reload"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (!me) {
    return (
      <div aria-busy="true" aria-label="Checking chat access" className="flex min-h-16 items-center gap-3 border-t border-secondary px-1 py-3">
        <span className="size-9 animate-pulse rounded-lg bg-secondary" aria-hidden />
        <span className="h-4 w-52 animate-pulse rounded bg-secondary" aria-hidden />
      </div>
    );
  }

  if (!me.signedIn) {
    return (
      <ChatAccessBar
        title="Read-only mode"
        description="Sign in when you want to send messages from this hub."
        actionLabel="Sign in"
        actionHref="/login?next=/chat"
      />
    );
  }

  if (!me.twitch?.canSend) {
    const reconnect = Boolean(me.twitch?.needsReconnect);
    return (
      <ChatAccessBar
        title={reconnect ? "Twitch permission needed" : "Send as yourself on Twitch"}
        description={reconnect
          ? "Reconnect once to approve live-chat sending."
          : "Connect Twitch once to chat without leaving the hub."}
        actionLabel={reconnect ? "Reconnect Twitch" : "Connect Twitch"}
        actionHref="/account#connected-accounts"
      />
    );
  }

  const primaryChannel = channels.find((channel) => normalize(channel.login) === primaryTarget);
  const recipientLabel = selectedTargets.length === 0
    ? "Choose chats"
    : selectedTargets.length === 1
      ? `To ${primaryChannel?.displayName ?? primaryTarget}`
      : `To ${selectedTargets.length} chats`;

  return (
    <form onSubmit={send} className="flex shrink-0 flex-col gap-2 rounded-xl bg-secondary p-3 ring-1 ring-inset ring-secondary">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border bg-primary py-0.5 pl-0.5 pr-2 text-xs font-medium text-quaternary"
          style={{ borderColor: passportIdentity?.accent ?? "transparent" }}
          title={passportIdentity?.frame ? `Passport frame: ${passportIdentity.frame}` : undefined}
        >
          <span className="rounded-full p-0.5" style={{ boxShadow: passportIdentity ? `0 0 0 2px ${passportIdentity.accent}` : undefined }}>
            <Avatar
              size="xs"
              src={me.twitch.avatarUrl}
              alt=""
              initials={formatHandleDisplay(me.twitch.username ?? "").charAt(0) || "?"}
            />
          </span>
          @{formatHandleDisplay(me.twitch.username ?? "")}
        </span>
        {passportIdentity?.nameplate || nameplate ? <Badge color="brand" size="sm">{passportIdentity?.nameplate ?? nameplate}</Badge> : null}
        {passportIdentity?.title && passportIdentity.title !== passportIdentity.nameplate ? <Badge color="gray" size="sm">{passportIdentity.title}</Badge> : null}
        {passportIdentity?.badges.slice(0, 3).map((badge) => <span key={badge.code} title={`${badge.name} · ${badge.tier}`} className="inline-flex size-6 items-center justify-center rounded-full border border-brand-secondary bg-brand-primary text-[10px] font-bold text-brand-secondary" aria-label={`${badge.name} Passport badge`}>★</span>)}
        {passportIdentity?.featuredCard ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-secondary bg-primary py-0.5 pl-0.5 pr-2 text-[10px] font-semibold text-secondary" title={`Featured Moment Card: ${passportIdentity.featuredCard.name}${passportIdentity.featuredCard.serialNumber ? ` #${passportIdentity.featuredCard.serialNumber}` : ""}`}>
            {passportIdentity.featuredCard.artworkUrl ? <img src={passportIdentity.featuredCard.artworkUrl} alt="" className="size-5 rounded-full object-cover" loading="lazy" /> : <span className="grid size-5 place-items-center rounded-full bg-brand-primary text-brand-secondary">◆</span>}
            {passportIdentity.featuredCard.name}
          </span>
        ) : null}
        {passportIdentity && (passportIdentity.frame || passportIdentity.theme || passportIdentity.reactions.length > 0) ? (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full border border-secondary bg-primary px-2 py-1 text-[10px] font-semibold text-tertiary focus:outline-none focus:ring-2 focus:ring-brand">Identity</summary>
            <div className="absolute bottom-full left-0 z-40 mb-1 w-64 rounded-xl border border-secondary bg-primary p-3 text-xs text-secondary shadow-xl">
              <p className="font-semibold text-primary">CORE Passport identity</p>
              {passportIdentity.frame ? <p className="mt-1">Frame · {passportIdentity.frame}</p> : null}
              {passportIdentity.theme ? <p>Theme · {passportIdentity.theme}</p> : null}
              {passportIdentity.reactions.length ? <p>Reaction pack · {passportIdentity.reactions.join(", ")}</p> : null}
            </div>
          </details>
        ) : null}
        <details className="group/recipients relative">
          <summary className="cursor-pointer list-none rounded-md bg-primary px-2.5 py-1.5 text-sm font-semibold text-primary ring-1 ring-inset ring-secondary focus:outline-none focus:ring-2 focus:ring-brand">
            {recipientLabel} <span aria-hidden className="text-quaternary">⌄</span>
          </summary>
          <div className="absolute bottom-full left-0 z-40 mb-1 w-72 rounded-xl bg-primary p-2 shadow-xl ring-1 ring-inset ring-secondary">
            <p className="px-2 pb-1 text-xs font-medium text-quaternary">Recipients</p>
            <ul className="max-h-52 overflow-y-auto">
              {channels.map((channel) => {
                const login = normalize(channel.login);
                const checked = selectedTargets.includes(login);
                const live = liveLogins.includes(login);
                return (
                  <li key={login}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-secondary">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => selectTargets(checked ? selectedTargets.filter((target) => target !== login) : [...selectedTargets, login])}
                        className="accent-brand-600"
                      />
                      <ChannelLogo
                        name={channel.displayName}
                        logoUrl={channel.channelLogoUrl}
                        logoName={channel.channelLogoName}
                        avatarUrl={channel.avatarUrl}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-secondary">{channel.displayName}</span>
                      {live ? <span className="text-xs font-semibold text-error-primary">Live</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-1 flex items-center justify-between border-t border-secondary px-1 pt-2">
              <Button type="button" size="sm" color="link-gray" isDisabled={liveLogins.length === 0} onPress={() => selectTargets(liveLogins)}>
                Select live ({liveLogins.length})
              </Button>
              <Button type="button" size="sm" color="link-gray" onPress={() => selectTargets([])}>Clear</Button>
            </div>
          </div>
        </details>
        {primaryChannel && selectedTargets.length === 1 ? (
          <a href={`https://www.twitch.tv/popout/${primaryChannel.login}/chat?popout=`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand-secondary hover:underline">
            Open on Twitch
          </a>
        ) : null}
      </div>

      {raid ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary px-3 py-2 text-sm ring-1 ring-inset ring-brand">
          <p className="text-secondary">
            <span className="font-semibold text-primary">{raid.fromName}</span> raided {raid.toLogin}{raid.viewers ? ` with ${raid.viewers} viewers` : ""}.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" color="primary" onPress={() => {
              onFollowRaid?.(raid.toLogin);
              selectTargets([raid.toLogin]);
              setText((current) => current || `raid from ${raid.fromName} 👋`);
            }}>Follow raid</Button>
            <Button type="button" size="sm" color="secondary" onPress={onDismissRaid}>Dismiss</Button>
          </div>
        </div>
      ) : null}

      {reply ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs text-tertiary ring-1 ring-inset ring-secondary">
          <span className="truncate">Replying to <span className="font-semibold text-secondary">{reply.message.displayName}</span>: {reply.message.raw.slice(0, 80)}</span>
          <button type="button" className="shrink-0 font-medium text-brand-secondary" onClick={onClearReply}>Cancel</button>
        </div>
      ) : null}

      <div className="relative flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setConfirmedMultiSend(false);
            setFailedTargets([]);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && (emoteOpen || emoteHits.length > 0)) {
              event.preventDefault();
              setEmoteOpen(false);
              setEmoteSearch("");
            }
          }}
          maxLength={500}
          placeholder={selectedTargets.length ? "Say something…" : "Choose at least one chat"}
          className="min-w-0 flex-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary ring-1 ring-inset ring-secondary placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <Button
          type="button"
          size="md"
          color="secondary"
          onPress={() => setEmoteOpen((open) => !open)}
          isDisabled={targetEmotes.length === 0 && !emoteReconnectRequired}
          aria-label="Browse Twitch, 7TV, and BetterTTV emotes"
        >
          Emotes
        </Button>
        <Button type="submit" size="md" color="primary" isDisabled={busy || !text.trim() || selectedTargets.length === 0} isLoading={busy}>
          {confirmedMultiSend ? `Confirm ${selectedTargets.length}` : "Send"}
        </Button>

        {!emoteOpen && emoteHits.length > 0 ? (
          <ul
            className="absolute bottom-full left-0 z-30 mb-1 max-h-52 w-80 overflow-y-auto rounded-xl bg-primary p-1.5 shadow-xl ring-1 ring-inset ring-secondary"
            aria-label="Matching emotes"
          >
            {emoteHits.map((emote) => (
              <li key={`${emote.provider}:${emote.code}`}>
                <button
                  type="button"
                  onClick={() => insertEmote(emote.code)}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={emote.url} alt="" className="size-7 object-contain" />
                  <span className="min-w-0 flex-1 truncate font-medium text-secondary">{emote.code}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-quaternary">
                    {emoteProviderLabel(emote.provider)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {emoteOpen ? (
          <section
            className="absolute bottom-full left-0 z-30 mb-2 flex max-h-[28rem] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl bg-primary shadow-2xl ring-1 ring-inset ring-secondary"
            aria-label="Emote picker"
          >
            <div className="border-b border-secondary p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">Emotes</p>
                  <p className="text-xs text-quaternary">Twitch, 7TV, and BetterTTV</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEmoteOpen(false)}
                  className="grid size-9 place-items-center rounded-lg text-lg text-quaternary transition-colors hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label="Close emote picker"
                >
                  ×
                </button>
              </div>
              <input
                value={emoteSearch}
                onChange={(event) => setEmoteSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setEmoteOpen(false);
                    inputRef.current?.focus();
                  }
                }}
                placeholder="Search emotes…"
                aria-label="Search emotes"
                className="mt-3 h-10 w-full rounded-lg bg-secondary px-3 text-sm text-primary ring-1 ring-inset ring-secondary placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="mt-2 flex flex-wrap gap-1" aria-label="Filter emote provider">
                {(["all", "twitch", "7tv", "bttv"] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setEmoteProvider(provider)}
                    className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      emoteProvider === provider
                        ? "bg-brand-solid text-white"
                        : "bg-secondary text-tertiary hover:text-primary"
                    }`}
                    aria-pressed={emoteProvider === provider}
                  >
                    {provider === "all" ? "All" : emoteProviderLabel(provider)}
                  </button>
                ))}
              </div>
            </div>

            {emoteReconnectRequired ? (
              <div className="border-b border-secondary bg-brand-primary px-3 py-2 text-xs text-secondary">
                Reconnect Twitch once to add your subscriber and personal emotes. 7TV and BetterTTV stay available.{" "}
                <a href="/account#connected-accounts" className="font-semibold text-brand-secondary hover:underline">
                  Reconnect
                </a>
              </div>
            ) : null}
            {emotesUnavailable ? (
              <p className="border-b border-secondary px-3 py-2 text-xs text-warning-primary">
                Twitch emotes are temporarily unavailable; 7TV and BetterTTV still work.
              </p>
            ) : null}

            <ul className="grid min-h-24 flex-1 grid-cols-4 gap-1 overflow-y-auto p-2" aria-live="polite">
              {pickerEmotes.map((emote) => (
                <li key={`${emote.provider}:${emote.code}`}>
                  <button
                    type="button"
                    onClick={() => insertEmote(emote.code)}
                    className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-lg p-2 text-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    title={`${emote.code} · ${emoteProviderLabel(emote.provider)}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={emote.url} alt="" className="size-9 object-contain" loading="lazy" decoding="async" />
                    <span className="w-full truncate text-[11px] font-medium text-secondary">{emote.code}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-quaternary">
                      {emoteProviderLabel(emote.provider)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {pickerEmotes.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-quaternary">No matching emotes.</p>
            ) : null}
          </section>
        ) : null}
      </div>

      {hint ? <p className="text-xs text-tertiary" role="status">{hint}</p> : null}
      {deliveryResults.some((result) => !result.ok) ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-error-primary" aria-label="Failed deliveries">
          {deliveryResults.filter((result) => !result.ok).map((result) => (
            <li key={result.channel}>@{formatHandleDisplay(result.channel)}: {result.error ?? "Not sent"}</li>
          ))}
        </ul>
      ) : null}
      {failedTargets.length > 0 ? (
        <div>
          <Button type="button" size="sm" color="secondary" isDisabled={busy} onPress={() => void deliver(failedTargets)}>
            Retry failed ({failedTargets.length})
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function emoteProviderLabel(provider: ChatEmote["provider"]): string {
  if (provider === "twitch") return "Twitch";
  if (provider === "bttv") return "BTTV";
  return "7TV";
}

function ChatAccessBar({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <aside aria-label="Chat sending" className="flex shrink-0 flex-wrap items-center gap-3 border-t border-secondary px-1 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#9146ff] text-white shadow-xs" aria-hidden>
        <SocialIcon platform="twitch" size={17} />
      </span>
      <span className="min-w-[180px] flex-1">
        <span className="block text-sm font-semibold text-primary">{title}</span>
        <span className="block text-xs text-tertiary">{description}</span>
      </span>
      {actionHref ? (
        <Button href={actionHref} size="sm" color="secondary">{actionLabel}</Button>
      ) : (
        <Button type="button" size="sm" color="secondary" onPress={onAction}>{actionLabel}</Button>
      )}
    </aside>
  );
}
