"use client";

import { useEffect, useRef } from "react";

/**
 * Real animated SVG noise — feTurbulence + feDisplacementMap, with the
 * baseFrequency seed offset on a 4-second loop so the grain *moves* instead
 * of being a frozen dataURI PNG. 2% opacity host, applied via mix-blend-mode
 * overlay in globals.css.
 */
export function Grain() {
  const ref = useRef<SVGFETurbulenceElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = ((now - start) / 4000) % 1; // 4s loop
      const seed = Math.floor(t * 1000);
      const turb = ref.current;
      if (turb) {
        // Crossfade two octaves by perturbing baseFrequency with a slow sine,
        // and roll the seed each frame for grain motion.
        const f = 0.85 + Math.sin(t * Math.PI * 2) * 0.08;
        turb.setAttribute("baseFrequency", `${f.toFixed(3)} ${f.toFixed(3)}`);
        turb.setAttribute("seed", String(seed));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="grain-host" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg">
        <filter id="grain-noise">
          <feTurbulence
            ref={ref}
            type="fractalNoise"
            baseFrequency="0.9 0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0.6 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-noise)" />
      </svg>
    </div>
  );
}

/**
 * The CRT scanline overlay. Always rendered; hidden via CSS until
 * [data-mode="raw"] is set on <html>.
 */
export function Scanlines() {
  return <div className="scanlines" aria-hidden="true" />;
}
