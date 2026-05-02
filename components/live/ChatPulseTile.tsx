import { MessageSquare, UserPlus, Zap, Activity } from "lucide-react";
import { getChatPulse } from "@/lib/chat-monitor";
import { formatViewerCount } from "@/lib/utils";

/**
 * Combined chat-pulse tile — drops between LiveNow and HouseReveal on
 * the home page. Single section, four cells: messages, new subs, bits,
 * active chatters. Backed by `lib/chat-monitor.ts` (currently mock,
 * see `docs/CHAT_MONITOR.md`).
 *
 * The "live ingest pending" chip surfaces when the ingest worker isn't
 * online yet so internal stakeholders see the source-of-truth state at
 * a glance. Public visitors see numbers either way.
 */
export async function ChatPulseTile() {
  const pulse = await getChatPulse();
  const cells: Array<{ icon: typeof MessageSquare; label: string; value: string; sub: string }> = [
    {
      icon: MessageSquare,
      label: "Chat messages",
      value: formatViewerCount(pulse.totals.messages24h),
      sub: "rolling 24h, all channels",
    },
    {
      icon: UserPlus,
      label: "New subs",
      value: pulse.totals.subs24h.toLocaleString("en-US"),
      sub: "rolling 24h, all members",
    },
    {
      icon: Zap,
      label: "Bits cheered",
      value: formatViewerCount(pulse.totals.bits24h),
      sub: "rolling 24h",
    },
    {
      icon: Activity,
      label: "Active chatters",
      value: pulse.totals.activeChattersNow.toLocaleString("en-US"),
      sub: "right now, deduped",
    },
  ];

  return (
    <section
      aria-label="Combined chat & sub pulse"
      className="relative w-full bg-[color:var(--bg)] py-20 md:py-24 rule"
    >
      <div className="mx-auto max-w-[1280px] px-6 md:px-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
              Pulse · combined
            </p>
            <h2 className="mt-2 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)] md:text-[40px]">
              The room is loud right now.
            </h2>
          </div>
          {pulse.freshness === "mock" ? (
            <span
              title="Real-time chat ingest is in design — see docs/CHAT_MONITOR.md"
              className="hidden h-6 items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200 md:inline-flex"
            >
              Live ingest pending
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-[color:var(--rule)] bg-[color:var(--rule)] md:grid-cols-4">
          {cells.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="bg-[color:var(--bg-elev)]/80 p-5 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 text-[color:var(--ink-faint)]">
                  <Icon size={11} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                    {c.label}
                  </span>
                </div>
                <p className="mt-3 font-display text-[32px] font-black leading-none tracking-[-0.03em] text-[color:var(--ink)] md:text-[44px]">
                  {c.value}
                </p>
                <p className="mt-1.5 text-[11px] text-[color:var(--ink-dim)]">{c.sub}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
