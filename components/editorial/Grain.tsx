/** A subtle, static SVG texture that avoids repainting the full viewport. */
export function Grain() {
  return (
    <div className="grain-host" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg">
        <filter id="grain-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.9" numOctaves="2" stitchTiles="stitch" />
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
