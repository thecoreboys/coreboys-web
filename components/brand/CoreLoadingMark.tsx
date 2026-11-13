"use client";

import { useId } from "react";
import { CoreSymbolArt } from "./CoreSymbol";
import styles from "./CoreLoadingMark.module.css";

/** Static forged-metal artwork; only the tilt and reflected light move. */
export function CoreLoadingMark() {
  const id = useId().replace(/:/g, "");
  const metal = `${id}-metal`;
  const edge = `${id}-edge`;
  const grain = `${id}-grain`;
  const silhouette = `${id}-silhouette`;
  const reflection = `${id}-reflection`;

  return (
    <div className={styles.mark} aria-hidden="true">
      <div className={styles.float}>
        <svg className={styles.art} width="160" height="160" viewBox="-3 -3 70 72" fill="none" focusable="false">
          <defs>
            <linearGradient id={metal} x1="12" y1="2" x2="45" y2="64" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f4f5f6" />
              <stop offset=".15" stopColor="#a4a8ae" />
              <stop offset=".29" stopColor="#353a42" />
              <stop offset=".34" stopColor="#f9fafb" />
              <stop offset=".39" stopColor="#c3c7cc" />
              <stop offset=".52" stopColor="#525861" />
              <stop offset=".66" stopColor="#242930" />
              <stop offset=".72" stopColor="#e4e7eb" />
              <stop offset=".81" stopColor="#9ca2aa" />
              <stop offset="1" stopColor="#373e48" />
            </linearGradient>
            <linearGradient id={edge} x1="12" y1="5" x2="50" y2="60" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fff" />
              <stop offset=".28" stopColor="#e2e5e9" />
              <stop offset=".5" stopColor="#727985" />
              <stop offset=".72" stopColor="#f9fafb" />
              <stop offset="1" stopColor="#aab0b9" />
            </linearGradient>
            <linearGradient id={reflection}>
              <stop stopColor="#fff" stopOpacity="0" />
              <stop offset=".46" stopColor="#fff" stopOpacity=".12" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".9" />
              <stop offset=".56" stopColor="#fff" stopOpacity=".16" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <filter id={grain} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="8" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <clipPath id={silhouette}><CoreSymbolArt /></clipPath>
          </defs>
          <CoreSymbolArt fill="#20252d" stroke="#11151b" strokeWidth=".65" strokeLinejoin="round" transform="translate(.35 .7)" />
          <CoreSymbolArt fill={`url(#${metal})`} stroke={`url(#${edge})`} strokeWidth=".65" strokeLinejoin="round" />
          <g clipPath={`url(#${silhouette})`}>
            <rect width="64" height="64" filter={`url(#${grain})`} opacity=".3" className={styles.grain} />
            <path d="M18 8l22 41M11 21l12 23M31 4l12 24M29 39l9 17M42 9l9 18M12 39l6 11M36 13l4 7" stroke="#0c1016" strokeWidth=".12" opacity=".48" />
            <path d="M20 9l7 14M34 7l8 16M38 37l7 13M10 25l6 11M25 36l8 17M45 14l6 11" stroke="#fff" strokeWidth=".1" opacity=".42" />
            <g className={styles.sheen}>
              <path d="M12-12h24L12 78h-24Z" fill={`url(#${reflection})`} />
            </g>
          </g>
          <CoreSymbolArt fill="none" stroke={`url(#${edge})`} strokeWidth=".2" strokeLinejoin="round" />
        </svg>
      </div>
      <span className={styles.shadow} />
    </div>
  );
}
