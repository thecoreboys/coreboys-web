"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { preloadWatchGuide, useWatchGuide } from "@/hooks/useWatchGuide";
import type { Playable } from "@/lib/watch/playable";
import type { PlayerGuideSession } from "./GuideGrid";

const SharedGuide = dynamic(() => import("./GuideGrid").then(module => module.GuideGrid), {
  loading: () => <p className="player-guide-loading" role="status">Loading the guide…</p>,
});

/** The window the player Guide opens on: aligned to the hour so warming it
 * ahead of time and opening it share one cached request. */
function playerGuideWindow() {
  const now = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  return { start: now - 26 * 3_600_000, end: now + 18 * 3_600_000 };
}

/** Fetch the player Guide's data and code when a viewer shows intent to open it. */
export function prefetchPlayerGuide() {
  void import("./GuideGrid");
  void preloadWatchGuide(playerGuideWindow());
}

/** The same Guide experience as /guide, covering the player until Back or a tune action. */
export function TheaterNetworkGuide({ session, onReturn, onTune }: {
  session: PlayerGuideSession;
  onReturn: () => void;
  onTune: (item: Playable) => void;
}) {
  const [guideWindow] = useState(() => session.filters?.window ?? playerGuideWindow());
  const { data, error, isValidating, mutate } = useWatchGuide({ window: guideWindow });
  const scroller = useRef<HTMLDivElement>(null);
  const live = useMemo(() => (data?.programs ?? []).flatMap(program => program.status === "live" && program.watchItem ? [program.watchItem] : []), [data]);

  function rememberPosition() {
    const page = scroller.current;
    if (!page?.querySelector(".guide-v2")) return;
    session.pageScrollTop = page.scrollTop;
    const timeline = page.querySelector(".guide-epg-scroll");
    if (timeline) session.timelineScroll = { left: timeline.scrollLeft, top: timeline.scrollTop };
  }

  function returnToPlayer() {
    rememberPosition();
    onReturn();
  }

  function tuneProgram(item: Playable) {
    rememberPosition();
    onTune(item);
    onReturn();
  }

  return <Dialog.Root open onOpenChange={open => { if (!open) returnToPlayer(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="player-guide-page-overlay" />
      <Dialog.Content className="player-guide-page" onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); returnToPlayer(); }} onCloseAutoFocus={event => {
        event.preventDefault(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.watch-player-guide-home button')?.focus());
      }}>
        <header className="player-guide-page-header"><button type="button" onClick={returnToPlayer}><ArrowLeft size={18} aria-hidden />Back to media player</button><Dialog.Title>Program guide</Dialog.Title><Dialog.Description className="sr-only">Browse channels and programs. Go back to return to your media player.</Dialog.Description></header>
        <div ref={scroller} className="player-guide-page-scroll" data-lenis-prevent>
          {data ? <SharedGuide serverNow={data.serverNow} initialLive={live} networks={data.networks ?? []} initialGuide={data} session={session} onTune={tuneProgram} /> : <div className="player-guide-loading" role="status" aria-busy={isValidating}>{error ? <><p>The guide couldn’t connect. Your player is ready when you go back.</p><button type="button" disabled={isValidating} onClick={() => void mutate()}>{isValidating ? "Connecting…" : "Try again"}</button></> : <><strong>Finding your next watch</strong><p>Getting channels and upcoming programs…</p><div className="guide-card-skeletons" aria-hidden="true"><i /><i /><i /></div></>}</div>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
