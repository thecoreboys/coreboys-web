"use client";

import { ArrowLeft, Check, Copy, Maximize2, Minimize2, MonitorPlay, MoreHorizontal, Share2, Theater, Volume2, VolumeOff, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { TwitchChat } from "@/components/live/TwitchChat";
import { YouTubeLiveChat } from "@/components/live/YouTubeLiveChat";
import { CombinedRemoteChat } from "@/components/watch/CombinedRemoteChat";
import { useAuth } from "@/components/providers/AuthProvider";
import { postMultiviewRemote, useRemoteSessions } from "@/hooks/useMultiviewRemote";
import { openAuthModal } from "@/lib/auth/modal";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { MEMBERS } from "@/lib/members";
import {
  MULTIVIEW_LAUNCH_PATH, MULTIVIEW_REMOTE_PATH, remoteDeviceName, remoteSourceKey,
  type RemoteControl, type RemoteHostState, type RemotePlatform, type RemoteSession, type RemoteSource,
} from "@/lib/watch/multiview-remote";
import "./MultiviewRemote.css";
import { WatchSelect } from "@/components/watch/WatchSelect";

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

  if (!twitch && !youtube) return <p className={`${panel} grid h-full place-items-center p-5 text-center text-sm text-[color:var(--ink-dim)]`}>There’s no live chat for {member.stageName} right now.</p>;

  const providerChats = (
    <div className={`grid h-full min-h-0 min-w-0 gap-2 ${twitch && youtube ? "grid-rows-2 sm:grid-cols-2 sm:grid-rows-1" : "grid-rows-1"}`}>
      {twitch ? (
        <div data-lenis-prevent className="h-full min-h-0 min-w-0">
          <TwitchChat login={member.twitchLogin} userId={data?.id ?? ""} displayName={member.stageName} avatarUrl={member.portrait} channelLogoUrl={member.comm.logo} channelLogoName={member.comm.name} accent={member.accent} floatingJumpToLatest isCore />
        </div>
      ) : null}
      {youtube ? (
        <div className="h-full min-h-0 min-w-0">
          <YouTubeLiveChat videoId={youtube} title={member.stageName} channelLogoUrl={member.comm.logo} channelLogoName={member.comm.name} avatarUrl={member.portrait} />
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
      logoUrl={member.comm.logo}
      logoName={member.comm.name}
      avatarUrl={member.portrait}
      fallback={providerChats}
    />
  ) : providerChats;
}

function memberName(sourceKey: string | null | undefined) {
  const slug = sourceKey?.split(":")[0];
  return MEMBERS.find((member) => member.slug === slug)?.stageName ?? null;
}

function soundSummary(state: RemoteHostState, main: string | null) {
  if (!state.audibleCount) return "Computer muted";
  const lead = state.mainAudible ? main : state.audible[0];
  const name = memberName(lead) ?? (state.mainAudible ? "Main view" : "Another view");
  return state.audibleCount > 1 ? `${name} +${state.audibleCount - 1}` : name;
}

/** Mirrors the computer's sound and stage state; each tap sends one control command. */
function RemoteControls({
  state, main, busy, onControl,
}: {
  state: RemoteHostState;
  main: string | null;
  busy: RemoteControl | null;
  onControl: (control: RemoteControl) => void;
}) {
  const summary = soundSummary(state, main);
  const theater = state.layout === "theater-first";
  const controls: Array<{
    control: RemoteControl; label: string; title: string; icon: typeof Volume2; pressed?: boolean; disabled?: boolean;
  }> = [
    state.mainAudible
      ? { control: "main-sound-off", label: "Sound", title: "Mute the main view", icon: Volume2, pressed: true, disabled: !main }
      : { control: "main-sound-on", label: "Muted", title: "Play the main view’s sound", icon: VolumeX, pressed: false, disabled: !main },
    { control: "mute-all", label: "Mute all", title: "Mute every view", icon: VolumeOff, disabled: state.audibleCount === 0 },
    state.maximized
      ? { control: "restore", label: "Restore", title: "Restore the main view", icon: Minimize2, pressed: true }
      : { control: "maximize", label: "Maximize", title: "Maximize the main view", icon: Maximize2, pressed: false, disabled: !main },
    { control: "theater", label: "Theater", title: theater ? "Theater layout is on" : "Switch to the Theater layout", icon: Theater, pressed: theater, disabled: theater },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-[color:var(--rule)] px-2 py-1" role="group" aria-label="Computer playback controls">
      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-[color:var(--ink-dim)]" aria-live="polite">
        {state.audibleCount ? <Volume2 className="size-3.5 shrink-0 text-emerald-500" aria-hidden /> : <VolumeX className="size-3.5 shrink-0" aria-hidden />}
        <span className="truncate"><span className="sr-only">Sound on computer: </span>{summary}</span>
      </p>
      {controls.map(({ control, label, title, icon: Icon, pressed, disabled }) => {
        const working = busy === control;
        return <button key={label} type="button" title={title} aria-label={title} aria-pressed={pressed} aria-busy={working || undefined} disabled={disabled} onClick={() => onControl(control)} className={"inline-flex h-11 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-default disabled:opacity-45 " + (pressed ? "bg-[color:var(--ink)] text-[color:var(--bg)]" : "text-[color:var(--ink-dim)] enabled:hover:bg-[color:var(--ui-hover)]") + (working ? " animate-pulse" : "")}>
          <Icon className="size-4" aria-hidden />{label}
        </button>;
      })}
    </div>
  );
}

function ConnectedRemote({
  session, sessions, changeSession, onUpdate, onOpenComputer,
}: {
  session: RemoteSession;
  sessions: RemoteSession[];
  changeSession: (id: string) => void;
  onUpdate: (session?: RemoteSession) => void;
  onOpenComputer: () => void;
}) {
  const [choice, setChoice] = useState<{ member: string; mode: ChatMode } | null>(null);
  const [busy, setBusy] = useState<"select" | RemoteControl | null>(null);
  const sending = busy === "select";
  const [message, setMessage] = useState("");
  const latestRequest = useRef(0);
  const requestQueue = useRef(Promise.resolve());
  useEffect(() => () => { latestRequest.current += 1; }, []);
  const main = session.sources.find((source) => remoteSourceKey(source) === session.main);
  const preferredMember = choice?.member ?? main?.member ?? session.sources[0]?.member;
  const member = MEMBERS.find(({ slug }) => slug === preferredMember) ?? MEMBERS[0];
  const memberSlug = member?.slug;
  const sources = session.sources.filter(({ member }) => member === memberSlug);
  const mode = platformChoice(sources, choice?.mode);
  const pending = session.command?.status === "pending" && !session.command.control;
  const pendingControl = session.command?.status === "pending" ? session.command.control : null;
  const device = deviceLabel(session, sessions);
  const mainMemberSlug = main?.member;
  const mainPlatform = main?.platform;

  useEffect(() => {
    if (sending || pending) return;
    setChoice((previous) => previous && previous.member === mainMemberSlug && (previous.mode === "both" || previous.mode === mainPlatform) ? previous : null);
  }, [mainMemberSlug, mainPlatform, pending, sending, session.main]);

  if (!member || !memberSlug) return null;

  // The latest tap wins: earlier queued requests are skipped and their replies ignored.
  function send(kind: "select" | RemoteControl, body: object, conflict: string) {
    setMessage("");
    const request = ++latestRequest.current;
    setBusy(kind);
    requestQueue.current = requestQueue.current.then(async () => {
      if (latestRequest.current !== request) return;
      try {
        const response = await postMultiviewRemote(body);
        if (latestRequest.current !== request) return;
        if (!response.ok) {
          setMessage(response.status === 409 ? conflict : "Couldn’t connect. Try again.");
          onUpdate();
          return;
        }
        const updated = await response.json() as { session: RemoteSession };
        if (latestRequest.current === request) onUpdate(updated.session);
      } catch {
        if (latestRequest.current === request) setMessage("Couldn’t connect. Try again.");
      } finally {
        if (latestRequest.current === request) setBusy(null);
      }
    });
  }

  function select(memberSlug: string, preferred?: ChatMode) {
    const options = session.sources.filter(({ member }) => member === memberSlug);
    const selectedMode = platformChoice(options, preferred);
    const target = selectedMode === "both"
      ? options.find(({ platform }) => platform === main?.platform) ?? options[0]
      : options.find(({ platform }) => platform === selectedMode);
    setChoice({ member: memberSlug, mode: selectedMode });
    if (!target) {
      setMessage("");
      latestRequest.current += 1;
      setBusy(null);
      return;
    }
    send("select", { action: "select", id: session.id, source: remoteSourceKey(target) }, "That stream is no longer available on this computer.");
  }

  function control(next: RemoteControl) {
    send(next, { action: "control", id: session.id, control: next }, "This computer can’t take playback controls yet. Reload Multiview on it and try again.");
  }

  const liveMembers = MEMBERS.filter((entry) => session.sources.some((source) => source.member === entry.slug));
  return (
    <section data-remote-chat-screen className="remote-chat-screen" aria-label="Connected Multiview controls">
      <header className="relative z-20 flex shrink-0 items-center gap-1 border-b border-[color:var(--rule)] px-1 py-1">
        <h1 className="sr-only">Multiview remote</h1>
        <p aria-live="polite" className="sr-only">{sending || pending ? "Switching main source…" : busy || pendingControl ? "Sending to " + device + "…" : device + " connected"}</p>
        <Link prefetch={false} href="/" aria-label="Back to CORE" className="grid size-11 shrink-0 place-items-center rounded-xl text-[color:var(--ink-dim)] hover:bg-[color:var(--ui-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"><ArrowLeft className="size-4" aria-hidden /></Link>
        <div className="remote-channel-switcher flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-contain py-0.5" role="group" aria-label="Main source and chat channel" data-lenis-prevent>
          {liveMembers.map((entry) => {
            const selected = entry.slug === memberSlug;
            return <button key={entry.slug} type="button" aria-label={"Watch " + entry.stageName + " and open chat"} aria-pressed={selected} onClick={() => select(entry.slug, choice?.mode)} className={"inline-flex min-h-11 min-w-max flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current " + (selected ? "bg-[color:var(--ink)] text-[color:var(--bg)]" : "text-[color:var(--ink-dim)] hover:bg-[color:var(--ui-hover)]")}>
              {selected ? <Check className="size-3 shrink-0" aria-hidden /> : null}{entry.stageName}
            </button>;
          })}
        </div>
        <details className="relative shrink-0">
          <summary aria-label="Remote options" title={device + " connected"} className="relative grid size-11 cursor-pointer list-none place-items-center rounded-xl text-[color:var(--ink-dim)] hover:bg-[color:var(--ui-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"><MoreHorizontal className="size-5" aria-hidden /><span className="absolute right-2 top-2 size-1 rounded-full bg-emerald-500" aria-hidden /></summary>
          <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-2xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-2 shadow-2xl">
            <p className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[color:var(--ink-dim)]"><MonitorPlay className="size-4 text-emerald-500" aria-hidden />{device} connected</p>
            {sessions.length > 1 ? <div className="p-2"><p className="mb-2 text-xs font-semibold text-[color:var(--ink-dim)]">Computer to control</p><WatchSelect ariaLabel="Computer to control" value={session.id} onChange={changeSession} options={sessions.map((entry) => ({ id: entry.id, label: deviceLabel(entry, sessions) }))} /></div> : null}
            <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onOpenComputer(); }} className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold hover:bg-[color:var(--ui-hover)]"><Share2 className="size-4 shrink-0" aria-hidden />Open on another computer</button>
            <Link prefetch={false} href="/special-message" className="mt-1 block rounded-xl border-t border-[color:var(--rule)] px-3 py-3 text-[11px] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]">Unofficial fan site · Read note</Link>
          </div>
        </details>
      </header>
      {session.state ? <RemoteControls state={session.state} main={session.main} busy={busy !== "select" ? busy ?? pendingControl : pendingControl} onControl={control} /> : null}
      {message || session.command?.status === "unavailable" ? <p role="status" className="shrink-0 border-b border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5">{message || (session.command?.control ? "The computer couldn’t do that. Try again." : "The computer couldn’t switch. Choose an available source and try again.")}</p> : null}
      {sources.length > 1 ? <div className="flex shrink-0 gap-1 border-b border-[color:var(--rule)] px-2 py-1" role="group" aria-label="Chat platform">
        {(["both", "twitch", "youtube"] as const).filter((item) => item === "both" || sources.some(({ platform }) => platform === item)).map((item) => <button key={item} type="button" onClick={() => select(memberSlug, item)} aria-pressed={mode === item} className={"min-h-9 flex-1 cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current " + (mode === item ? "bg-indigo-600 text-white" : "text-[color:var(--ink-dim)] hover:bg-[color:var(--ui-hover)]")}>{chatLabels[item]}</button>)}
      </div> : null}
      <section className="min-h-0 flex-1 overflow-hidden p-2" aria-label={member.stageName + " live chats"}>
        <h2 className="sr-only">{member.stageName} chat</h2>
        {session.sources.length ? <RemoteChat key={memberSlug} member={member} mode={mode} sources={sources} sessionId={session.id} /> : <p className="grid h-full place-items-center p-5 text-center text-sm text-[color:var(--ink-dim)]">Waiting for live streams on this computer…</p>}
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
  useEffect(() => { if (data) setSelectedId(activeId); }, [activeId, data]);
  if (error) return <RemotePageShell><div className={panel + " p-5"} role="status"><p>Couldn’t check for Multiview sessions.</p><button type="button" onClick={() => void mutate()} className={secondaryButton + " mt-3"}>Try again</button></div></RemotePageShell>;
  if (!data) return <RemotePageShell><p className={panel + " p-5 text-sm text-[color:var(--ink-dim)]"} role="status">Looking for your computers…</p></RemotePageShell>;
  if (!active) return <RemotePageShell><LaunchMultiview linked={false} /></RemotePageShell>;
  return <>
    <ConnectedRemote key={active.id} session={active} sessions={data} changeSession={setSelectedId} onOpenComputer={() => setShowLaunch(true)} onUpdate={(session) => {
      if (!session) { void mutate(); return; }
      void mutate((sessions) => sessions?.map((entry) => entry.id === session.id && (entry.command?.revision ?? 0) < (session.command?.revision ?? 0) ? session : entry), { revalidate: false });
    }} />
    {showLaunch ? <RemoteLaunchDialog onClose={() => setShowLaunch(false)} /> : null}
  </>;
}

function RemotePageShell({ children }: { children: React.ReactNode }) {
  return <div className="bg-[color:var(--bg)] text-[color:var(--ink)]"><div className="mx-auto max-w-4xl px-4 pb-20 pt-5 sm:px-6 sm:pt-8">
    <Link prefetch={false} href="/multiview" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"><ArrowLeft className="size-4" aria-hidden />Multiview</Link>
    <h1 className="mb-5 mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Multiview remote</h1>{children}
  </div></div>;
}

function RemoteLaunchDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="remote-launch-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }} className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]" data-lenis-prevent>
      <header className="flex items-center justify-between px-4 py-2"><h2 id="remote-launch-title" className="text-sm font-semibold">Connect another computer</h2><button type="button" onClick={onClose} aria-label="Close computer connection" className="grid size-11 cursor-pointer place-items-center rounded-xl text-[color:var(--ink-dim)] hover:bg-[color:var(--ui-hover)]"><X className="size-4" aria-hidden /></button></header>
      <LaunchMultiview linked />
    </section>
  </div>;
}

export function MultiviewRemote() {
  const { user, loading } = useAuth();
  if (loading) return <RemotePageShell><p className="text-sm text-[color:var(--ink-dim)]" role="status">Loading your account…</p></RemotePageShell>;
  if (user) return <AccountRemote key={user.id} accountId={user.id} />;
  return <RemotePageShell><section className={panel + " p-5 sm:p-8"}>
    <h2 className="text-xl font-semibold">Sign in to connect your phone</h2>
    <p className="mt-2 max-w-md text-sm leading-relaxed text-[color:var(--ink-dim)]">Use the same CORE account on your phone and computer.</p>
    <button type="button" onClick={() => openAuthModal({ next: MULTIVIEW_REMOTE_PATH })} className={primaryButton + " mt-5"}>Sign in</button>
  </section></RemotePageShell>;
}
