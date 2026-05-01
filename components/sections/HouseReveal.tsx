"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

export function HouseReveal() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0.1, 0.35, 0.65, 0.9], [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, [0.1, 0.5, 0.9], [40, 0, -40]);

  return (
    <section
      id="house"
      ref={ref}
      className="relative h-[140svh] w-full bg-[color:var(--bg)] rule"
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/house-reveal.mp4" type="video/mp4" />
        </video>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(6,7,10,0.9) 0%, rgba(6,7,10,0.2) 35%, rgba(6,7,10,0.2) 65%, rgba(6,7,10,0.95) 100%)",
          }}
        />
        <motion.div
          style={{ opacity, y }}
          className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
        >
          <div className="kicker mb-6">The house</div>
          <h2 className="font-display text-4xl md:text-7xl font-semibold leading-[1.05] tracking-tight max-w-4xl">
            Built in one house.
            <br />
            <span className="text-[color:var(--core)]">Running everything from it.</span>
          </h2>
        </motion.div>
      </div>
    </section>
  );
}
