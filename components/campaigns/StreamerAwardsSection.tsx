"use client";

import * as Dialog from "@radix-ui/react-dialog";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight, Maximize2, Pause, Play, X } from "lucide-react";
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
  const [rotationEnabled, setRotationEnabled] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [inView, setInView] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);
  const [carouselRef, carousel] = useEmblaCarousel({ loop: true, align: "start", duration: 45 });
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
    if (!carousel) return;
    setEdges({ previous: carousel.canScrollPrev(), next: carousel.canScrollNext() });
  }, [carousel]);

  useEffect(() => {
    if (!carousel) return;
    updateEdges();
    const onPointerDown = () => setDragging(true);
    const onPointerUp = () => setDragging(false);
    carousel.on("select", updateEdges).on("reInit", updateEdges).on("pointerDown", onPointerDown).on("pointerUp", onPointerUp);
    return () => { carousel.off("select", updateEdges).off("reInit", updateEdges).off("pointerDown", onPointerDown).off("pointerUp", onPointerUp); };
  }, [carousel, updateEdges]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !visible) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setMotionAllowed(!motion.matches);
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), { threshold: .1 });
    observer.observe(section);
    motion.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [visible]);

  useEffect(() => {
    if (!carousel || !rotationEnabled || !motionAllowed || !inView || !pageVisible || hovered || dragging || selected !== null || !edges.next) return;
    const interval = window.setInterval(() => carousel.scrollNext(), 4500);
    return () => window.clearInterval(interval);
  }, [carousel, rotationEnabled, motionAllowed, inView, pageVisible, hovered, dragging, selected, edges.next]);

  const scroll = (direction: number) => {
    setRotationEnabled(false);
    if (direction < 0) carousel?.scrollPrev(!motionAllowed);
    else carousel?.scrollNext(!motionAllowed);
  };
  const changePoster = (direction: number) => setSelected((index) => index === null ? null : (index + direction + nominees.length) % nominees.length);

  if (!countdown) return null;

  return (
    <section id="streamer-awards" ref={sectionRef} className={styles.section} aria-labelledby="streamer-awards-heading" aria-roledescription="carousel" data-streamer-awards
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => { if (!(event.target as HTMLElement).closest("[data-awards-rotation]")) setRotationEnabled(false); }}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <h2 id="streamer-awards-heading">The Streamer Awards <span className={styles.edition}>2026</span></h2>
        </header>

        <div id="streamer-awards-nominees" ref={carouselRef} className={styles.viewport} aria-live={rotationEnabled && motionAllowed ? "off" : "polite"} data-lenis-prevent>
          <div className={styles.rail}>
          {nominees.map((nominee, index) => (
            <button key={nominee.id} type="button" className={styles.card}
              data-awards-slide
              onClick={(event) => { openerRef.current = event.currentTarget; setSelected(index); }}
              aria-label={`View ${nominee.name} — ${nominee.category} nomination`}>
              <span className={styles.artwork}>
                <SiteImage src={streamerAwardsImage(nominee.image)} alt={`${nominee.name}, nominated for ${nominee.category} at The Streamer Awards 2026`} width={1122} height={1402} sizes="(max-width: 760px) 63vw, (max-width: 935px) 224px, (max-width: 1334px) 24vw, 320px" loading="lazy" />
                <span className={styles.enlarge} aria-hidden><Maximize2 size={15} /></span>
              </span>
            </button>
          ))}
          </div>
        </div>
        <div className={styles.controls}>
          <time dateTime={STREAMER_AWARDS_ENDS_AT} className={styles.countdown} role="timer" aria-live="off" title="November 12 · 5 PM PT / 8 PM ET" aria-label={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds remaining`}>
            <span aria-hidden="true">{countdown.days ? `${countdown.days}d ` : ""}{pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}</span>
          </time>
          <button type="button" onClick={() => scroll(-1)} disabled={!edges.previous} aria-label="Previous nominees" aria-controls="streamer-awards-nominees"><ArrowLeft size={17} aria-hidden /></button>
          {motionAllowed && (edges.previous || edges.next) ? <button type="button" data-awards-rotation onClick={() => setRotationEnabled((enabled) => !enabled)} aria-label={rotationEnabled ? "Pause carousel" : "Play carousel"} aria-controls="streamer-awards-nominees">{rotationEnabled ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}</button> : null}
          <button type="button" onClick={() => scroll(1)} disabled={!edges.next} aria-label="Next nominees" aria-controls="streamer-awards-nominees"><ArrowRight size={17} aria-hidden /></button>
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
