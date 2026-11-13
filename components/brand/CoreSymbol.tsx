import React from "react";

const STAR = "M32.499 .284C-2.565 7.478 5.297-5.869 16.004 28.287C-7.759 1.517 7.731 1.652-16.495 28.003C-5.193-5.961 2.434 7.522-32.499-.284C2.565-7.478-5.297 5.869-16.004-28.287C7.759-1.517-7.731-1.652 16.495-28.003C5.193 5.961-2.434-7.522 32.499 .284Z";

/**
 * The same emblem as a single filled outline in the 64-unit box: the rim as a
 * clockwise outer circle with a counter-clockwise hole, and the star already
 * rotated and scaled. Nonzero filling keeps the overlaps solid, so the shape
 * can be painted with a gradient or used inside a <clipPath>.
 */
const OUTLINE = "M32 1.5A30.5 30.5 0 1 1 32 62.5A30.5 30.5 0 1 1 32 1.5Z"
  + "M32 6.5A25.5 25.5 0 1 0 32 57.5A25.5 25.5 0 1 0 32 6.5Z"
  + "M58.739 16.563C33.506 39.358 33.506 24.642 58.739 47.438C26.38 36.983 39.125 29.625 32 62.875C24.875 29.625 37.619 36.984 5.261 47.437C30.494 24.642 30.494 39.358 5.261 16.562C37.62 27.017 24.875 34.375 32 1.125C39.125 34.375 26.381 27.016 58.739 16.563Z";

/**
 * A circular CORE rim with the star’s top point centered at twelve o’clock.
 * Without props it draws the reference artwork in currentColor. With paint
 * props (fill, stroke, transform…) it draws the single-path outline instead.
 */
export function CoreSymbolArt(props: React.SVGProps<SVGPathElement> = {}) {
  if (Object.keys(props).length > 0) return <path fillRule="nonzero" clipRule="nonzero" d={OUTLINE} {...props} />;
  return (
    <g transform="translate(32 32)" fill="currentColor">
      <circle r="28" fill="none" stroke="currentColor" strokeWidth="5" />
      <path
        transform="rotate(-30.5) scale(.95)"
        d={STAR}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </g>
  );
}

export function CoreSymbol({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
    >
      <CoreSymbolArt />
    </svg>
  );
}
