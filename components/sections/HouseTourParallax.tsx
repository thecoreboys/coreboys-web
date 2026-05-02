"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowUpRight, Play } from "lucide-react";
import { CREW, MEMBERS } from "@/lib/members";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Parallax welcome section. Background = looping muted YouTube embed of
 * the house tour, scaled up so we can move it on scroll without
 * exposing edges. Foreground = layered editorial copy + a CTA pill that
 * pops the full video on YouTube.
 *
 * Three independent parallax tracks (background, mid-glow, foreground)
 * give the whole section depth instead of just sliding the hero. We use
 * `useSpring` to soften the transforms so it feels physical, not janky.
 *
 * Reduced-motion: collapses to a static poster — no transforms, no auto-
 * play. Iframe is replaced with a still poster image so we don't load
 * the YouTube payload at all.
 */
/** End of the loop window in seconds — restart from the start when the
 *  video plays past this. Trims to the first 0:36 of the reveal trailer. */
const LOOP_END = 36;

export function HouseTourParallax() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Loop only the first LOOP_END seconds. We listen on `timeupdate` and
  // seek back to 0 when the playhead crosses the marker. The native
  // `loop` attribute is left on as a backstop in case the video ends
  // naturally before we catch it.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime >= LOOP_END) {
        v.currentTime = 0;
        // Some browsers pause briefly when seeking — kick playback back on.
        const playPromise = v.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, []);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  // Spring-smoothed scroll so the parallax tracks feel weighted.
  const smooth = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 24,
    mass: 0.6,
  });

  // Background moves slower (overshoots top) — classic parallax depth.
  // Range tightened from ±12% so the house stays framed through the scroll
  // instead of drifting off the visible crop.
  const bgY = useTransform(smooth, [0, 1], ["-6%", "6%"]);
  const bgScale = useTransform(smooth, [0, 1], [1.12, 1.22]);
  const fgY = useTransform(smooth, [0, 1], ["6%", "-6%"]);
  const overlayOpacity = useTransform(smooth, [0, 0.5, 1], [0.85, 0.55, 0.85]);

  // Direct link to the house-tour video on YouTube.
  const youtubeHref = "https://youtu.be/Wrc7pCsGKTI";

  return (
    <section
      ref={sectionRef}
      className="relative isolate w-full overflow-hidden"
      style={{ height: "min(110vh, 920px)", minHeight: "640px" }}
      aria-label="House tour"
    >
      {/* ── Background video / parallax track ───────────────────────── */}
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-30"
        style={reduced ? undefined : { y: bgY, scale: bgScale }}
      >
        <video
          ref={videoRef}
          src="/house-reveal.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute left-1/2 top-1/2 h-full w-full min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
          style={{ objectPosition: "center 40%" }}
        />
      </motion.div>

      {/* Vignette + scanline + bloom — keeps text readable over a busy video. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={reduced ? undefined : { opacity: overlayOpacity }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,8,10,0.85) 0%, rgba(8,8,10,0.55) 38%, rgba(8,8,10,0.55) 65%, rgba(8,8,10,0.95) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 30% 50%, rgba(239,68,68,0.18), transparent 70%), radial-gradient(50% 40% at 90% 40%, rgba(99,102,241,0.18), transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0 mix-blend-soft-light opacity-50"
          style={{
            background:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 3px)",
          }}
        />
      </motion.div>

      {/* ── Foreground content ─────────────────────────────────────── */}
      {/* Title fills the area above the bottom group and centers within
          it — so it lands at the optical middle of the visible video,
          not the geometric middle of the section (which would feel low
          because of the CTA + stats below). */}
      <motion.div
        className="relative z-10 mx-auto flex h-full w-full max-w-[1440px] flex-col px-6 pt-10 pb-10 text-center md:px-8 md:pb-16"
        style={reduced ? undefined : { y: fgY }}
      >
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className="grid flex-1 place-items-center"
        >
          <div className="flex flex-col items-center">
            <span
              className="block font-mono text-[clamp(11px,1.3vw,16px)] uppercase tracking-[0.32em] text-white/75"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}
            >
              This is the
            </span>
            <h2
              className="mt-3 text-display text-[clamp(56px,10vw,160px)] font-black leading-[0.9] tracking-[-0.04em] text-white"
              style={{
                textShadow:
                  "0 0 6px rgba(255,255,255,0.85), 0 0 18px rgba(255,255,255,0.55), 0 0 36px rgba(255,59,31,0.85), 0 0 80px rgba(255,59,31,0.55), 0 0 140px rgba(255,59,31,0.35)",
                animation: "core-glow 4.5s ease-in-out infinite",
              }}
            >
              CORE house.
            </h2>
          </div>
        </motion.div>

        {/* Bottom group — natural flow at the end of the flex column. */}
        <div className="flex flex-col items-center gap-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.16 }}
          >
            <Link
              href={youtubeHref as never}
              target="_blank"
              rel="noopener noreferrer"
              className="group/cta inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 py-2.5 text-[13px] font-semibold tracking-tight text-white backdrop-blur-md transition-all hover:-translate-y-px hover:border-white hover:bg-white/20"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#FF0033] text-white shadow-[0_0_18px_rgba(255,0,51,0.5)]">
                <Play size={11} fill="currentColor" />
              </span>
              Watch on YouTube
              <ArrowUpRight
                size={14}
                className="transition-transform group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5"
              />
            </Link>
          </motion.div>

          {/* Stat strip with stagger */}
          <motion.ul
            className="mx-auto grid w-full max-w-[760px] grid-cols-2 gap-3 md:grid-cols-4"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-15%" }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
            }}
          >
            {[
              { l: "Square ft.", v: "30,000" },
              { l: "Rooms", v: "9" },
              { l: "Members", v: String(MEMBERS.length) },
              { l: "Crew", v: String(CREW.length) },
            ].map((s) => (
              <motion.li
                key={s.l}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
                }}
                className="rounded-md border border-white/15 bg-black/40 px-4 py-3 text-center backdrop-blur-md"
              >
                <p className="text-display text-[20px] font-black tabular-nums text-white md:text-[22px]">
                  {s.v}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-white/60">
                  {s.l}
                </p>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </motion.div>

      {/* Edge fades into the surrounding sections */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[color:var(--bg)] to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[color:var(--bg)] to-transparent"
      />
    </section>
  );
}
