"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { MEMBERS_BY_SLUG, type Member } from "@/lib/members";
import { prefersMinimalMotion } from "@/lib/motion";
import { playWithMutedFallback } from "@/lib/watch/native-media";
import {
  activeIntroCue, hasSeenIntro, introCastRevealed, introCreditVisible, introCueState, introFraction, introPreloadPercent, rememberIntro,
  INTRO_CREDITS, INTRO_CREDITS_MS, INTRO_NAME_CUES, INTRO_PORTRAIT_GRACE_MS, INTRO_SEEN_COOKIE, INTRO_SEEN_KEY, INTRO_START_DELAY_MS, INTRO_VIDEO_BYTES,
  type IntroNameCue,
} from "@/lib/first-visit-intro";
import { prepareHomeForIntro, preloadIntroVideo, type HomePrepProgress } from "./intro-preload";
import styles from "./FirstVisitIntro.module.css";

const IntroContext = createContext(false);
export const useFirstVisitIntroActive = () => useContext(IntroContext);
let seenInThisPage = false;

type Phase = "boot" | "gate" | "playing" | "credits" | "leaving" | "failed";
type CastEntry = { cue: IntroNameCue; member: Member };
const CAST: readonly CastEntry[] = INTRO_NAME_CUES.flatMap((cue) => {
  const member = MEMBERS_BY_SLUG[cue.slug];
  return member ? [{ cue, member }] : [];
});
const PORTRAIT_SIZES = "(max-width: 640px) 36vw, 180px";
const BAR_CELLS = 24;
const LEAVE_MS = 1_250;
const LEAVE_MINIMAL_MS = 280;

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

