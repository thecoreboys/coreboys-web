"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowUpRight, Play } from "@untitledui/icons";
import { CREW, MEMBERS } from "@/lib/members";
import { Button } from "@/components/base/buttons/button";

// Static fallback shown behind the video if autoplay is blocked
// (iOS Low Power Mode, slow first paint, etc.). Hardcoded here because
// `lib/asset-index.ts` is server-only and this component is "use client".
const HOUSE_FALLBACK = "/group/thecoreboys.jpg";

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
export function HouseTourParallax() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // The native `loop` attribute handles seamless restarts on every
  // browser. We previously trimmed the loop to the first 0:36 with a
  // `timeupdate`-driven seek-to-0, but that mid-playback seek caused a
  // visible stutter / black frame on some browsers (the seek + re-play
  // race) and is the reason the background "wasn't showing properly".
  // Looping the full clip via the native attribute is seamless.

  // Mobile Safari ignores the `autoplay` attribute often enough that the
  // background video never starts on phones — the user just sees a black
  // section. Calling .play() in a post-hydration effect satisfies the
  // policy (muted + playsInline + post-load are all true) and works
  // around the bug. Also retry on the canplay event in case the metadata
  // loads after we first try.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };
    tryPlay();
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("loadeddata", tryPlay);
    return () => {
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("loadeddata", tryPlay);
    };
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
        {/* Static fallback frame — sits behind the video so the section
            never reads as empty on mobile devices that block autoplay
            (iOS Low Power Mode, data-saver, slow first-paint, etc.). */}
        <Image
          src={HOUSE_FALLBACK}
          alt=""
          fill
          unoptimized
          priority
          sizes="100vw"
          className="absolute left-0 top-0 h-full w-full object-cover"
          style={{ objectPosition: "center 40%" }}
        />
        <video
          ref={videoRef}
          src="/house-reveal.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={HOUSE_FALLBACK}
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
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
              "radial-gradient(60% 50% at 30% 50%, rgba(219,3,104,0.18), transparent 70%), radial-gradient(50% 40% at 90% 40%, rgba(118,2,153,0.18), transparent 70%)",
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
      {/* Single cohesive stack — eyebrow, title, CTA, stats — all in one
          tight column that's vertically centered as a unit. The CTA sits
          right under the title (no big gap) so the composition reads as
          one editorial block. */}
      <motion.div
        className="relative z-10 mx-auto flex h-full w-full max-w-container flex-col items-center justify-center gap-7 px-6 pb-[18vh] pt-[6vh] text-center md:gap-8 md:px-8"
        style={reduced ? undefined : { y: fgY }}
      >
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className="flex flex-col items-center"
        >
          <span
            className="block font-mono text-[clamp(12px,1.3vw,16px)] uppercase tracking-[0.32em] text-white/75"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}
          >
            This is the
          </span>
          <h2
            className="mt-3 text-display text-[clamp(44px,8vw,120px)] font-black leading-[0.9] tracking-[-0.04em] text-white"
            style={{
              textShadow:
                "0 0 6px rgba(255,255,255,0.85), 0 0 18px rgba(255,255,255,0.55), 0 0 36px rgba(219,3,104,0.85), 0 0 80px rgba(219,3,104,0.55), 0 0 140px rgba(219,3,104,0.35)",
              animation: "core-glow 4.5s ease-in-out infinite",
            }}
          >
            CORE house.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.16 }}
        >
          <Button
            href={youtubeHref}
            target="_blank"
            rel="noopener noreferrer"
            color="primary"
            size="lg"
            iconLeading={<Play className="size-4" />}
            iconTrailing={ArrowUpRight}
          >
            Watch on YouTube
          </Button>
        </motion.div>

        <motion.ul
          className="grid w-full max-w-[760px] grid-cols-2 gap-3 md:grid-cols-4"
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
              className="rounded-xl bg-black/40 px-4 py-3 text-center ring-1 ring-inset ring-white/15 shadow-xs-skeuomorphic backdrop-blur-md"
            >
              <p className="text-display-xs font-semibold tabular-nums text-white">
                {s.v}
              </p>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.22em] text-white/60">
                {s.l}
              </p>
            </motion.li>
          ))}
        </motion.ul>
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
