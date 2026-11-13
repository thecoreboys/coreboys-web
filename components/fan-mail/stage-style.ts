import type { CSSProperties } from "react";
import type { FanMailStage } from "@/lib/fan-mail-stages";
import type { FontToken } from "@/lib/postcard-identities";

/** Expose a stage's colors as the CSS custom properties FanMail.module.css reads. */
export function stageVars(stage: FanMailStage): CSSProperties {
  return {
    "--stage-backdrop": stage.backdrop,
    "--stage-texture": stage.texture,
    "--stage-ink": stage.ink,
    "--stage-muted": stage.mutedInk,
    "--stage-accent": stage.accent,
    "--stage-accent-ink": stage.accentInk,
    "--stage-accent-ring": stage.ring,
    "--tile-fade": stage.base,
  } as CSSProperties;
}

/** Inline style for a postcard identity font token. */
export function fontStyle(token: FontToken): CSSProperties {
  return {
    fontFamily: token.family,
    fontWeight: token.weight,
    fontStyle: token.style,
    letterSpacing: `${token.letterSpacingEm}em`,
    lineHeight: token.lineHeight,
    textTransform: token.transform,
  };
}

/**
 * Font size that keeps a single-line name inside its container
 * (the parent must be a CSS size container), capped at `maxRem`.
 */
export function fitTitleSize(name: string, widthEm: number, maxRem: number): string {
  const perChar = 100 / Math.max(1, name.length * widthEm);
  return `min(${maxRem}rem, ${perChar.toFixed(2)}cqi)`;
}
