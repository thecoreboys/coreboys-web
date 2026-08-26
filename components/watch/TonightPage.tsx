"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Check, Clock3, Play, Radio, Zap } from "lucide-react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { MEMBERS } from "@/lib/members";
import type { WatchItem, WatchPlatform } from "@/lib/watch/types";
import type { NetworkChannel } from "@/lib/watch/channels";
import { itemDurationSeconds } from "@/lib/watch/channels";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import { makeReminderId, useWatchReminders } from "@/lib/watch/reminders-client";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { WatchThumb } from "./WatchThumb";

type GuideStatus = "upcoming" | "replay" | "published" | "live";

type GuideProgram = {
  id: string;
  slug: string;
  login: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: GuideStatus;
  platform: WatchPlatform;
  thumbnailUrl: string | null;
  sourceUrl: string;
  watchItem?: WatchItem;
};

type RotationSlot = {
  item: WatchItem;
  startsAt: number;
  endsAt: number;
};

function zonedParts(value: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { key: `${map.year}-${map.month}-${map.day}`, hour: Number(map.hour ?? 0) };
}

function addDateKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days, 12))
    .toISOString().slice(0, 10);
}

function zonedDateTime(key: string, hour: number, timeZone: string) {
  const [year, month, day] = key.split("-").map(Number);
  const target = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second),
    );
    guess += target - represented;
  }
  return guess;
}

function isTonight(program: GuideProgram, now: number, timeZone: string) {
  if (program.status === "live") return true;
  const current = zonedParts(now, timeZone);
  const baseKey = current.hour < 4 ? addDateKey(current.key, -1) : current.key;
  const nextKey = addDateKey(baseKey, 1);
  const event = zonedParts(Date.parse(program.startsAt), timeZone);
  return (event.key === baseKey && event.hour >= 15) || (event.key === nextKey && event.hour < 4);
}

