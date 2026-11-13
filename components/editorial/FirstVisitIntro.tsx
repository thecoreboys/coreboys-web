"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { playWithMutedFallback } from "@/lib/watch/native-media";
import { hasSeenIntro, rememberIntro, introCreditVisible, INTRO_SEEN_COOKIE, INTRO_SEEN_KEY, INTRO_START_DELAY_MS } from "@/lib/first-visit-intro";
import { prepareHomeForIntro, preloadIntroVideo } from "./intro-preload";
import styles from "./FirstVisitIntro.module.css";

const IntroContext = createContext(false);
export const useFirstVisitIntroActive = () => useContext(IntroContext);
let seenInThisPage = false;

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

/** One preloaded intro on the first Home visit; the page stays mounted behind it. */
export function FirstVisitIntro({ children }: { children: ReactNode }) {
  const player = usePlayer();
  const eligible = player.ready && !player.current;
  const [checking, setChecking] = useState(true);
  const checked = useRef(false);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"preparing" | "ready" | "playing" | "blocked" | "failed">("preparing");
  const [source, setSource] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const attempted = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    if (!eligible || checked.current) return;
    checked.current = true;
    setChecking(false);
    if (!seenInThisPage && !hasSeenIntro(storage(), document.cookie)) setOpen(true);
  }, [eligible]);

  const finish = useCallback(() => {
    saveSeen();
    video.current?.pause();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open && !eligible) finish();
  }, [eligible, finish, open]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const media = video.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (element && !element.open) element.showModal();
    const onStorage = (event: StorageEvent) => { if (event.key === INTRO_SEEN_KEY && event.newValue === "1") { media?.pause(); setOpen(false); } };
    window.addEventListener("storage", onStorage);
    return () => {
      media?.pause();
      element?.close();
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("storage", onStorage);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let disposed = false;
    let blobUrl: string | null = null;
    let delay: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => controller.abort(), 45_000);
    const began = performance.now();
    attempted.current = false;
    setStage("preparing");
    setSource(null);
    void Promise.all([preloadIntroVideo(controller.signal), prepareHomeForIntro(controller.signal)])
      .then(async ([blob]) => {
        if (disposed || controller.signal.aborted) return;
        await new Promise<void>((resolve) => { delay = setTimeout(resolve, Math.max(0, INTRO_START_DELAY_MS - (performance.now() - began))); });
        if (disposed || controller.signal.aborted) return;
        blobUrl = URL.createObjectURL(blob);
        setSource(blobUrl);
        setStage("ready");
      }).catch(() => { if (!disposed) setStage("failed"); })
      .finally(() => clearTimeout(deadline));
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(deadline);
      clearTimeout(delay);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [open, retry]);

  const start = useCallback(() => {
    const media = video.current;
    if (!media || !source) return;
    void playWithMutedFallback(media, () => Boolean(dialog.current?.open))
      .then(() => { if (dialog.current?.open) setMuted(media.muted); })
      .catch((error: unknown) => {
        if (!dialog.current?.open) return;
        setStage(error instanceof Error && error.name === "NotAllowedError" ? "blocked" : "failed");
      });
  }, [source]);

  const active = eligible && (checking || open);
  const credit = introCreditVisible(position, duration);
  return <IntroContext.Provider value={active}>
    {children}
    {open ? <dialog ref={dialog} className={styles.dialog} aria-labelledby="core-welcome-title" onCancel={(event) => { event.preventDefault(); finish(); }} data-intro-stage={stage} data-lenis-prevent>
      <div className={styles.television}>
        <header className={styles.header}>
          <span className={styles.station}>CORE · 01</span>
          <h2 id="core-welcome-title">Welcome to CORE</h2>
          <button type="button" className={styles.skip} onClick={finish} aria-label="Skip intro">Skip <X size={16} aria-hidden="true" /></button>
        </header>
        <div className={styles.screen}>
          <video ref={video} src={source ?? undefined} playsInline preload="auto" muted={muted} className={source ? styles.video : `${styles.video} ${styles.videoHidden}`} aria-label="CORE welcome intro"
            onCanPlay={() => { if (!attempted.current) { attempted.current = true; start(); } }}
            onPlaying={() => { if (!started.current) { started.current = true; saveSeen(); } setStage("playing"); setPaused(false); }}
            onPause={() => setPaused(true)} onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)} onEnded={finish} onError={() => { if (source) setStage("failed"); }} />
          {stage !== "playing" ? <div className={styles.waiting}>
            <CoreWordmark className={styles.wordmark} />
            {stage === "preparing" || stage === "ready" ? <><p role="status">Getting ready…</p><div className={styles.loading} aria-hidden="true"><span /></div></>
              : stage === "blocked" ? <button type="button" className={styles.play} onClick={start}><Play size={20} fill="currentColor" aria-hidden="true" /> Play intro</button>
              : <><p role="status">The intro couldn&apos;t load.</p><button type="button" className={styles.play} onClick={() => setRetry((value) => value + 1)}>Try again</button></>}
          </div> : null}
          <div className={styles.scanlines} aria-hidden="true" />
          {stage === "playing" && credit ? <p className={styles.credit}>Intro by <strong>@underscoreemmaa</strong></p> : null}
        </div>
        <footer className={styles.controls}>
          <span className={styles.time}>{clock(position)} / {clock(duration)}</span>
          {stage === "playing" ? <div className={styles.buttons}>
            <button type="button" onClick={() => { const media = video.current; if (!media) return; if (media.paused) start(); else media.pause(); }} aria-label={paused ? "Resume intro" : "Pause intro"}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>
            <button type="button" className={styles.sound} onClick={() => { const media = video.current; if (media) media.muted = !media.muted; }} aria-label={muted ? "Turn intro sound on" : "Mute intro"}>{muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}<span>{muted ? "Turn sound on" : "Sound on"}</span></button>
          </div> : <span className={styles.welcome}>CREATE. OWN. RUN. EVERYTHING.</span>}
        </footer>
      </div>
    </dialog> : null}
  </IntroContext.Provider>;
}
