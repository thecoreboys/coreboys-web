import React from "react";

const CORE_STAR_PATH = "M32.499 .284C-2.565 7.478 5.297-5.869 16.004 28.287C-7.759 1.517 7.731 1.652-16.495 28.003C-5.193-5.961 2.434 7.522-32.499-.284C2.565-7.478-5.297 5.869-16.004-28.287C7.759-1.517-7.731-1.652 16.495-28.003C5.193 5.961-2.434-7.522 32.499 .284Z";

/**
 * The emblem's silhouette as plain shapes, for use inside <clipPath> or
 * <mask>. SVG ignores <g> inside a clipPath, and a clip only uses fill
 * geometry, so the rim is drawn here as a filled ring instead of a stroke.
 */
export function CoreSymbolClipShapes() {
  return (
    <>
      <path fillRule="evenodd" d="M32 1.5a30.5 30.5 0 1 1 0 61a30.5 30.5 0 1 1 0-61ZM32 6.5a25.5 25.5 0 1 0 0 51a25.5 25.5 0 1 0 0-51Z" />
      <path transform="translate(32 32) rotate(-30.5) scale(.95)" d={CORE_STAR_PATH} />
    </>
  );
}

/**
 * A circular CORE rim with the star’s top point centered at twelve o’clock.
 * `fill` paints the emblem body (rim and star); `stroke` optionally outlines
 * the star, so layered renderings such as the loading mark can reuse it.
 */
export function CoreSymbolArt({
  fill = "currentColor",
  stroke,
  strokeWidth,
  strokeLinejoin = "round",
  transform,
}: {
  fill?: string;
  stroke?: string;
  strokeWidth?: string | number;
  strokeLinejoin?: React.SVGProps<SVGPathElement>["strokeLinejoin"];
  transform?: string;
} = {}) {
  return (
    <g transform={`${transform ? `${transform} ` : ""}translate(32 32)`}>
      <circle r="28" fill="none" stroke={fill} strokeWidth="5" />
      <path
        transform="rotate(-30.5) scale(.95)"
        d={CORE_STAR_PATH}
        fill={fill}
        stroke={stroke ?? fill}
        strokeWidth={strokeWidth ?? 2}
        strokeLinejoin={strokeLinejoin}
      />
    </g>
  );
}

export function CoreSymbol({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="64" height="64" viewBox="0 0 64 64" fill="none">
      <CoreSymbolArt />
    </svg>
  );
}
