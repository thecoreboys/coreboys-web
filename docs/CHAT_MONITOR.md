# Chat & sub monitor

Aggregated, combined-only realtime metrics for The Core Boys' Twitch
channels. The display is single-org ("we got 32K chat messages and 412
new subs in the last 24 hours"); the backend is per-channel because
that's how Twitch IRC and EventSub deliver data.

## What we surface

A single tile on the home page, near the live section:

| Metric                      | Window  | Source                              |
| --------------------------- | ------- | ----------------------------------- |
| Chat messages               | 24h     | Twitch IRC (per-channel join)       |
| New subscriptions           | 24h     | Twitch EventSub `channel.subscribe` |
| Bits cheered                | 24h     | Twitch EventSub `channel.cheer`     |
| Active chatters             | now     | Rolling unique-users over 60s       |

Per-channel breakdowns exist server-side for ops + the cms but never
appear on the public site. The point is to feel like a control center
for the org, not a leaderboard between members.

## What we don't have today

- **Per-channel auth scopes**. CORE Inc. doesn't hold Twitch chat OAuth
  for each member. Without those scopes, the public Helix API exposes
  no chat or subscription data at the granularity needed.
- **Always-on backend worker**. The chat ingest pathway needs a
  long-running process (a Node worker on a Railway dyno joining each
  IRC channel as `coreboys-bot`). Today we run only short-lived Vercel
  functions for the public site.

## Forward path

Two paths, picked when the data becomes worth the operational cost:

1. **Per-creator OAuth grants** stored in `coreboys-api`. Each member
   does a one-click "let CORE Inc. read chat" handshake; the api
   stores the refresh token and starts an EventSub subscription per
   channel. The aggregator tallies messages + subs into a 24h rolling
   bucket (Redis sorted sets, keyed by date). The public tile reads
   from a single combined endpoint.

2. **`coreboys-bot` IRC worker**. A separate `coreboys-bot` Railway
   service that joins each member's chat as a moderator or normal
   chatter (members invite the bot once). Lower data fidelity but no
   per-creator OAuth dance. Still requires standing infrastructure.

Both end up at the same wire shape, defined in `lib/chat-monitor.ts`.

## Wire shape

```ts
export type ChatPulse = {
  /** Rolling 24-hour totals across every member's channel. */
  totals: {
    messages24h: number;
    subs24h: number;
    bits24h: number;
    activeChattersNow: number;
  };
  /** When the snapshot was assembled. ISO 8601. */
  fetchedAt: string;
  /** "live" when ingest worker is fresh; "mock" when displaying canned numbers. */
  freshness: "live" | "mock";
};
```

## Mock today, live tomorrow

Until the real ingest exists, `getChatPulse()` returns a deterministic
mock keyed by the date — the home page never shows a stale value, and
sponsors looking at the page get a credible-feeling tile rather than a
&mdash; or "coming soon".

The tile carries a small "live ingest pending" chip on the mock so
internal eyes can see the difference. When ingest comes online and
flips `freshness: "live"`, the chip disappears.

## Privacy

Chat content is NEVER persisted to disk. The aggregator counts
messages and discards the message text in the same step. Sub events
keep only the channel + timestamp + tier; usernames are dropped after
counting unique chatters into the 60s bucket.

`docs/STATS.md` covers the public-API stats (subs, views) which are
fundamentally non-personal. This doc covers the IRC/EventSub stream
which is sensitive and always handled in aggregate.
