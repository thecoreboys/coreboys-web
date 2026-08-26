"use client";

import { useEffect, useState } from "react";

type Payload = {
  signups: number;
  connected: Record<string, number>;
  loyalty: {
    twitchFollows: number;
    twitchSubs: number;
    youtubeSubs: number;
    xFollows: number;
  };
  chatSends24h: number;
  followOverlap: Array<{ members: number; fans: number }>;
  neverConnected: number;
};

export function ConnectedFansDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/fans", { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setData)
      .catch(() => setErr("Couldn’t load funnel."));
  }, []);

  if (err) return <p className="text-sm text-error-primary">{err}</p>;
  if (!data) return <div className="h-48 animate-pulse rounded-2xl bg-primary" />;

  const tiles = [
    ["Signups", data.signups],
    ["Twitch linked", data.connected.twitch ?? 0],
    ["YouTube linked", data.connected.youtube ?? 0],
    ["X linked", data.connected.x ?? 0],
    ["Never connected", data.neverConnected],
    ["Chat sends (24h)", data.chatSends24h],
    ["Twitch follows", data.loyalty.twitchFollows],
    ["Twitch subs", data.loyalty.twitchSubs],
    ["YouTube subs", data.loyalty.youtubeSubs],
    ["X follows", data.loyalty.xFollows],
  ] as const;

  return (
    <div className="space-y-8">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(([label, n]) => (
          <li key={label} className="rounded-2xl bg-primary p-4 ring-1 ring-inset ring-secondary">
            <p className="text-xs font-medium text-quaternary">{label}</p>
            <p className="mt-1 text-display-xs font-semibold tabular-nums text-primary">{n}</p>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl bg-primary p-5 ring-1 ring-inset ring-secondary">
        <h2 className="text-md font-semibold text-primary">Twitch follow overlap</h2>
        <p className="mt-1 text-sm text-tertiary">
          How many registered fans follow 1, 2, … 6 members. Combined only — not a public ranking.
        </p>
        {data.followOverlap.length === 0 ? (
          <p className="mt-4 text-sm text-quaternary">No follow facts yet. Fans need to connect Twitch and sync.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data.followOverlap.map((row) => (
              <li key={row.members} className="flex items-center justify-between text-sm">
                <span className="text-secondary">Follows {row.members} member{row.members === 1 ? "" : "s"}</span>
                <span className="font-semibold tabular-nums text-primary">{row.fans}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
