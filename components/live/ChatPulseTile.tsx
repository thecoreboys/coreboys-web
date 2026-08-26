import { MessageSquare, UserPlus, Zap, Activity } from "lucide-react";
import { getChatPulse } from "@/lib/chat-monitor";
import { formatViewerCount } from "@/lib/utils";
import { BadgeWithDot } from "@/components/base/badges/badges";

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
      <div className="mx-auto max-w-container px-6 md:px-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-secondary">
              Pulse · combined
            </p>
            <h2 className="mt-2 font-display text-display-xs font-semibold leading-tight tracking-tight text-primary md:text-display-md">
              The room is loud right now.
            </h2>
          </div>
          {pulse.freshness === "mock" ? (
            <div className="hidden md:block">
              <BadgeWithDot type="pill-color" color="warning" size="md">
                Live ingest pending
              </BadgeWithDot>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--rule)] md:grid-cols-4">
          {cells.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="bg-[color:var(--bg-elev)]/80 p-5 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 text-quaternary">
                  <Icon size={13} />
                  <span className="text-xs font-medium uppercase tracking-[0.14em]">
                    {c.label}
                  </span>
                </div>
                <p className="mt-3 font-display text-display-sm font-semibold leading-none tracking-tight text-primary md:text-display-md">
                  {c.value}
                </p>
                <p className="mt-1.5 text-xs text-tertiary">{c.sub}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