function clock(isoOrMs: string | number, locale: string, timeZone: string) {
  return new Date(isoOrMs).toLocaleTimeString(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function zoneLabel(locale: string, timeZone: string, now: number) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(now).find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

function platformLabel(platform: WatchPlatform) {
  if (platform === "x") return "X";
  if (platform === "house") return "CORE";
  if (platform === "youtube") return "YouTube";
  if (platform === "tiktok") return "TikTok";
  return platform[0]?.toUpperCase() + platform.slice(1);
}

function accountLabel(item: WatchItem) {
  return watchAttributionLabel(item);
}

function buildRotation(items: WatchItem[], now: number, timeZone: string): RotationSlot[] {
  const rotationItems = items.filter((item) => item.kind !== "live");
  if (!rotationItems.length) return [];
  const current = zonedParts(now, timeZone);
  const tonightKey = current.hour < 4 ? addDateKey(current.key, -1) : current.key;
  let cursor = zonedDateTime(tonightKey, 15, timeZone);
  const slots: RotationSlot[] = [];
  let index = 0;
  while (slots.length < 10 && index < 400) {
    const item = rotationItems[index % rotationItems.length];
    if (!item) break;
    const duration = Math.min(90 * 60, Math.max(item.format === "short" ? 5 * 60 : 15 * 60, itemDurationSeconds(item)));
    const slot = { item, startsAt: cursor, endsAt: cursor + duration * 1000 };
    cursor = slot.endsAt;
    if (slot.endsAt > now) slots.push(slot);
    index += 1;
  }
  return slots;
}

export function TonightPage({
  coreChannel,
  lineup,
  serverNow,
}: {
  coreChannel: NetworkChannel;
  lineup: WatchItem[];
  serverNow: string;
}) {
  const player = usePlayer();
  const reminders = useWatchReminders();
  const viewer = useBrowserTimeZone();
  const initialNow = Date.parse(serverNow);
  const [now, setNow] = useState(Number.isFinite(initialNow) ? initialNow : 0);
  const [programs, setPrograms] = useState<GuideProgram[]>([]);
  const [guideReady, setGuideReady] = useState(false);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    const interval = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", updateWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", updateWhenVisible);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/watch/guide", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { programs?: GuideProgram[] }) => setPrograms(data.programs ?? []))
      .catch(() => undefined)
      .finally(() => setGuideReady(true));
    return () => controller.abort();
  }, []);

  const tonight = useMemo(
    () => (viewer.ready
      ? programs.filter((program) => isTonight(program, now, viewer.timeZone))
      : programs.filter((program) => program.status === "live"))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [now, programs, viewer.ready, viewer.timeZone],
  );
  const live = lineup.filter((item) => item.kind === "live" || item.format === "live");
  const rotation = useMemo(
    () => (viewer.ready ? buildRotation(lineup, now, viewer.timeZone) : []),
    [lineup, now, viewer.ready, viewer.timeZone],
  );
  const featured = live[0] ?? tonight.find((program) => program.watchItem)?.watchItem ?? rotation[0]?.item ?? null;
  const channelContext = {
    id: "core:tonight",
    title: "Tonight on CORE",
    subtitle: "Live rooms and the house rotation",
    href: "/tonight",
    artwork: coreChannel.artwork,
  };

  const tune = (item?: WatchItem) => {
    if (!lineup.length) return;
    player.playChannel(channelContext, lineup, item ?? featured ?? 0);
  };

  async function toggleReminder(program: GuideProgram) {
    if (!reminders.ready) return;
    const id = makeReminderId(program.id, program.startsAt);
    if (reminders.reminderIds.has(id)) {
      await reminders.removeReminder(id);
      return;
    }
    await reminders.saveReminder({
      id,
      itemRef: program.id,
      title: program.title,
      href: program.watchItem?.href ?? program.sourceUrl ?? "/tonight",
      startsAt: program.startsAt,
      memberSlug: program.slug || null,
      platform: program.platform,
      enabled: true,
    });
  }

  return (
    <div className="min-h-screen bg-[#070708] text-white" data-tonight-page>
      <header className="relative isolate flex min-h-[min(76dvh,50rem)] items-end overflow-hidden border-b border-white/8">
        {featured ? (
          <div className="absolute inset-0 -z-20" aria-hidden>
            <WatchThumb src={featured.backdrop || featured.poster} className="h-full w-full object-cover opacity-65" />
            <span className="absolute inset-0 bg-[linear-gradient(90deg,#070708_0%,rgba(7,7,8,.82)_42%,rgba(7,7,8,.12)_78%),linear-gradient(0deg,#070708_0%,transparent_60%)]" />
          </div>
        ) : null}
        <div className="w-full max-w-[100rem] px-5 pb-14 pt-28 md:px-10 md:pb-20">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[color:var(--core)]">
            Live programming · {viewer.ready ? zoneLabel(viewer.locale, viewer.timeZone, now) : "Your local time"}
          </p>
          <h1 className="mt-3 max-w-4xl text-5xl font-extrabold tracking-[-.065em] sm:text-7xl lg:text-8xl">Tonight on CORE</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60 sm:text-base">One screen for who is live, what starts next, and the continuous house playlist after that.</p>
          {featured ? <p className="mt-6 max-w-xl truncate text-sm font-semibold"><span className="mr-2 text-[color:var(--core)]">{live.length ? "LIVE NOW" : "FEATURED TONIGHT"}</span>{featured.title}</p> : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => tune()} disabled={!featured} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-black transition hover:-translate-y-px disabled:opacity-40">
              <Play className="size-4" fill="currentColor" aria-hidden /> Tune in
            </button>
            <Link href="/guide" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/7 px-5 text-sm font-semibold text-white hover:bg-white/12">
              <Clock3 className="size-4" aria-hidden /> Full guide
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[100rem] gap-14 px-5 py-12 md:px-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,.65fr)]">
        <div className="space-y-14">
          <section aria-labelledby="tonight-live-heading">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/40">Right now</p><h2 id="tonight-live-heading" className="mt-1 text-2xl font-bold tracking-tight">Live rooms</h2></div>
              <span className="inline-flex items-center gap-1.5 text-xs text-white/40"><Radio className="size-3.5 text-red-500" /> {live.length} live</span>
            </div>
            {live.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {live.map((item) => (
                  <button key={item.id} type="button" onClick={() => tune(item)} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111114] text-left transition hover:-translate-y-0.5 hover:border-white/25">
                    <span className="relative block aspect-video overflow-hidden bg-black">
                      <WatchThumb src={item.poster} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                      <i className="absolute left-3 top-3 rounded-md bg-red-600 px-2 py-1 text-[10px] font-extrabold not-italic uppercase tracking-wider">Live</i>
                    </span>
                    <span className="block p-4"><strong className="line-clamp-2 text-sm">{item.title}</strong><small className="mt-1 block text-xs text-white/40">{accountLabel(item)}</small></span>
                  </button>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-dashed border-white/12 p-8 text-sm text-white/40">The house is between live broadcasts. The continuous rotation is still on.</div>}
          </section>

          <section aria-labelledby="tonight-schedule-heading">
            <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/40">Scheduled by the platforms</p><h2 id="tonight-schedule-heading" className="mt-1 text-2xl font-bold tracking-tight">Tonight&apos;s starts</h2></div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e11]" data-tonight-schedule>
              {tonight.length ? tonight.map((program) => {
                const reminderId = makeReminderId(program.id, program.startsAt);
                const reminded = reminders.reminderIds.has(reminderId);
                return (
                  <article key={`${program.platform}:${program.id}`} className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/8 p-3 last:border-0 sm:grid-cols-[5rem_6.5rem_minmax(0,1fr)_auto]">
                    <time className="text-xs font-bold tabular-nums text-white/55">
                      {program.status === "live" ? "Now" : viewer.ready ? clock(program.startsAt, viewer.locale, viewer.timeZone) : "Local time"}
                    </time>
                    <span className="hidden aspect-video overflow-hidden rounded-lg bg-black sm:block">{program.thumbnailUrl ? <WatchThumb src={program.thumbnailUrl} className="h-full w-full object-cover" /> : null}</span>
                    <span className="min-w-0"><small className="text-[10px] uppercase tracking-wider text-white/35">{platformLabel(program.platform)} · {program.status}</small><strong className="mt-1 block truncate text-sm">{program.title}</strong></span>
                    {program.status === "upcoming" ? (
                      <Tooltip
                        title={reminded ? "Remove reminder" : "Set reminder"}
                        description={reminded
                          ? "Remove this program from your Watch reminders."
                          : "Save this program and get reminded near its start time."}
                        placement="left"
                        isDisabled={!reminders.ready}
                      >
                        <button type="button" disabled={!reminders.ready} onClick={() => void toggleReminder(program)} className={`grid size-10 place-items-center rounded-full border transition disabled:cursor-wait disabled:opacity-40 ${reminded ? "border-[color:var(--core)] bg-[color:var(--core)] text-white" : "border-white/15 text-white/55 hover:border-white/35 hover:text-white"}`} aria-label={reminded ? `Remove reminder for ${program.title}` : `Remind me about ${program.title}`}>
                          {reminded ? <Check className="size-4" /> : <Bell className="size-4" />}
                        </button>
                      </Tooltip>
                    ) : program.watchItem ? (
                      <Tooltip title="Play now" description={`Open ${program.title} in the media player.`} placement="left">
                        <button type="button" onClick={() => tune(program.watchItem)} className="grid size-10 place-items-center rounded-full border border-white/15 text-white/60 hover:text-white" aria-label={`Play ${program.title}`}><Play className="size-4" fill="currentColor" /></button>
                      </Tooltip>
                    ) : null}
                  </article>
                );
              }) : (
                <div className="p-8 text-sm text-white/40">{guideReady ? "No platform-scheduled starts are posted for tonight yet." : "Loading tonight’s schedule…"}</div>
              )}
            </div>
          </section>

          <section aria-labelledby="tonight-rotation-heading">
            <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/40">Continuous playlist · estimated times</p><h2 id="tonight-rotation-heading" className="mt-1 text-2xl font-bold tracking-tight">House rotation</h2></div>
            <ol className="space-y-1 rounded-2xl border border-white/10 bg-[#0e0e11] p-2" data-tonight-rotation>
              {rotation.map((slot, index) => (
                <li key={`${slot.item.platform}:${slot.item.id}`}>
                  <button type="button" onClick={() => tune(slot.item)} className="grid w-full grid-cols-[4.5rem_5.5rem_minmax(0,1fr)] items-center gap-3 rounded-xl p-2 text-left hover:bg-white/6">
                    <time className="text-[11px] tabular-nums text-white/40" title={index ? "Estimated rotation time" : undefined}>
                      {index === 0 ? "Start here" : viewer.ready ? `~${clock(slot.startsAt, viewer.locale, viewer.timeZone)}` : "Local time"}
                    </time>
                    <span className="aspect-video overflow-hidden rounded-md bg-black"><WatchThumb src={slot.item.poster} className="h-full w-full object-cover" /></span>
                    <span className="min-w-0"><strong className="block truncate text-xs">{slot.item.title}</strong><small className="mt-1 block truncate text-[10px] text-white/35">{accountLabel(slot.item)} · {platformLabel(slot.item.platform)}</small></span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-8 lg:sticky lg:top-28 lg:self-start">
          <section className="rounded-2xl border border-white/10 bg-[#111114] p-5" data-alert-preferences>
            <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color:var(--core)]/15 text-[color:var(--core)]"><Bell className="size-4" /></span><div><h2 className="text-sm font-semibold">Don&apos;t miss the live</h2><p className="mt-1 text-xs leading-relaxed text-white/42">In-app and optional browser alerts work while a CORE tab or app remains open. Background push is not enabled yet.</p></div></div>
            {reminders.browserState === "default" ? (
              <button type="button" disabled={!reminders.ready} onClick={() => void reminders.requestBrowserAlerts()} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/6 text-xs font-semibold hover:bg-white/10 disabled:cursor-wait disabled:opacity-40"><Bell className="size-3.5" /> Enable browser alerts</button>
            ) : (
              <p className="mt-4 rounded-xl bg-white/5 px-3 py-2 text-[10px] leading-relaxed text-white/40">
                {reminders.browserState === "granted" ? "Browser alerts enabled while CORE remains open. In-app alerts remain the fallback."
                  : reminders.browserState === "denied" ? "Browser alerts are blocked in browser settings. In-app alerts still work."
                    : reminders.browserState === "insecure" ? "Browser alerts require HTTPS. In-app alerts still work."
                      : "This browser does not expose notifications. In-app alerts still work."}
              </p>
            )}
            <div className="mt-5 space-y-1">
              {MEMBERS.map((member) => {
                const enabled = Boolean(reminders.creatorAlerts[member.slug]);
                return (
                  <button key={member.slug} type="button" disabled={!reminders.ready} onClick={() => void reminders.toggleCreatorAlert(member.slug)} aria-pressed={enabled} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-white/5 disabled:cursor-wait disabled:opacity-45">
                    {/* eslint-disable-next-line @next/next/no-img-element */}<img src={member.portrait} alt="" className="size-7 rounded-full object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{member.stageName}</span>
                    {enabled ? <Bell className="size-4 text-[color:var(--core)]" /> : <BellOff className="size-4 text-white/25" />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(219,3,104,.18),rgba(17,17,20,.96))] p-5">
            <Zap className="size-5 text-[color:var(--core)]" />
            <h2 className="mt-3 text-lg font-bold">CORE channels</h2>
            <p className="mt-2 text-xs leading-relaxed text-white/48">Prefer one community all night? Every network has its own looping live, video, replay, and Shorts channel.</p>
            <Link href="/channels/core" className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-white px-4 text-xs font-bold text-black">Open channels</Link>
          </section>
        </aside>
      </main>
    </div>
  );
}
