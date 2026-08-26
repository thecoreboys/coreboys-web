import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildSystemPrompt } from "@/lib/concierge-prompt";
import { cancelAiUsage, reserveAiUsage, settleAiUsage } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/concierge
 *
 * Streams Claude responses for the on-site Concierge. Uses prompt caching on
 * the system message (the brand voice + MEMBERS/CREW data set is large) so
 * subsequent calls within the 5-minute TTL cost ~10% of the cached tokens.
 *
 * Rate limit: per-IP, in-memory, 20 messages per hour. For a deployment that
 * scales beyond a single instance, swap to Upstash Redis (the LIMIT_KV env
 * is reserved for that).
 */
const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(20),
});

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipBuckets.set(ip, bucket);
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return {
    ok: true,
    remaining: RATE_LIMIT_MAX - bucket.count,
    resetAt: bucket.resetAt,
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 503 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate limit reached", resetAt: new Date(limit.resetAt).toISOString() },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": new Date(limit.resetAt).toISOString(),
        },
      },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "invalid body", details: err }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const system = buildSystemPrompt();
  const estimatedInputTokens = Math.ceil((system.length + JSON.stringify(body.messages).length) / 4) + 350;
  const reservation = await reserveAiUsage({
    provider: "anthropic", feature: "concierge", model: "claude-haiku-4-5-20251001",
    subjectKey: `ip:${ip}`, estimatedInputTokens, maxOutputTokens: 400,
  });
  if (!reservation.ok) {
    return NextResponse.json({ error: "AI assistant is temporarily unavailable." }, { status: reservation.reason === "unavailable" ? 503 : 429 });
  }

  // Pull the current /v1/live for grounding "who's live" answers.
  let liveContext = "";
  try {
    const url = new URL(req.url);
    url.pathname = "/api/twitch/live";
    url.search = "";
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { live?: { login: string; isLive: boolean }[] };
      const liveSlugs = data.live?.filter((l) => l.isLive).map((l) => l.login) ?? [];
      liveContext = `\n# Right now\nLive count: ${liveSlugs.length}.${
        liveSlugs.length > 0 ? ` Live: ${liveSlugs.join(", ")}.` : ""
      }`;
    }
  } catch {
    // grounding is best-effort; ignore failures.
  }

  let stream: ReturnType<typeof client.messages.stream>;
  try {
    stream = client.messages.stream({
      model: "claude-haiku-4-5-20251001", max_tokens: 400,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }, ...(liveContext ? [{ type: "text" as const, text: liveContext }] : [])],
      messages: body.messages,
    });
  } catch (error) {
    await cancelAiUsage(reservation.reservationId);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI request failed." }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`),
            );
          }
        }
        await settleAiUsage(reservation.reservationId, { model: "claude-haiku-4-5-20251001", inputTokens: estimatedInputTokens, outputTokens: 400 }).catch(() => undefined);
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      } catch (err) {
        await cancelAiUsage(reservation.reservationId).catch(() => undefined);
        const msg = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-RateLimit-Remaining": String(limit.remaining),
    },
  });
}
