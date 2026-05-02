"use client";

import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import type { ResolvedPerson } from "@/lib/blog";

/**
 * Inline person mention rendered in article body. Subtle accent underline
 * in the person's accent color (members) or a neutral rule (crew/external),
 * never a harsh chip — preserves reading flow. On hover/focus, opens a
 * Popover with avatar + name + role + a primary social link.
 */
export function TalentTag({ person }: { person: ResolvedPerson }) {
  const accent = accentFor(person);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <span
          className="talent-tag relative inline cursor-pointer font-semibold text-[color:var(--ink)] underline-offset-[3px] decoration-[1.5px]"
          style={{
            textDecorationLine: "underline",
            textDecorationColor: accent,
          }}
          tabIndex={0}
          role="button"
          aria-label={`Open ${person.name} profile`}
          data-person-id={person.id}
        >
          {person.name}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          className="talent-tag-popover z-50 w-[280px] rounded-[8px] border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3 text-[13px] shadow-2xl outline-none"
        >
          <div className="flex items-start gap-2.5">
            <Avatar person={person} accent={accent} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-[color:var(--ink)]">{person.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
                  {person.kind}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-snug text-[color:var(--ink-dim)]">
                {oneLineContext(person)}
              </p>
              <div className="mt-2">
                <PrimaryAction person={person} accent={accent} />
              </div>
            </div>
          </div>
          <Popover.Arrow className="fill-[color:var(--bg-elev)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Avatar({ person, accent }: { person: ResolvedPerson; accent: string }) {
  return (
    <div
      className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border bg-[color:var(--surface)]"
      style={{ borderColor: accent }}
    >
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
          {person.name.slice(0, 2)}
        </span>
      )}
    </div>
  );
}

function PrimaryAction({ person, accent }: { person: ResolvedPerson; accent: string }) {
  if (person.kind === "member") {
    return (
      <Link
        href={person.href as `/m/${string}`}
        className="inline-flex items-center gap-1 rounded-[4px] border px-2 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors hover:opacity-80"
        style={{ borderColor: accent, color: accent }}
      >
        Open profile →
      </Link>
    );
  }
  if (person.kind === "external") {
    const first = person.socials[0];
    if (first) {
      return (
        <a
          href={first.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-[4px] border border-[color:var(--rule)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-dim)] transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]"
        >
          {first.platform} ↗
        </a>
      );
    }
  }
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
      Crew
    </span>
  );
}

function oneLineContext(person: ResolvedPerson): string {
  if (person.kind === "member") {
    const slug = person.href.replace(/^\/m\//, "");
    const m = MEMBERS_BY_SLUG[slug];
    const primary = person.socials[0];
    if (primary?.handle) return `Member · ${primary.platform} ${primary.handle}`;
    if (m) return `Member · ${m.stageName}`;
    return "Member of The Core Boys";
  }
  if (person.kind === "crew") {
    return "Behind the camera at The Core Boys";
  }
  const primary = person.socials[0];
  if (primary?.handle) return `${primary.platform} ${primary.handle}`;
  return "External collaborator";
}

function accentFor(person: ResolvedPerson): string {
  if (person.kind === "member") {
    const slug = person.href.replace(/^\/m\//, "");
    const m = MEMBERS_BY_SLUG[slug];
    if (m) return m.accent;
  }
  if (person.kind === "crew") return "var(--ink-dim)";
  return "var(--core)";
}
