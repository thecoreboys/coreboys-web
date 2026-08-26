"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown } from "@untitledui/icons";
import { ease, durations } from "@/lib/motion";
import { Display, Eyebrow } from "@/components/typography";
import { HeroLiveOverlay } from "@/components/live/HeroLiveOverlay";

const CoreScene = dynamic(() => import("@/components/three/CoreScene").then((m) => m.CoreScene), {
  ssr: false,
  loading: () => null,
});

export function HeroCore() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Parallax: drone video at 0.4x, foreground text at 1.2x.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const videoY = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "-20%"]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.6, 1], [1, 0.4, 0]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.playsInline = true;
    void v.play().catch(() => {
      // autoplay may be blocked; user-gesture fallback
    });
  }, []);

  function smoothScrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative h-[100svh] min-h-[640px] w-full overflow-hidden border-b border-[color:var(--rule)]"
    >
      {/* Drone footage background, parallaxed at 0.4x */}
      <motion.div className="absolute inset-0" style={{ y: videoY }}>
        <video
          ref={videoRef}
          className="h-full w-full object-cover opacity-50"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/group/hero-poster.jpg"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/house-reveal.mp4" type="video/mp4" />
        </video>
      </motion.div>

      {/* Vignette + tonal overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 50%, rgba(6,7,10,0.0) 0%, rgba(6,7,10,0.55) 60%, rgba(6,7,10,0.95) 100%)",
        }}
      />

      {/* R3F core scene — sits at z-index 0, behind text */}
      <Suspense fallback={null}>
        <CoreScene />
      </Suspense>

      {/* Foreground typography, parallaxed at 1.2x */}
      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.slow / 1000, ease: ease.out, delay: 1.4 }}
        >
          <span className="font-logo text-[14px] uppercase leading-[16px] text-[color:var(--ink-dim)]">
            CORE · est. 2026
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, letterSpacing: "0.4em" }}
          animate={{ opacity: 1, letterSpacing: "-0.04em" }}
          transition={{ duration: durations.cinematic / 1000, ease: ease.out, delay: 1.5 }}
          className="mt-6"
        >
          <Display
            size={200}
            className="wordmark-fill text-[18vw] leading-[0.85] md:text-[200px]"
          >
            CORE
          </Display>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.0, duration: durations.slow / 1000, ease: ease.out }}
          className="mt-4"
        >
          <Eyebrow className="text-[color:var(--ink)]">
            Create. Own. Run. Everything.
          </Eyebrow>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2, duration: durations.slow / 1000, ease: ease.out }}
          className="mt-8 max-w-md text-base text-[color:var(--ink)]/85"
        >
          Six creators. One core.
        </motion.p>
      </motion.div>

      {/* Live HUD overlay — fades in only when someone is streaming */}
      <HeroLiveOverlay />

      {/* Editorial corner anchors — replace twin-pill block from MVP */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex items-end justify-between px-6 md:px-16">
        <Eyebrow>House · undisclosed</Eyebrow>
        <button
          onClick={() => smoothScrollTo("manifesto")}
          className="group inline-flex min-h-11 items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink)] transition-colors hover:text-[color:var(--core)]"
          data-cursor="hover"
        >
          <span className="block h-px w-12 bg-current transition-[width] duration-300 [transition-timing-function:var(--ease-out)] group-hover:w-20" />
          Begin
          <ArrowDown className="size-3" />
        </button>
      </div>
    </section>
  );
}
