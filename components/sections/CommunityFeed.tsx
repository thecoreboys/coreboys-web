import Link from "next/link";
import { ArrowUpRight } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { MEMBERS } from "@/lib/members";

/**
 * Community feed teaser — pseudo-live activity rows. Hard-coded for
 * Phase 1, intended to be a live SSE stream from /v1/feed in Phase 3.
 *
 * UUI surface: a rounded-xl panel (bg-secondary, ring-1 ring-inset)
 * with hairline-divided rows; UUI BadgeWithDot for the kind chip and
 * UUI Button for the header CTA. Typography normalised to the UUI scale.
 */
export function CommunityFeed() {
  type Row = {
    member: (typeof MEMBERS)[number];
    kind: "live" | "post" | "clip";
    label: string;
    detail: string;
    time: string;
  };

  const rows: Row[] = [
    {
      member: MEMBERS.find((m) => m.slug === "marlon")!,
      kind: "live",
      label: "Live now",
      detail: "Just chatting · 18.2k watching",
      time: "2 min ago",
    },
    {
      member: MEMBERS.find((m) => m.slug === "ron")!,
      kind: "clip",
      label: "New clip",
      detail: "Tournament finals · clutch 1v3",
      time: "47 min ago",
    },
    {
      member: MEMBERS.find((m) => m.slug === "jason")!,
      kind: "post",
      label: "Posted",
      detail: "Behind the scenes from the studio shoot",
      time: "2 hours ago",
    },
    {
      member: MEMBERS.find((m) => m.slug === "lacy")!,
      kind: "live",
      label: "Went offline",
      detail: "Stream ended · 4h 12m run",
      time: "3 hours ago",
    },
    {
      member: MEMBERS.find((m) => m.slug === "silky")!,
      kind: "clip",
      label: "New VOD",
      detail: "Subathon recap · part 2",
      time: "5 hours ago",
    },
  ];

  return (
    <section className="border-t border-secondary bg-primary">
      <div className="mx-auto max-w-container px-6 py-16 md:px-8 md:py-24">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-secondary">Live feed</p>
            <h2 className="mt-2 text-display-xs font-semibold tracking-tight text-primary md:text-display-sm">
              The room, in real time.
            </h2>
          </div>
          <Button href="/chat" size="lg" color="secondary" iconTrailing={ArrowUpRight}>
            Watch all chats
          </Button>
        </header>

        <ul className="overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary shadow-xs">
          {rows.map((r, i) => (
            <li
              key={r.member.slug + r.label + i}
              className={`flex items-center gap-4 px-4 py-3 ${i === 0 ? "" : "border-t border-secondary"}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: r.member.accent }}
                aria-hidden
              />
              <div className="flex min-w-0 items-center gap-3">
                <BadgeWithDot
                  type="pill-color"
                  color={r.kind === "live" ? "error" : "gray"}
                  size="sm"
                >
                  {r.label}
                </BadgeWithDot>
                <span className="truncate text-sm font-medium text-primary">
                  <Link
                    href={`/channels/${r.member.slug}` as never}
                    className="hover:text-brand-secondary"
                    style={{ color: r.member.accent }}
                  >
                    {r.member.stageName}
                  </Link>
                  <span className="ml-2 text-tertiary">{r.detail}</span>
                </span>
              </div>
              <span className="ml-auto shrink-0 text-xs font-medium text-quaternary">
                {r.time}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-quaternary">
          Pseudo-live feed · wires to /v1/feed (SSE) in Phase 3
        </p>
      </div>
    </section>
  );
}
