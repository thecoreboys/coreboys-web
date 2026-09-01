import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { cancelAiUsage, reserveAiUsage, settleAiUsage } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const revalidate = 90;

/**
 * GET /api/stream-context/:login
 *
 * Generates a one-sentence brand-voice summary of what's currently happening
 * on a member's Twitch stream, using Claude Haiku.
 *
 * Inputs (all best-effort, gathered server-side):
 *   - The current /api/twitch/live record for that login
 *   - (TODO) the last ~30 chat messages via Twitch IRC sample
 *
 * Output: { summary: string, source: "ai" | "fallback" }.
 *
 * If ANTHROPIC_API_KEY is missing or the call fails, we fall back to the
 * stream's game/category text — never block the live card on AI.
 */

type LiveEntry = {
  login: string;
  isLive: boolean;
  title?: string;
  game?: string;
  viewerCount?: number;
};

type CacheEntry = { summary: string; source: "ai" | "fallback"; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 90_000;
const CACHE_HEADERS = {
  // Keep the public response aligned with the in-process cache. Without this,
  // fallback and cache-hit responses miss the CDN cache even though their
  // source data is already intentionally shared for this window.
  "Cache-Control": "public, s-maxage=90, stale-while-revalidate=180",
};

function cachedJson(entry: CacheEntry) {
  return NextResponse.json(entry, { headers: CACHE_HEADERS });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ login: string }> },
) {
  const { login } = await ctx.params;
  const key = login.toLowerCase();
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cachedJson(cached);
  }

  const live = await getLiveEntry(req, login);
  if (!live || !live.isLive) {
    return NextResponse.json(
      { summary: "Not live.", source: "fallback" as const },
      { status: 200 },
    );
  }

  const fallback = live.game ? live.game : "Streaming.";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const entry = { summary: fallback, source: "fallback" as const, expiresAt: now + TTL_MS };
    cache.set(key, entry);
    return cachedJson(entry);
  }
  const reservation = await reserveAiUsage({ provider: "anthropic", feature: "stream_context", model: "claude-haiku-4-5-20251001", subjectKey: `stream:${key}`, estimatedInputTokens: 500, maxOutputTokens: 60 });
  if (!reservation.ok) {
    const entry = { summary: fallback, source: "fallback" as const, expiresAt: now + TTL_MS };
    cache.set(key, entry);
    return cachedJson(entry);
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      system:
        "You write one-sentence summaries of Twitch streams in CORE brand voice: declarative, no emojis, no hype words, no exclamation marks, max 14 words. Lead with what's happening, not how the streamer feels about it.",
      messages: [
        {
          role: "user",
          content: [
            `Twitch login: ${login}`,
            `Title: ${live.title ?? "(no title)"}`,
            `Game / category: ${live.game ?? "(unknown)"}`,
            `Viewers: ${live.viewerCount ?? "?"}`,
            "",
            "Write the one-sentence summary now. Output only the sentence.",
          ].join("\n"),
        },
      ],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "");
    await settleAiUsage(reservation.reservationId, { model: "claude-haiku-4-5-20251001", inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens }).catch(() => undefined);

    const summary = text || fallback;
    const entry = { summary, source: "ai" as const, expiresAt: now + TTL_MS };
    cache.set(key, entry);
    return cachedJson(entry);
  } catch (err) {
    await cancelAiUsage(reservation.reservationId).catch(() => undefined);
    console.error("[stream-context]", err);
    const entry = { summary: fallback, source: "fallback" as const, expiresAt: now + TTL_MS };
    cache.set(key, entry);
    return cachedJson(entry);
  }
}

async function getLiveEntry(req: NextRequest, login: string): Promise<LiveEntry | null> {
  try {
    const url = new URL(req.url);
    url.pathname = "/api/twitch/live";
    url.search = "";
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { live?: LiveEntry[] };
    return data.live?.find((l) => l.login.toLowerCase() === login.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}
