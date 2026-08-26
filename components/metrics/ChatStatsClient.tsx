"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { MessageChatCircle } from "@untitledui/icons";
import { TrendLine, type TrendPoint } from "@/components/metrics/TrendLine";
import { MetricCard } from "@/components/metrics/MetricCard";
import { RangeToggle } from "@/components/metrics/RangeToggle";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";

export type ChatRow = {
  slug: string;
  /** ISO timestamp truncated to the hour, UTC. */
  hour: string;
  messages: number;
  chatters: number;
};

export type ChatStatsClientProps = {
  chat: ChatRow[];
  members: Array<{ slug: string; name: string; accent: string; portrait: string }>;
};

type Range = "1d" | "7d" | "31d";

export function ChatStatsClient({ chat, members }: ChatStatsClientProps) {
  const [range, setRange] = useState<Range>("7d");
  const router = useRouter();

  // Auto-refresh every 5 minutes — server is already
  // `dynamic = "force-dynamic"`, so router.refresh() pulls fresh
  // chat_metrics rows without a full page navigation.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5 * 60_000);
    return () => clearInterval(id);
  }, [router]);

  const cutoffMs = useMemo(() => {
    const days = range === "1d" ? 1 : range === "7d" ? 7 : 31;
    return Date.now() - days * 86_400_000;
  }, [range]);

  // Postgres `hour_utc::text` ships as "2026-05-02 18:00:00+00" — JS
  // Date can parse that, but a string-compare against a JS ISO cutoff
  // (which uses 'T') drops same-day rows, so always compare numeric ms.
  const ranged = useMemo(
    () => chat.filter((r) => Date.parse(r.hour.replace(" ", "T")) >= cutoffMs),
    [chat, cutoffMs],
  );

  const totals = useMemo(() => {
    // Sum messages per member, plus the grand total. We previously also
    // computed peak unique chatters here but the user opted to hide that
    // surface — the chat-listener worker still writes both columns into
    // chat_metrics, so the data continues to accumulate.
    const perMemberMessages = new Map<string, number>();
    for (const m of members) perMemberMessages.set(m.slug, 0);
    let totalMessages = 0;
    for (const r of ranged) {
      if (!perMemberMessages.has(r.slug)) continue;
      perMemberMessages.set(r.slug, (perMemberMessages.get(r.slug) ?? 0) + r.messages);
      totalMessages += r.messages;
    }
    return {
      totalMessages,
      perMember: members.map((m) => ({
        ...m,
        messages: perMemberMessages.get(m.slug) ?? 0,
      })),
    };
  }, [ranged, members]);

  // Combined trend: sum messages per hour bucket across all members.
  const combinedTrend: TrendPoint[] = useMemo(() => {
    const bucket = new Map<string, number>();
    for (const r of ranged) {
      bucket.set(r.hour, (bucket.get(r.hour) ?? 0) + r.messages);
    }
    return [...bucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, value]) => ({ date: hour.slice(0, 16), value }));
  }, [ranged]);

  const empty = chat.length === 0;
  const accent = "#db0368";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-secondary">
            Twitch · Chat activity
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-primary md:text-display-xs">
            <span className="gradient-text">Messages</span> + unique chatters per hour.
          </h2>
        </div>
        <RangeToggle
          value={range}
          onChange={setRange}
          options={[
            { key: "1d", label: "24h" },
            { key: "7d", label: "7d" },
            { key: "31d", label: "31d" },
          ]}
        />
      </header>

      {empty ? (
        <div className="rounded-xl bg-secondary p-6 ring-1 ring-inset ring-secondary shadow-xs-skeuomorphic">
          <p className="text-sm font-semibold text-brand-secondary">
            Listener live
          </p>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-tertiary">
            Chat worker is connected to all six channels and counting every
            message in real time. Hourly buckets show up here as members
            stream — refresh after someone goes live.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:max-w-xs">
            <MetricCard
              icon={MessageChatCircle}
              label="Total messages"
              value={totals.totalMessages.toLocaleString("en-US")}
            />
          </section>

          <section className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary shadow-xs-skeuomorphic md:p-6">
            <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-secondary">
                  Combined trend
                </p>
                <h3 className="mt-1 text-md font-semibold tracking-tight text-primary md:text-lg">
                  Messages per hour, all channels
                </h3>
              </div>
            </header>
            <TrendLine data={combinedTrend} accent={accent} unit="msgs" />
          </section>

          <TableCard.Root size="sm">
            <TableCard.Header
              title="Per-member chat"
              badge={
                <Badge color="gray" size="sm" type="modern">
                  {range === "1d" ? "Last 24h" : `Last ${range}`}
                </Badge>
              }
              description="Messages counted per channel over the selected window."
            />
            <Table aria-label="Chat messages per member" size="sm">
              <Table.Header>
                <Table.Head id="member" label="Member" isRowHeader className="w-full" />
                <Table.Head id="trend" label="Trend" />
                <Table.Head id="messages" label="Messages" className="text-right" />
              </Table.Header>
              <Table.Body items={totals.perMember}>
                {(m) => (
                  <Table.Row id={m.slug}>
                    <Table.Cell>
                      <span className="inline-flex items-center gap-2.5">
                        <span
                          className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-2 ring-inset"
                          style={{ ["--tw-ring-color" as string]: `${m.accent}66` }}
                        >
                          <Image
                            src={m.portrait}
                            alt={m.name}
                            fill
                            unoptimized
                            sizes="32px"
                            className="object-cover"
                          />
                        </span>
                        <span
                          className="text-sm font-semibold tracking-tight text-primary"
                          style={{ textShadow: `0 0 14px ${m.accent}66, 0 0 3px rgba(255,255,255,0.4)` }}
                        >
                          {m.name}
                        </span>
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <Sparkline
                        points={ranged.filter((r) => r.slug === m.slug).map((r) => r.messages)}
                        accent={m.accent}
                      />
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <span className="text-sm font-medium tabular-nums text-secondary">
                        {m.messages.toLocaleString("en-US")}
                      </span>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </TableCard.Root>
        </>
      )}
    </div>
  );
}

/** Tiny inline sparkline. Renders a thin recharts line of `points`
 *  filling the available width. Useful for table cells where a full
 *  TrendLine would be too tall. */
function Sparkline({ points, accent }: { points: number[]; accent: string }) {
  if (points.length === 0) {
    return <span className="text-xs text-quaternary">—</span>;
  }
  if (points.length === 1) {
    return (
      <span className="text-xs tabular-nums text-tertiary">
        {points[0]!.toLocaleString("en-US")}
      </span>
    );
  }
  const data = points.map((v, i) => ({ i, v }));
  return (
    <div className="h-6 w-[120px]" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 1, bottom: 2, left: 1 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={accent}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
