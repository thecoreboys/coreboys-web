"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Pill } from "@/components/ui/Pill";
import { useLiveStatus } from "@/hooks/useLiveStatus";

const CoreScene = dynamic(() => import("@/components/three/CoreScene").then((m) => m.CoreScene), {
  ssr: false,
  loading: () => null,
});

export function HeroCore() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data } = useLiveStatus();
  const anyLive = !!data?.live.some((l) => l.isLive);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.playsInline = true;
    void v.play().catch(() => {
      /* autoplay may be blocked; user-gesture fallback */
    });
  }, []);

  function smoothScrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section
      id="hero"
      className="relative h-[100svh] min-h-[640px] w-full overflow-hidden border-b border-[color:var(--rule)]"
    >
      {/* Drone footage background */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover opacity-50"
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

      {/* Vignette + tonal overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 50%, rgba(6,7,10,0.0) 0%, rgba(6,7,10,0.55) 60%, rgba(6,7,10,0.95) 100%)",
        }}
      />

      {/* R3F core scene */}
      <Suspense fallback={null}>
        <CoreScene />
      </Suspense>

      {/* Foreground typography */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="kicker mb-6"
        >
          The Core Boys · est. 2026
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, letterSpacing: "0.4em" }}
          animate={{ opacity: 1, letterSpacing: "-0.04em" }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-[18vw] leading-[0.85] font-black md:text-[12rem]"
          style={{
            backgroundImage:
              "linear-gradient(180deg, #ffffff 0%, #ffffff 40%, color-mix(in oklab, #ffffff 60%, var(--core)) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          CORE
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.9 }}
          className="mt-4 kicker"
        >
          Create. Own. Run. Everything.
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.9 }}
          className="mt-8 max-w-md text-base text-[color:var(--ink)]/80"
        >
          Six creators. One core.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.9 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Pill onClick={() => smoothScrollTo("roster")} variant="primary">
            Meet the boys
          </Pill>
          <Pill
            onClick={() => smoothScrollTo("live")}
            variant="ghost"
            className={anyLive ? "ring-2 ring-[color:var(--live)]/60" : undefined}
          >
            {anyLive ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-[color:var(--live)] live-pulse" />
                Watch live
              </>
            ) : (
              <>Watch live</>
            )}
          </Pill>
        </motion.div>
      </div>

      {/* Bottom kicker */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex justify-between px-6 kicker text-[10px]">
        <span>House · undisclosed</span>
        <span>Scroll ↓</span>
      </div>
    </section>
  );
}
