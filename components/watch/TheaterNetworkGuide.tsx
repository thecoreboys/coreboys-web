"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";
import { useWatchGuide } from "@/hooks/useWatchGuide";
import type { Playable } from "@/lib/watch/playable";
import type { PlayerGuideSession } from "./GuideGrid";

const SharedGuide = dynamic(() => import("./GuideGrid").then(module => module.GuideGrid), {
  loading: () => <p className="player-guide-loading" role="status">Loading the guide…</p>,
});

/** The same Guide experience as /guide, covering the player until Back or a tune action. */
export function TheaterNetworkGuide({ session, onReturn, onTune }: {
  session: PlayerGuideSession;
  onReturn: () => void;
  onTune: (item: Playable) => void;
}) {
  const { data, error, mutate } = useWatchGuide();
  const scroller = useRef<HTMLDivElement>(null);
  const live = useMemo(() => (data?.programs ?? []).flatMap(program => program.status === "live" && program.watchItem ? [program.watchItem] : []), [data]);

  function rememberPosition() {
    const page = scroller.current;
    if (!page?.querySelector(".guide-v2")) return;
    session.pageScrollTop = page.scrollTop;
    const timeline = page.querySelector(".guide-timeline-scroll");
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
          {data ? <SharedGuide serverNow={data.serverNow} initialLive={live} networks={data.networks ?? []} initialGuide={data} session={session} onTune={tuneProgram} /> : <div className="player-guide-loading" role="status">{error ? <><p>The guide couldn’t load.</p><button type="button" onClick={() => void mutate()}>Try again</button></> : 'Loading the guide…'}</div>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
