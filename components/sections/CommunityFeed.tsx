import Link from "next/link";
import { ArrowUpRight, MessageSquare, Tv } from "lucide-react";
import { MEMBERS } from "@/lib/members";

/**
 * Community feed teaser — pseudo-live activity rows. Hard-coded for
 * Phase 1, intended to be a live SSE stream from /v1/feed in Phase 3.
 *
 * The visual treatment is a "ticker" feel — no card chrome, just
 * tightly-stacked rows separated by hairline rules.
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
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-24">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Live feed</p>
            <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] text-[color:var(--ink)]">
              The room, in real time.
            </h2>
          </div>
          <Link
            href="/chat"
            className="btn btn-secondary"
          >
            Watch all chats <ArrowUpRight size={14} />
          </Link>
        </header>

        <ul className="overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)]">
          {rows.map((r, i) => (
            <li
              key={r.member.slug + r.label + i}
              className={`flex items-center gap-4 px-4 py-3 ${i === 0 ? "" : "border-t border-[color:var(--rule)]"}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: r.member.accent }}
                aria-hidden
              />
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${
                    r.kind === "live"
                      ? "border-[color:var(--core)]/50 bg-[color:var(--core)]/10 text-[color:var(--core)]"
                      : "border-[color:var(--rule-strong)] bg-[color:var(--surface)] text-[color:var(--ink-dim)]"
                  }`}
                >
                  {r.kind === "live" ? (
                    <Tv size={10} />
                  ) : r.kind === "clip" ? (
                    <Tv size={10} />
                  ) : (
                    <MessageSquare size={10} />
                  )}
                  {r.label}
                </span>
                <span className="truncate text-[14px] font-medium text-[color:var(--ink)]">
                  <Link
                    href={`/m/${r.member.slug}` as `/m/${string}`}
                    className="hover:text-[color:var(--core)]"
                    style={{ color: r.member.accent }}
                  >
                    {r.member.stageName}
                  </Link>
                  <span className="ml-2 text-[color:var(--ink-dim)]">{r.detail}</span>
                </span>
              </div>
              <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                {r.time}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          Pseudo-live feed · wires to /v1/feed (SSE) in Phase 3
        </p>
      </div>
    </section>
  );
}
