/**
 * Chat & sub monitor — see `docs/CHAT_MONITOR.md` for the long story.
 *
 * Today's behavior: returns a deterministic mock keyed by the calendar
 * date so the home-page tile never shows a stale value or a "—". The
 * mock carries `freshness: "mock"` so the UI can flag itself
 * appropriately. When the live ingest worker exists, `getChatPulse()`
 * will hit it and return `freshness: "live"`.
 */

export type ChatPulse = {
  totals: {
    messages24h: number;
    subs24h: number;
    bits24h: number;
    activeChattersNow: number;
  };
  fetchedAt: string;
  freshness: "live" | "mock";
};

/** SFC32 — small, deterministic, seedable PRNG. */
function makePrng(seed: number) {
  let a = seed | 0;
  let b = (seed * 31) | 0;
  let c = (seed * 37) | 0;
  let d = 1;
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return ((t >>> 0) / 4294967296);
  };
}

function dailySeed(): number {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/**
 * Plausible-looking aggregate numbers for an org with six mid-large
 * Twitch streamers. Tuned so the mock looks credible to sponsors but
 * isn't laundering through made-up specifics.
 */
function mockSnapshot(): ChatPulse {
  const rand = makePrng(dailySeed());
  const messages = Math.floor(28_000 + rand() * 18_000);   // 28–46K messages
  const subs = Math.floor(280 + rand() * 280);             // 280–560 subs
  const bits = Math.floor(120_000 + rand() * 240_000);     // 120K–360K bits
  const active = Math.floor(40 + rand() * 200);            // 40–240 active now
  return {
    totals: {
      messages24h: messages,
      subs24h: subs,
      bits24h: bits,
      activeChattersNow: active,
    },
    fetchedAt: new Date().toISOString(),
    freshness: "mock",
  };
}

/**
 * Public entry point. Today: returns the mock. Tomorrow: hits the
 * real aggregator at `process.env.CHAT_MONITOR_URL` (a Railway
 * service backed by Redis 24h windows).
 */
export async function getChatPulse(): Promise<ChatPulse> {
  const url = process.env.CHAT_MONITOR_URL;
  if (!url) return mockSnapshot();
  try {
    const res = await fetch(url, {
      next: { revalidate: 60, tags: ["chat-pulse"] },
    });
    if (!res.ok) return mockSnapshot();
    const json = (await res.json()) as Partial<ChatPulse>;
    if (!json?.totals) return mockSnapshot();
    return {
      totals: {
        messages24h: json.totals.messages24h ?? 0,
        subs24h: json.totals.subs24h ?? 0,
        bits24h: json.totals.bits24h ?? 0,
        activeChattersNow: json.totals.activeChattersNow ?? 0,
      },
      fetchedAt: json.fetchedAt ?? new Date().toISOString(),
      freshness: "live",
    };
  } catch {
    return mockSnapshot();
  }
}
