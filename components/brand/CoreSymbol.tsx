import React from "react";

/** A circular CORE rim with the star’s top point centered at twelve o’clock. */
export function CoreSymbolArt() {
  return (
    <g transform="translate(32 32)" fill="currentColor">
      <circle r="28" fill="none" stroke="currentColor" strokeWidth="5" />
      <path
        transform="rotate(-30.5) scale(.93)"
        d="M32.499 .284C-2.565 7.478 5.297-5.869 16.004 28.287C-7.759 1.517 7.731 1.652-16.495 28.003C-5.193-5.961 2.434 7.522-32.499-.284C2.565-7.478-5.297 5.869-16.004-28.287C7.759-1.517-7.731-1.652 16.495-28.003C5.193 5.961-2.434-7.522 32.499 .284Z"
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