function saveSeen() {
  seenInThisPage = true;
  rememberIntro(storage());
  try { document.cookie = `${INTRO_SEEN_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* Storage can be disabled. */ }
}

function clock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

function megabytes(bytes: number) {
  return (bytes / 1_048_576).toFixed(1);
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

type LineState = "run" | "ok" | "skip" | "fail";
const MARK: Record<LineState, string> = { run: " .. ", ok: " OK ", skip: "SKIP", fail: "FAIL" };

/**
 * The first Home visit opens on a boot terminal that reports the real preload
 * (intro video bytes, Home shelves, artwork, cast portraits). A deliberate
 * "begin" press is the gesture that lets the intro play with sound. Name cards
 * rise beside the video as each friend is named, credits follow, and the
 * console splits open onto Home, which stays mounted behind it throughout.
 */
export function FirstVisitIntro({ children }: { children: ReactNode }) {
  const player = usePlayer();
  const eligible = player.ready && !player.current;
  const [checking, setChecking] = useState(true);
  const checked = useRef(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("boot");
  const phaseRef = useRef<Phase>("boot");
  const [retry, setRetry] = useState(0);
  const [source, setSource] = useState<string | null>(null);
  const [bytes, setBytes] = useState({ done: 0, total: INTRO_VIDEO_BYTES });
  const [decoded, setDecoded] = useState<string | null>(null);
  const [home, setHome] = useState<HomePrepProgress | null>(null);
  const [homeReady, setHomeReady] = useState(false);
  const [portraits, setPortraits] = useState(0);
  const [portraitGrace, setPortraitGrace] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [armed, setArmed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  /** True once the video has been started; decides what the exit powers down. */
  const [shown, setShown] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [minimal, setMinimal] = useState(false);
  const [viewport, setViewport] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const started = useRef(false);

  const go = useCallback((next: Phase) => { phaseRef.current = next; setPhase(next); }, []);

  useEffect(() => {
    if (!eligible || checked.current) return;
    checked.current = true;
    setChecking(false);
    let forced = false;
    try { forced = new URLSearchParams(location.search).get("intro") === "1"; } catch { /* No URL access. */ }
    if (forced || (!seenInThisPage && !hasSeenIntro(storage(), document.cookie))) setOpen(true);
  }, [eligible]);

  /** Leave through the closing transition; skipping also counts as seen. */
  const leave = useCallback(() => {
    if (phaseRef.current === "leaving") return;
    saveSeen();
    video.current?.pause();
    go("leaving");
  }, [go]);

  useEffect(() => {
    if (open && !eligible) { saveSeen(); video.current?.pause(); setOpen(false); }
  }, [eligible, open]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const media = video.current;
    const root = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    document.body.style.overflow = "hidden";
    root.style.overflow = "hidden";
    if (element && !element.open) element.showModal();
    // showModal() focuses the first control (Skip). Start on the begin
    // control instead so the prompted Enter press never skips the intro.
    element?.querySelector<HTMLElement>("[data-intro-focus]")?.focus();
    setMinimal(prefersMinimalMotion());
    const width = Math.max(window.innerWidth, root.clientWidth);
    const height = Math.max(window.innerHeight, root.clientHeight);
    setViewport(width && height ? `${width}×${height}` : "");
    const onStorage = (event: StorageEvent) => { if (event.key === INTRO_SEEN_KEY && event.newValue === "1") { media?.pause(); setOpen(false); } };
    window.addEventListener("storage", onStorage);
    return () => {
      media?.pause();
      element?.close();
      document.body.style.overflow = previousOverflow;
      root.style.overflow = previousRootOverflow;
      window.removeEventListener("storage", onStorage);
    };
  }, [open]);

  // Real preload: the full video file plus Home's deferred shelves and artwork.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let disposed = false;
    let blobUrl: string | null = null;
    const deadline = setTimeout(() => controller.abort(), 45_000);
    const minimum = setTimeout(() => setMinElapsed(true), INTRO_START_DELAY_MS);
    const grace = setTimeout(() => setPortraitGrace(true), INTRO_PORTRAIT_GRACE_MS);
    // The video decodes as soon as its bytes land, while Home keeps preparing.
    void preloadIntroVideo(controller.signal, (done, total) => { if (!disposed) setBytes({ done, total }); })
      .then((blob) => {
        if (disposed || controller.signal.aborted) return;
        blobUrl = URL.createObjectURL(blob);
        setSource(blobUrl);
      }).catch(() => { if (!disposed) go("failed"); })
      .finally(() => clearTimeout(deadline));
    void prepareHomeForIntro(controller.signal, (progress) => { if (!disposed) setHome(progress); })
      .then(() => { if (!disposed) setHomeReady(true); });
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(deadline);
      clearTimeout(minimum);
      clearTimeout(grace);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [go, open, retry]);

  const portraitsDone = portraits >= CAST.length || portraitGrace;
  const ready = phase === "boot" && Boolean(source) && Boolean(decoded) && homeReady && minElapsed && portraitsDone;

  /** Must run inside the click or key handler so browsers allow sound. */
  const begin = useCallback((withSound: boolean) => {
    const media = video.current;
    if (!media || !source) return;
    media.muted = !withSound;
    setSoundBlocked(false);
    setEnded(false);
    setShown(true);
    if (media.ended || phaseRef.current === "credits") { media.currentTime = 0; setPosition(0); }
    go("playing");
    void playWithMutedFallback(media, () => Boolean(dialog.current?.open))
      .then(() => { if (withSound && media.muted) setSoundBlocked(true); })
      .catch((error: unknown) => {
        if (!dialog.current?.open) return;
        go(error instanceof Error && error.name === "NotAllowedError" ? "gate" : "failed");
      });
  }, [go, source]);

  useEffect(() => {
    if (!ready) return;
    go("gate");
    // A press during boot already counts as the visitor's go-ahead. The
    // browser decides whether that earlier press still allows sound; if not,
    // playback starts muted and the sound prompt stays on screen.
    if (armed) begin(true);
  }, [armed, begin, go, ready]);

  // The begin button unmounts on play; keep focus (and the K/M/Esc keys) in the dialog.
  useEffect(() => {
    if (phase !== "playing") return;
    const element = dialog.current;
    if (element && !element.contains(document.activeElement)) element.querySelector<HTMLElement>("[data-intro-playback]")?.focus();
  }, [phase]);

  // Frame-accurate position for name cues while the video plays.
  useEffect(() => {
    if (phase !== "playing") return;
    let frame = 0;
    const loop = () => {
      const media = video.current;
      if (media) {
        const next = Math.floor(media.currentTime * 10) / 10;
        setPosition((previous) => (previous === next ? previous : next));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== "credits") return;
    const timer = setTimeout(leave, INTRO_CREDITS_MS);
    return () => clearTimeout(timer);
  }, [leave, phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setOpen(false), minimal ? LEAVE_MINIMAL_MS : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [minimal, phase]);

  // Count finished portrait requests directly. next/image's onLoad waits on
  // decode(), which can stall for hidden images in a background tab.
  useEffect(() => {
    if (!open || phase !== "boot") return;
    const count = () => {
      let done = 0;
      dialog.current?.querySelectorAll<HTMLImageElement>("[data-intro-portrait] img").forEach((image) => { if (image.complete && image.currentSrc) done += 1; });
      setPortraits(done);
    };
    const timer = setInterval(count, 200);
    return () => clearInterval(timer);
  }, [open, phase]);

  const toggleSound = useCallback(() => {
    const media = video.current;
    if (!media) return;
    media.muted = !media.muted;
    if (!media.muted) setSoundBlocked(false);
  }, []);

  const togglePause = useCallback(() => {
    const media = video.current;
    if (!media) return;
    if (media.paused) void media.play().catch(() => undefined);
    else media.pause();
  }, []);

  const restart = useCallback(() => {
    const media = video.current;
    if (!media) return;
    media.currentTime = 0;
    setPosition(0);
    if (media.paused) void media.play().catch(() => undefined);
  }, []);

  const tryAgain = useCallback(() => {
    setSource(null);
    setDecoded(null);
    setHome(null);
    setHomeReady(false);
    setMinElapsed(false);
    setPortraitGrace(false);
    setBytes({ done: 0, total: INTRO_VIDEO_BYTES });
    go("boot");
    setRetry((value) => value + 1);
  }, [go]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const onButton = event.target instanceof HTMLButtonElement;
    const key = event.key.toLowerCase();
    if (phase === "boot" && !onButton && (key === "enter" || key === " ")) { event.preventDefault(); setArmed(true); }
    else if (phase === "gate" && !onButton && key === "enter") { event.preventDefault(); begin(true); }
    else if (phase === "playing") {
      if (key === "m") { event.preventDefault(); toggleSound(); }
      else if (key === "k" || (key === " " && !onButton)) { event.preventDefault(); togglePause(); }
    }
  };

  const active = eligible && (checking || open);
  const cue = phase === "playing" ? activeIntroCue(position) : null;
  const revealed = ended ? CAST.length : introCastRevealed(position);
  const credit = phase === "playing" && introCreditVisible(position, duration);
  const percent = introPreloadPercent({
    video: introFraction(bytes.done, bytes.total),
    decode: decoded ? 1 : 0,
    shelves: homeReady ? 1 : home ? introFraction(home.shelves.done, home.shelves.total) : 0,
    artwork: homeReady ? 1 : home ? introFraction(home.artwork.done, home.artwork.total) : 0,
    portraits: portraitsDone ? 1 : introFraction(portraits, CAST.length),
  });
  const shownPercent = phase === "boot" && !ready ? Math.min(percent, 99) : 100;
  const filled = Math.round((shownPercent / 100) * BAR_CELLS);
  const failed = phase === "failed";
  const shelvesDone = homeReady || (home !== null && home.shelves.done >= home.shelves.total);
  const lines: { key: string; label: string; detail: string; state: LineState }[] = [
    { key: "display", label: "display", detail: viewport || "probing", state: viewport ? "ok" : "run" },
    { key: "reel", label: "intro reel", detail: `${megabytes(bytes.done)} / ${megabytes(bytes.total)} MB`, state: source ? "ok" : failed ? "fail" : "run" },
    { key: "decode", label: "decode check", detail: decoded ?? (source ? "verifying" : "waiting"), state: decoded ? "ok" : failed ? "fail" : "run" },
    { key: "shelves", label: "home shelves", detail: home ? `${home.shelves.done} / ${home.shelves.total} staged` : "locating", state: shelvesDone ? "ok" : "run" },
    { key: "artwork", label: "artwork", detail: home ? `${home.artwork.done} / ${home.artwork.total} warmed${homeReady && home.artwork.done < home.artwork.total ? " · rest streams in" : ""}` : "queued", state: homeReady ? "ok" : "run" },
    { key: "cast", label: "cast portraits", detail: `${portraits} / ${CAST.length}`, state: portraits >= CAST.length ? "ok" : portraitGrace ? "skip" : "run" },
  ];
  const showStage = shown && (phase === "playing" || phase === "credits" || phase === "leaving");
  const showTerminal = phase === "boot" || phase === "gate" || phase === "failed" || (phase === "leaving" && !shown);

  return <IntroContext.Provider value={active}>
    {children}
    {open ? <dialog ref={dialog} className={styles.dialog} aria-labelledby="core-welcome-title" data-phase={phase} data-motion={minimal ? "minimal" : "full"} data-lenis-prevent
      onCancel={(event) => { event.preventDefault(); leave(); }} onClose={() => { saveSeen(); setOpen(false); }} onKeyDown={onKeyDown}>
      <div className={styles.shutterTop} aria-hidden="true" />
      <div className={styles.shutterBottom} aria-hidden="true" />
      <div className={styles.seam} aria-hidden="true" />
      <div className={styles.shell}>
        <header className={styles.bar}>
          <CoreWordmark className={styles.mark} />
          <h2 id="core-welcome-title" className={styles.title}><span>Welcome to CORE</span><span aria-hidden="true">·</span><span>The friends intro</span></h2>
          <p className={styles.tally} aria-label={`${revealed} of ${CAST.length} friends named`}>
            <span aria-hidden="true">Cast {pad(revealed)}/{pad(CAST.length)}</span>
            <span className={styles.tallyBars} aria-hidden="true">{CAST.map(({ member }, index) => <i key={member.slug} data-on={index < revealed} style={{ "--accent": member.accent } as CSSProperties} />)}</span>
          </p>
          {phase !== "credits" ? <button type="button" className={styles.skip} onClick={leave}>Skip intro <X size={14} aria-hidden="true" /></button> : null}
        </header>

        <div className={styles.stage}>
          {showTerminal ? <section className={styles.terminal} aria-label="Preparing the intro" onPointerDown={(event) => { if (phase === "boot" && !(event.target as Element).closest("button")) setArmed(true); }}>
            <p className={styles.boot} data-line="0">CORE/OS · signal 01 · friends intro</p>
            <ol className={styles.lines}>
              {lines.map((line, index) => <li key={line.key} className={styles.line} data-state={line.state} style={{ "--i": index + 1 } as CSSProperties}>
                <span className={styles.lineMark}>[{MARK[line.state]}]</span>
                <span className={styles.lineLabel}>{line.label}</span>
                <span className={styles.lineDots} aria-hidden="true" />
                <span className={styles.lineDetail}>{line.detail}</span>
              </li>)}
            </ol>
            <div className={styles.readout} role="status" aria-live="polite">
              <p className={styles.headline}>{failed ? "The intro couldn't load" : "Preparing your CORE experience"}<span className={styles.cursor} aria-hidden="true" /></p>
              <p className={styles.meter} aria-hidden="true"><span>[</span><span className={styles.meterOn}>{"█".repeat(filled)}</span><span className={styles.meterOff}>{"░".repeat(BAR_CELLS - filled)}</span><span>]</span> <span className={styles.percent}>{pad(shownPercent)}%</span></p>
              <span className={styles.srOnly}>{failed ? "Intro unavailable." : phase === "gate" ? "Ready." : `${shownPercent} percent`}</span>
            </div>
            <div className={styles.prompt}>
              {failed ? <>
                <button type="button" className={styles.begin} onClick={tryAgain} autoFocus>Try again</button>
                <button type="button" className={styles.quiet} onClick={leave}>Go to Home</button>
              </> : phase === "gate" ? <>
                <p className={styles.ready}>System ready · {CAST.length} friends on set</p>
                <button type="button" className={styles.begin} onClick={() => begin(true)} autoFocus>
                  <Play size={15} fill="currentColor" aria-hidden="true" />
                  <span className={styles.fine}>Press Enter to begin</span><span className={styles.coarse}>Tap to begin</span>
                  <span className={styles.beginSound}><Volume2 size={14} aria-hidden="true" /> Sound on</span>
                </button>
                <button type="button" className={styles.quiet} onClick={() => begin(false)}>Watch without sound</button>
              </> : <button type="button" className={styles.queue} onClick={() => setArmed(true)} aria-pressed={armed} data-intro-focus>
                {armed ? "Queued · starts with sound when ready" : <><span className={styles.fine}>Press Enter to start as soon as it&apos;s ready</span><span className={styles.coarse}>Tap to start as soon as it&apos;s ready</span></>}
              </button>}
            </div>
          </section> : null}

          <div className={styles.screenWrap} data-visible={showStage}>
            <div className={styles.frame}>
              <video ref={video} src={source ?? undefined} playsInline preload="auto" className={styles.video} aria-label="CORE friends intro"
                onCanPlayThrough={(event) => { const media = event.currentTarget; setDecoded(`${media.videoWidth}×${media.videoHeight} · ${clock(media.duration)}`); }}
                onPlaying={() => { if (!started.current) { started.current = true; saveSeen(); } setPaused(false); }}
                onPause={() => setPaused(true)} onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                onTimeUpdate={(event) => { const next = Math.floor(event.currentTarget.currentTime * 10) / 10; setPosition((previous) => (previous === next ? previous : next)); }}
                onEnded={() => { setPosition(duration); setEnded(true); go("credits"); }}
                onError={() => { if (source) go("failed"); }} />
              <span className={styles.scan} aria-hidden="true" />
              <span className={styles.corners} aria-hidden="true"><i /><i /><i /><i /></span>
              {phase === "playing" && soundBlocked ? <button type="button" className={styles.soundPrompt} onClick={toggleSound}>
                <VolumeX size={16} aria-hidden="true" /> Your browser started this muted. <strong>Turn sound on</strong>
              </button> : null}

              <ol className={styles.cast} aria-hidden="true">
                {CAST.map(({ cue: entry, member }, index) => <li key={member.slug} className={styles.card} data-place={entry.placement}
                  data-state={phase === "playing" ? introCueState(entry, position) : "waiting"} style={{ "--accent": member.accent } as CSSProperties}>
                  <span className={styles.lead} />
                  <span className={styles.cardBody}>
                    <span className={styles.portrait} data-intro-portrait>
                      <Image src={member.portrait} alt="" fill sizes={PORTRAIT_SIZES} loading="eager" draggable={false} />
                    </span>
                    <span className={styles.cardText}>
                      <span className={styles.cardMeta}><b>No. {pad(index + 1)}</b><span>{member.comm.name}</span></span>
                      <span className={styles.cardName}>{member.stageName}</span>
                    </span>
                  </span>
                </li>)}
              </ol>
            </div>
            <p className={styles.editCredit} data-on={credit} aria-hidden={!credit}>Intro edit <strong>@underscoreemmaa</strong></p>
          </div>
          {ended && (phase === "credits" || phase === "leaving") ? <section className={styles.credits} aria-labelledby="core-intro-credits">
            <p className={styles.creditsEyebrow} style={{ "--i": 0 } as CSSProperties}>CORE TV presents</p>
            <h3 id="core-intro-credits" className={styles.creditsTitle} style={{ "--i": 1 } as CSSProperties}>The Friends Intro</h3>
            <p className={styles.creditsRole} style={{ "--i": 2 } as CSSProperties}>Starring</p>
            <ul className={styles.starring}>
              {CAST.map(({ member }, index) => <li key={member.slug} style={{ "--i": 3 + index * 0.5, "--accent": member.accent } as CSSProperties}>
                <span className={styles.starPortrait}><Image src={member.portrait} alt="" fill sizes={PORTRAIT_SIZES} draggable={false} /></span>
                <span>{member.stageName}</span>
              </li>)}
            </ul>
            <dl className={styles.roles}>
              {INTRO_CREDITS.map((line, index) => <div key={line.role} style={{ "--i": 6.5 + index * 0.6 } as CSSProperties}><dt>{line.role}</dt><dd>{line.name}</dd></div>)}
            </dl>
            <p className={styles.disclaimer} style={{ "--i": 8 } as CSSProperties}>CORE TV is an independent fan site, not affiliated with CORE.</p>
            <div className={styles.creditActions} style={{ "--i": 8.5 } as CSSProperties}>
              <button type="button" className={styles.quiet} onClick={() => begin(!muted)}><RotateCcw size={14} aria-hidden="true" /> Replay</button>
              <button type="button" className={styles.enter} onClick={leave} autoFocus style={{ "--credits-ms": `${INTRO_CREDITS_MS}ms` } as CSSProperties}>
                Enter CORE <span className={styles.enterTimer} aria-hidden="true" />
              </button>
            </div>
          </section> : null}
          <p className={styles.srOnly} aria-live="polite">{cue ? MEMBERS_BY_SLUG[cue.slug]?.stageName : ""}</p>
        </div>

        <footer className={styles.controls}>
          {phase === "playing" ? <>
            <span className={styles.time}>{clock(position)} <span aria-hidden="true">/</span> {clock(duration)}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.trackFill} style={{ transform: `scaleX(${duration ? Math.min(1, position / duration) : 0})` }} />
              {duration ? CAST.map(({ cue: entry, member }) => <i key={member.slug} style={{ left: `${(entry.at / duration) * 100}%`, "--accent": member.accent } as CSSProperties} data-on={position >= entry.at} />) : null}
            </span>
            <span className={styles.buttons}>
              <button type="button" onClick={togglePause} data-intro-playback aria-label={paused ? "Resume intro" : "Pause intro"}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>
              <button type="button" onClick={restart} aria-label="Restart intro"><RotateCcw size={16} aria-hidden="true" /></button>
              <button type="button" className={styles.sound} data-muted={muted} onClick={toggleSound} aria-label={muted ? "Turn intro sound on" : "Mute intro"}>
                {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}<span>{muted ? "Muted" : "Sound on"}</span>
              </button>
            </span>
            <span className={styles.keys} aria-hidden="true"><kbd>K</kbd> pause <kbd>M</kbd> sound <kbd>Esc</kbd> skip</span>
          </> : <span className={styles.motto}>Create. Own. Run. Everything.</span>}
        </footer>
      </div>
    </dialog> : null}
  </IntroContext.Provider>;
}
