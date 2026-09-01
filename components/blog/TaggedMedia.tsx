"use client";

import * as Popover from "@radix-ui/react-popover";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { FaceTagWithPerson, ResolvedPerson } from "@/lib/blog";
import { MEMBERS_BY_SLUG } from "@/lib/members";

type Props = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string | null;
  faceTags: FaceTagWithPerson[];
  /** Mark cover/hero media so it loads with priority. */
  priority?: boolean;
  className?: string;
};

/**
 * <TaggedMedia> — public-side image with hover/tap-revealed face boxes.
 *
 * Visibility model:
 *   - Boxes are invisible until the user hovers or focuses them (an `i`
 *     indicator in the corner advertises that the image has tags).
 *   - On hover/focus a 2-stroke ring appears: 2px white inner + 2px accent
 *     outer. AAA contrast against any photo background.
 *   - First mobile tap reveals all boxes for 4s with a subtle pulse;
 *     second tap on a specific box opens its popover.
 *   - `prefers-reduced-motion` skips pulse and ken-burns.
 *
 * Accessibility:
 *   - Each box is a real button, keyboard navigable.
 *   - Popover opens on focus (not just click).
 *   - aria-label communicates "Tagged: {personName}".
 *
 * NOTE (Phase A): video tagging not yet wired. The `faceTags` prop is the
 * still-image set only — Phase B will add a `tagsByTime` prop.
 */
export function TaggedMedia({
  src,
  alt,
  width,
  height,
  caption,
  faceTags,
  priority,
  className,
}: Props) {
  const [allRevealed, setAllRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const revealTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function handleFirstTap() {
    setAllRevealed(true);
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => setAllRevealed(false), 4000);
  }

  return (
    <figure
      className={cn("tagged-media group relative", className)}
      data-tags={faceTags.length}
      data-revealed={allRevealed ? "1" : "0"}
    >
      <div className="relative overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--surface)]">
        {width && height ? (
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            priority={priority}
            sizes="(min-width: 768px) 720px, 92vw"
            className={cn(
              "block h-auto w-full",
              !reducedMotion && "transition-transform duration-700 ease-out group-hover:scale-[1.015]",
            )}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            className="block h-auto w-full"
          />
        )}

        {/* Mobile tap shield — invisible above the image. */}
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={handleFirstTap}
          className="absolute inset-0 z-0 cursor-default md:hidden"
        />

        {faceTags.map((t) => (
          <FaceBox
            key={t.id}
            tag={t}
            allRevealed={allRevealed}
            reducedMotion={reducedMotion}
          />
        ))}

        {faceTags.length > 0 ? (
          <span
            className="pointer-events-none absolute bottom-2 right-2 z-10 inline-flex h-5 items-center gap-1 rounded-full bg-black/60 px-2 font-mono text-xs uppercase tracking-[0.14em] text-white backdrop-blur-sm"
            aria-hidden="true"
          >
            <Info size={10} />
            {faceTags.length}
          </span>
        ) : null}
      </div>

      {caption ? (
        <figcaption className="mt-2 text-center text-xs italic text-[color:var(--ink-dim)]">
          {caption}
        </figcaption>
      ) : null}

      {/* Print: caption with names. */}
      {faceTags.length > 0 ? (
        <figcaption className="hidden print:block mt-2 text-xs text-[color:var(--ink-dim)]">
          Tagged: {faceTags.map((t) => t.person?.name ?? "Unidentified").join(", ")}
        </figcaption>
      ) : null}
    </figure>
  );
}

function FaceBox({
  tag,
  allRevealed,
  reducedMotion,
}: {
  tag: FaceTagWithPerson;
  allRevealed: boolean;
  reducedMotion: boolean;
}) {
  const { bbox, person } = tag;
  const accent = accentFor(person);
  const label = person ? `Tagged: ${person.name}` : "Unidentified face";

  const style: React.CSSProperties = {
    left: `${bbox.left * 100}%`,
    top: `${bbox.top * 100}%`,
    width: `${bbox.width * 100}%`,
    height: `${bbox.height * 100}%`,
    "--face-accent": accent,
  } as React.CSSProperties;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          style={style}
          data-revealed={allRevealed ? "1" : "0"}
          className={cn(
            "face-box absolute z-10 rounded-[2px] focus:outline-none",
            // Default: invisible. Becomes a 2-stroke ring on hover/focus or
            // when allRevealed is set (mobile first-tap state).
            "border border-transparent",
            "hover:[box-shadow:inset_0_0_0_2px_#fff,0_0_0_2px_var(--face-accent)]",
            "focus-visible:[box-shadow:inset_0_0_0_2px_#fff,0_0_0_2px_var(--face-accent)]",
            "data-[revealed=1]:[box-shadow:inset_0_0_0_2px_#fff,0_0_0_2px_var(--face-accent)]",
            !reducedMotion && allRevealed && "animate-pulse-soft",
          )}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={4}
          className="z-50 w-[260px] rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3 text-sm shadow-2xl outline-none"
        >
          {person ? (
            <PersonCard person={person} accent={accent} />
          ) : (
            <p className="text-xs text-[color:var(--ink-faint)]">Unidentified face.</p>
          )}
          <Popover.Arrow className="fill-[color:var(--bg-elev)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PersonCard({ person, accent }: { person: ResolvedPerson; accent: string }) {
  const isExternal = person.kind === "external";
  const primary = person.socials[0];
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    isExternal && primary ? (
      <a
        href={primary.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:opacity-90"
      >
        {children}
      </a>
    ) : person.kind === "member" ? (
      <Link href={person.href.replace(/^\/m\//, "/channels/") as never} className="block hover:opacity-90">
        {children}
      </Link>
    ) : (
      <div>{children}</div>
    );

  return (
    <Wrapper>
      <div className="flex items-start gap-2.5">
        <div
          className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border bg-[color:var(--surface)]"
          style={{ borderColor: accent }}
        >
          {person.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
              {person.name.slice(0, 2)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-[color:var(--ink)]">{person.name}</span>
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
              {person.kind}
            </span>
          </div>
          {primary ? (
            <p className="mt-0.5 truncate text-xs text-[color:var(--ink-dim)]">
              {primary.platform} {primary.handle ?? ""}
            </p>
          ) : null}
        </div>
      </div>
    </Wrapper>
  );
}

function accentFor(person: ResolvedPerson | null): string {
  if (!person) return "var(--ink-dim)";
  if (person.kind === "member") {
    const slug = person.href.replace(/^\/(?:m|about)\//, "");
    const m = MEMBERS_BY_SLUG[slug];
    if (m) return m.accent;
  }
  if (person.kind === "external") return "var(--core)";
  return "var(--ink-dim)";
}

function cn(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}
