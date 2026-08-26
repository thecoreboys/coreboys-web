"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

export function HouseReveal() {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0.1, 0.35, 0.65, 0.9], [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, [0.1, 0.5, 0.9], [40, 0, -40]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.playsInline = true;
    if (reduceMotion) {
      v.pause();
      return;
    }
    void v.play().catch(() => {
      // autoplay may be blocked
    });
  }, [reduceMotion]);

  const copy = (
    <>
      <p className="kicker mb-6 text-white/60">The house</p>
      <h2 className="max-w-4xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white md:text-7xl">
        Built in one house.
        <br />
        Running everything from it.
      </h2>
    </>
  );

  if (reduceMotion) {
    return (
      <section id="house" className="relative h-[100svh] min-h-[560px] w-full overflow-hidden bg-[color:var(--bg)] rule">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          poster="/group/thecoreboys.jpg"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/house-reveal.mp4" type="video/mp4" />
        </video>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,8,10,0.88) 0%, rgba(8,8,10,0.28) 40%, rgba(8,8,10,0.28) 60%, rgba(8,8,10,0.92) 100%)",
          }}
        />
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          {copy}
        </div>
      </section>
    );
  }

  return (
    <section id="house" ref={ref} className="relative h-[140svh] w-full bg-[color:var(--bg)] rule">
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/group/thecoreboys.jpg"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/house-reveal.mp4" type="video/mp4" />
        </video>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,8,10,0.88) 0%, rgba(8,8,10,0.22) 38%, rgba(8,8,10,0.22) 62%, rgba(8,8,10,0.94) 100%)",
          }}
        />
        <motion.div
          style={{ opacity, y }}
          className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
        >
          {copy}
        </motion.div>
      </div>
    </section>
  );
}
