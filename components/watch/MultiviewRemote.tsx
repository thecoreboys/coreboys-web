"use client";

import { ArrowLeft, Check, ChevronDown, Copy, MonitorPlay, Radio, Share2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { TwitchChat } from "@/components/live/TwitchChat";
import { YouTubeLiveChat } from "@/components/live/YouTubeLiveChat";
import { CombinedRemoteChat } from "@/components/watch/CombinedRemoteChat";
import { useAuth } from "@/components/providers/AuthProvider";
import { postMultiviewRemote, useRemoteSessions } from "@/hooks/useMultiviewRemote";
import { openAuthModal } from "@/lib/auth/modal";
import { MEMBERS } from "@/lib/members";
import {
  MULTIVIEW_LAUNCH_PATH, MULTIVIEW_REMOTE_PATH, remoteDeviceName, remoteSourceKey,
  type RemotePlatform, type RemoteSession, type RemoteSource,
} from "@/lib/watch/multiview-remote";

type ChatMode = RemotePlatform | "both";
const chatLabels: Record<ChatMode, string> = { both: "Both chats", twitch: "Twitch", youtube: "YouTube" };
const panel = "rounded-2xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]";
const primaryButton = "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500";
const secondaryButton = "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-[color:var(--rule)] px-5 text-sm font-semibold hover:bg-[color:var(--ui-hover)]";

function deviceLabel(session: RemoteSession, sessions: RemoteSession[]) {
  const siblings = sessions.filter(({ device }) => device === session.device);
  const name = remoteDeviceName(session.device);
  return siblings.length > 1 ? `${name} ${siblings.findIndex(({ id }) => id === session.id) + 1}` : name;
}

function LaunchMultiview({ linked }: { linked: boolean }) {
  const [status, setStatus] = useState("");
  const [manualLink, setManualLink] = useState("");
  const launchUrl = () => new URL(MULTIVIEW_LAUNCH_PATH, window.location.origin).href;
  async function copyLink() {
    const url = launchUrl();
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied");
    } catch {
      setStatus("Select the link below to copy it.");
      setManualLink(url);
    }
  }
  async function shareLink() {
    const native = (window as Window & { CoreMultiviewShare?: () => void }).CoreMultiviewShare;
    if (typeof native === "function") {
      try {
        native();
        return;
      } catch { /* Fall through to the browser share action. */ }
    }
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: "Open CORE Multiview", url: launchUrl() });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) await copyLink();
    }
  }

  return (
    <section className={`${panel} relative overflow-hidden p-5 sm:p-8`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(113,95,246,0.15),transparent_62%)]" />
      <div className="relative">
        <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-indigo-500/12 text-indigo-700 dark:text-indigo-200">
          <MonitorPlay className="size-5" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{linked ? "Open on another computer" : "Start a Multiview"}</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[color:var(--ink-dim)]">
          Send yourself the link. Open it on your computer and sign in to the same CORE account.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={shareLink} className={primaryButton}><Share2 className="size-4" aria-hidden /> Share launch link</button>
          <button type="button" onClick={copyLink} className={secondaryButton}><Copy className="size-4" aria-hidden /> Copy link</button>
        </div>
        <p aria-live="polite" className={status ? "mt-3 text-sm text-[color:var(--ink-dim)]" : "sr-only"}>{status}</p>
        {manualLink ? <input readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} aria-label="Multiview launch link" className="mt-2 w-full rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg)] p-3 text-sm" /> : null}
      </div>
    </section>
  );
}

function platformChoice(sources: RemoteSource[], preferred?: ChatMode): ChatMode {
  if (sources.length > 1 && (!preferred || preferred === "both")) return "both";
  return sources.find(({ platform }) => platform === preferred)?.platform ?? sources[0]?.platform ?? "twitch";
}

function RemoteChat({ member, mode, sources, sessionId }: { member: (typeof MEMBERS)[number]; mode: ChatMode; sources: RemoteSource[]; sessionId: string }) {
  const twitch = mode !== "youtube" && sources.some(({ platform }) => platform === "twitch");
  const youtube = mode !== "twitch" ? sources.find(({ platform }) => platform === "youtube")?.videoId : undefined;
  const login = twitch ? member.twitchLogin : null;
  const { data } = useSWR<{ id?: string }>(login ? `/api/twitch/user/${encodeURIComponent(login)}` : null, async (url: string) => {
    const response = await fetch(url);
    return response.ok ? response.json() : {};
  }, { revalidateOnFocus: false });

  if (!twitch && !youtube) return <p className={`${panel} p-5 text-sm text-[color:var(--ink-dim)]`}>There’s no live chat for {member.stageName} right now.</p>;

  const providerChats = (
    <div className={`grid min-w-0 gap-3 ${twitch && youtube ? "sm:grid-cols-2" : ""}`}>
      {twitch ? (
        <div data-lenis-prevent className={`min-w-0 ${youtube ? "h-[16rem] sm:h-[24rem]" : "h-[clamp(17rem,52dvh,34rem)]"}`}>
          <TwitchChat login={member.twitchLogin} userId={data?.id ?? ""} displayName={member.stageName} compact />
        </div>
      ) : null}
      {youtube ? (
        <div className={`min-w-0 ${twitch ? "h-[16rem] sm:h-[24rem]" : "h-[clamp(17rem,52dvh,34rem)]"}`}>
          <YouTubeLiveChat videoId={youtube} title={member.stageName} />
        </div>
      ) : null}
    </div>
  );
  return twitch && youtube && login ? (
    <CombinedRemoteChat
      key={youtube}
      sessionId={sessionId}
      videoId={youtube}
      login={login}
      twitchUserId={data?.id}
      name={member.stageName}
      fallback={providerChats}
    />
  ) : providerChats;
}

