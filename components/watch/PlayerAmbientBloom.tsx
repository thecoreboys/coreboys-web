"use client";

import type { CSSProperties } from "react";

type AmbientStyle = CSSProperties & {
  "--player-ambient-accent": string;
};

export function PlayerAmbientBloom({
  source,
  accent = "var(--core)",
  frame = false,
}: {
  source?: string | null;
  accent?: string | null;
  frame?: boolean;
}) {
  if (!source && !accent) return null;

  return (
    <div
      className={`watch-player-ambient ${frame ? "watch-player-ambient--frame" : ""}`.trim()}
      style={{ "--player-ambient-accent": accent || "var(--core)" } as AmbientStyle}
      aria-hidden="true"
    >
      {source ? (
        // Runtime artwork comes from several connected media providers and
        // cannot use the static Next Image allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={source}
          src={source}
          alt=""
          draggable={false}
          decoding="async"
          fetchPriority="low"
          className="watch-player-ambient__art"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
      <span className="watch-player-ambient__accent" />
      <span className="watch-player-ambient__veil" />
    </div>
  );
}
