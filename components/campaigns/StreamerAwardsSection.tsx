"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Maximize2, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import SiteImage from "@/components/ui/SiteImage";
import {
  STREAMER_AWARDS_ENDS_AT,
  STREAMER_AWARDS_ENDS_AT_MS,
  STREAMER_AWARDS_NOMINEES,
  streamerAwardsCountdown,
  streamerAwardsImage,
} from "@/lib/streamer-awards";
import styles from "./StreamerAwardsSection.module.css";

const nominees = STREAMER_AWARDS_NOMINEES;
const pad = (value: number) => String(value).padStart(2, "0");

export function StreamerAwardsSection({ initialNow }: { initialNow: number }) {
  // The server timestamp makes the initial countdown identical during hydration.
  const [now, setNow] = useState(initialNow);
  const [selected, setSelected] = useState<number | null>(null);
  const [edges, setEdges] = useState({ previous: false, next: true });
  const railRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const countdown = streamerAwardsCountdown(now);
  const active = selected === null ? null : nominees[selected] ?? null;
  const visible = countdown !== null;

  useEffect(() => {
    const sync = () => setNow(Date.now());
    sync();
    if (Date.now() >= STREAMER_AWARDS_ENDS_AT_MS) return;
    const interval = window.setInterval(sync, 1000);
    // Expire at the boundary as well as on the next clock tick. Visibility and
    // page-show events correct browsers that throttle timers in background tabs.
    const expiry = window.setTimeout(sync, Math.min(STREAMER_AWARDS_ENDS_AT_MS - Date.now(), 2_147_483_647));
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(expiry);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [visible]);

  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setEdges({ previous: rail.scrollLeft > 2, next: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !visible) return;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [updateEdges, visible]);

  const scroll = (direction: number) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * .8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const changePoster = (direction: number) => setSelected((index) => index === null ? null : (index + direction + nominees.length) % nominees.length);

  if (!countdown) return null;

  return (
    <section id="streamer-awards" className={styles.section} aria-labelledby="streamer-awards-heading" data-streamer-awards>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.intro}>
            <p className={styles.eyebrow}><Trophy size={15} aria-hidden /> The Streamer Awards <span>2026</span></p>
            <h2 id="streamer-awards-heading">The countdown begins.</h2>
            <p className={styles.subtitle}>CORE members nominated this year!</p>
          </div>
          <div className={styles.countdown}>
            <div className={styles.clock} role="timer" aria-live="off" aria-label={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds remaining`}>
              {([
                ["Days", countdown.days], ["Hours", countdown.hours], ["Minutes", countdown.minutes], ["Seconds", countdown.seconds],
              ] as const).map(([label, value]) => (
                <div key={label} className={styles.unit} aria-hidden="true"><span>{pad(value)}</span><small>{label}</small></div>
              ))}
            </div>
            <time dateTime={STREAMER_AWARDS_ENDS_AT} className={styles.deadline}>Nov 12 · 5 PM PT / 8 PM ET</time>
          </div>
        </header>

        <div className={styles.railHeading}>
          <span><i aria-hidden /> 9 nominations. One CORE.</span>
          <div className={styles.arrows}>
            <button type="button" onClick={() => scroll(-1)} disabled={!edges.previous} aria-label="Previous nominees" aria-controls="streamer-awards-nominees"><ArrowLeft size={17} aria-hidden /></button>
            <button type="button" onClick={() => scroll(1)} disabled={!edges.next} aria-label="Next nominees" aria-controls="streamer-awards-nominees"><ArrowRight size={17} aria-hidden /></button>
          </div>
        </div>
        <div id="streamer-awards-nominees" ref={railRef} className={styles.rail} onScroll={updateEdges}>
          {nominees.map((nominee, index) => (
            <button key={nominee.id} type="button" className={styles.card}
              onClick={(event) => { openerRef.current = event.currentTarget; setSelected(index); }}
              aria-label={`View ${nominee.name} — ${nominee.category} nomination`}>
              <span className={styles.artwork}>
                <SiteImage src={streamerAwardsImage(nominee.image)} alt={`${nominee.name}, nominated for ${nominee.category} at The Streamer Awards 2026`} width={1122} height={1402} sizes="(max-width: 600px) 70vw, (max-width: 1200px) 28vw, 272px" loading="lazy" />
                <span className={styles.enlarge} aria-hidden><Maximize2 size={15} /></span>
              </span>
              <span className={styles.cardCopy}><small>{nominee.category}</small><strong>{nominee.name}</strong></span>
            </button>
          ))}
        </div>
      </div>

      <Dialog.Root open={active !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.backdrop} />
          <Dialog.Content className={styles.dialog}
            onCloseAutoFocus={(event) => { event.preventDefault(); openerRef.current?.focus({ preventScroll: true }); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault(); changePoster(event.key === "ArrowLeft" ? -1 : 1);
              }
            }}>
            {active ? <>
              <div className={styles.dialogHeader}>
                <div><Dialog.Title>{active.name}</Dialog.Title><Dialog.Description>{active.category} · The Streamer Awards 2026</Dialog.Description></div>
                <Dialog.Close className={styles.close} aria-label="Close nominee artwork"><X size={20} aria-hidden /></Dialog.Close>
              </div>
              <div className={styles.fullArtwork}>
                <SiteImage key={active.id} src={streamerAwardsImage(active.image)} alt={`${active.name} — ${active.category} nominee poster`} width={1122} height={1402} unoptimized />
              </div>
              <div className={styles.dialogFooter}>
                <button type="button" onClick={() => changePoster(-1)} aria-label="Previous nominee artwork"><ArrowLeft size={18} aria-hidden /></button>
                <span>{(selected ?? 0) + 1} / {nominees.length}</span>
                <button type="button" onClick={() => changePoster(1)} aria-label="Next nominee artwork"><ArrowRight size={18} aria-hidden /></button>
              </div>
            </> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