function ConnectedRemote({
  session, sessions, changeSession, onUpdate,
}: {
  session: RemoteSession;
  sessions: RemoteSession[];
  changeSession: (id: string) => void;
  onUpdate: (session?: RemoteSession) => void;
}) {
  const [choice, setChoice] = useState<{ member: string; mode: ChatMode } | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const observedMain = useRef(session.main);
  const latestRequest = useRef(0);
  const requestQueue = useRef(Promise.resolve());
  useEffect(() => () => { latestRequest.current += 1; }, []);
  const main = session.sources.find((source) => remoteSourceKey(source) === session.main);
  const preferredMember = choice?.member ?? main?.member ?? session.sources[0]?.member;
  const member = MEMBERS.find(({ slug }) => slug === preferredMember) ?? MEMBERS[0];
  const memberSlug = member?.slug;
  const sources = session.sources.filter(({ member }) => member === memberSlug);
  const mode = platformChoice(sources, choice?.mode);
  const pending = session.command?.status === "pending";
  const device = deviceLabel(session, sessions);
  const mainMemberSlug = main?.member;
  const mainPlatform = main?.platform;

  useEffect(() => {
    if (sending || pending || session.main === observedMain.current) return;
    observedMain.current = session.main;
    if (!mainMemberSlug) return;
    setChoice((previous) => previous?.member === mainMemberSlug && (previous.mode === "both" || previous.mode === mainPlatform) ? previous : null);
  }, [mainMemberSlug, mainPlatform, pending, sending, session.main]);

  if (!member || !memberSlug) return null;

  function select(memberSlug: string, preferred?: ChatMode) {
    const options = session.sources.filter(({ member }) => member === memberSlug);
    const selectedMode = platformChoice(options, preferred);
    const target = selectedMode === "both"
      ? options.find(({ platform }) => platform === main?.platform) ?? options[0]
      : options.find(({ platform }) => platform === selectedMode);
    setChoice({ member: memberSlug, mode: selectedMode });
    setMessage("");
    const request = ++latestRequest.current;
    if (!target) {
      setSending(false);
      return;
    }
    setSending(true);
    requestQueue.current = requestQueue.current.then(async () => {
      if (latestRequest.current !== request) return;
      try {
        const response = await postMultiviewRemote({ action: "select", id: session.id, source: remoteSourceKey(target) });
        if (latestRequest.current !== request) return;
        if (!response.ok) {
          setMessage(response.status === 409 ? "That stream is no longer available on this computer." : "Couldn’t connect. Try again.");
          onUpdate();
          return;
        }
        const updated = await response.json() as { session: RemoteSession };
        if (latestRequest.current === request) onUpdate(updated.session);
      } catch {
        if (latestRequest.current === request) setMessage("Couldn’t connect. Try again.");
      } finally {
        if (latestRequest.current === request) setSending(false);
      }
    });
  }

  const mainMember = MEMBERS.find(({ slug }) => slug === main?.member);
  return (
    <section className="space-y-4" aria-label="Connected Multiview controls">
      <div className={`${panel} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"><MonitorPlay className="size-5" aria-hidden /></div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{device} connected</p>
            <p aria-live="polite" className="mt-0.5 text-sm leading-snug text-[color:var(--ink-dim)]">
              {sending || pending ? "Switching main source…" : mainMember && main ? `Main source · ${mainMember.stageName} on ${chatLabels[main.platform]}` : "Ready for a live source"}
            </p>
          </div>
        </div>
        {sessions.length > 1 ? (
          <div className="relative w-full sm:w-auto">
            <select aria-label="Computer to control" value={session.id} onChange={(event) => changeSession(event.target.value)} className="min-h-11 w-full appearance-none rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg)] py-2 pl-3 pr-9 text-sm">
              {sessions.map((entry) => <option key={entry.id} value={entry.id}>{deviceLabel(entry, sessions)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
          </div>
        ) : null}
      </div>
      {message || session.command?.status === "unavailable" ? (
        <p role="status" className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm">{message || "The computer couldn’t switch to that stream. Choose an available source and try again."}</p>
      ) : null}
      <div>
        <h2 className="mb-2 text-base font-semibold">Choose a member</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="CORE members">
          {MEMBERS.map((entry) => {
            const live = session.sources.some(({ member }) => member === entry.slug);
            const selected = entry.slug === memberSlug;
            return (
              <button key={entry.slug} type="button" aria-pressed={selected} onClick={() => select(entry.slug, choice?.mode)} className={`flex min-h-[6.5rem] min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-center transition-colors ${selected ? "border-indigo-500 bg-indigo-500/12" : "border-[color:var(--rule)] bg-[color:var(--bg-elev)] hover:bg-[color:var(--ui-hover)]"}`}>
                <Image src={entry.portrait} alt="" width={36} height={36} className="size-9 rounded-full object-cover" />
                <span className="max-w-full text-xs font-semibold leading-tight [overflow-wrap:anywhere]">{entry.stageName}</span>
                <span className="inline-flex min-w-0 items-center justify-center gap-1 text-xs leading-tight text-[color:var(--ink-dim)]">
                  {main?.member === entry.slug ? <><Check className="size-3 shrink-0" aria-hidden /> Main</> : live ? <><Radio className="size-3 shrink-0 text-red-500" aria-hidden /> Live</> : "Offline"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <section aria-label={`${member.stageName} live chats`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="min-w-0 break-words text-lg font-semibold tracking-tight">{member.stageName} chat</h2>
          {sources.length > 0 ? (
            <div className="flex max-w-full flex-wrap gap-1 rounded-2xl border border-[color:var(--rule)] p-1" role="group" aria-label="Chat platform">
              {(["both", "twitch", "youtube"] as const).filter((item) =>
                item === "both" ? sources.length > 1 : sources.some(({ platform }) => platform === item),
              ).map((item) => (
                <button key={item} type="button" onClick={() => select(memberSlug, item)} aria-pressed={mode === item} className={`min-h-11 cursor-pointer rounded-xl px-3 text-xs font-semibold ${mode === item ? "bg-indigo-600 text-white" : "hover:bg-[color:var(--ui-hover)]"}`}>{chatLabels[item]}</button>
              ))}
            </div>
          ) : null}
        </div>
        <RemoteChat key={memberSlug} member={member} mode={mode} sources={sources} sessionId={session.id} />
      </section>
    </section>
  );
}

function AccountRemote({ accountId }: { accountId: string }) {
  const { data, error, mutate } = useRemoteSessions(accountId, 2000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLaunch, setShowLaunch] = useState(false);
  const active = data?.find(({ id }) => id === selectedId) ?? data?.find(({ main }) => main) ?? data?.[0];
  const activeId = active?.id ?? null;
  useEffect(() => {
    if (data) setSelectedId(activeId);
  }, [activeId, data]);
  if (error) return <div className={`${panel} p-5`} role="status"><p>Couldn’t check for Multiview sessions.</p><button type="button" onClick={() => void mutate()} className={`${secondaryButton} mt-3`}>Try again</button></div>;
  if (!data) return <p className={`${panel} p-5 text-sm text-[color:var(--ink-dim)]`} role="status">Looking for your computers…</p>;
  if (!active) return <LaunchMultiview linked={false} />;
  return (
    <div className="space-y-5">
      <ConnectedRemote
        key={active.id}
        session={active}
        sessions={data}
        changeSession={setSelectedId}
        onUpdate={(session) => {
          if (!session) {
            void mutate();
            return;
          }
          void mutate((sessions) => sessions?.map((entry) =>
            entry.id === session.id && (entry.command?.revision ?? 0) < (session.command?.revision ?? 0) ? session : entry,
          ), { revalidate: false });
        }}
      />
      {showLaunch ? <LaunchMultiview linked /> : (
        <button type="button" onClick={() => setShowLaunch(true)} className={secondaryButton}><Share2 className="size-4" aria-hidden /> Open on another computer</button>
      )}
    </div>
  );
}

export function MultiviewRemote() {
  const { user, loading } = useAuth();
  return (
    <div className="bg-[color:var(--bg)] text-[color:var(--ink)]">
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-5 sm:px-6 sm:pt-8">
        <Link prefetch={false} href="/multiview" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]">
          <ArrowLeft className="size-4" aria-hidden /> Multiview
        </Link>
        <h1 className="mb-5 mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Multiview remote</h1>
        {loading ? <p className="text-sm text-[color:var(--ink-dim)]" role="status">Loading your account…</p> : user ? (
          <AccountRemote key={user.id} accountId={user.id} />
        ) : (
          <section className={`${panel} p-5 sm:p-8`}>
            <h2 className="text-xl font-semibold">Sign in to connect your phone</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[color:var(--ink-dim)]">Use the same CORE account on your phone and computer.</p>
            <button type="button" onClick={() => openAuthModal({ next: MULTIVIEW_REMOTE_PATH })} className={`${primaryButton} mt-5`}>Sign in</button>
          </section>
        )}
      </div>
    </div>
  );
}
