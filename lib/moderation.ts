/**
 * Server-only content moderation for fan postcards. Because the mail is
 * delivered to the crew (not strangers) the bar is "don't waste money
 * printing spam/garbage", not strict safety. Two layers:
 *
 *   1. A fast local profanity + spam check (always on, no network).
 *   2. An optional LLM pass via the Anthropic API when ANTHROPIC_API_KEY
 *      is set (catches obfuscated/evasive junk). Fails OPEN — if the LLM
 *      call errors we fall back to the local result rather than blocking.
 */
import { Filter } from "bad-words";
import { cancelAiUsage, reserveAiUsage, settleAiUsage } from "@/lib/ai-usage";

export type ModerationResult = { ok: boolean; reason?: string };

let _filter: Filter | null = null;
function filter(): Filter {
  if (!_filter) _filter = new Filter();
  return _filter;
}

/** Synchronous local check — profanity + obvious spam heuristics. */
export function moderateTextLocal(text: string): ModerationResult {
  const t = (text ?? "").trim();
  if (!t) return { ok: false, reason: "Message is empty." };
  try {
    if (filter().isProfane(t)) {
      return { ok: false, reason: "Message contains language we can't print." };
    }
  } catch {
    /* bad-words init issue — skip the profanity layer, keep spam checks */
  }
  const links = (t.match(/https?:\/\/|www\.|\.com\b|\.net\b/gi) ?? []).length;
  if (links > 2) return { ok: false, reason: "Too many links — looks like spam." };
  // Long runs of the same character ("aaaaaaaa", "!!!!!!!!").
  if (/(.)\1{14,}/.test(t)) return { ok: false, reason: "That doesn't look like a real message." };
  return { ok: true };
}

/**
 * Optional LLM moderation. Returns the local result immediately when no
 * ANTHROPIC_API_KEY is configured. Never throws.
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  const local = moderateTextLocal(text);
  if (!local.ok) return local;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return local; // local-only when no LLM configured
  const reservation = await reserveAiUsage({ provider: "anthropic", feature: "postcard_moderation", model: "claude-haiku-4-5-20251001", estimatedInputTokens: Math.ceil(text.length / 4) + 180, maxOutputTokens: 8 });
  if (!reservation.ok) return local;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8,
        system:
          "You screen short fan postcard messages before they are printed and mailed to a creator group. " +
          "Reply with exactly ALLOW or BLOCK. BLOCK only for hate, threats, sexual content involving minors, " +
          "doxxing, or obvious spam/scam. Ordinary fan enthusiasm, mild language, and jokes are ALLOW.",
        messages: [{ role: "user", content: text.slice(0, 1500) }],
      }),
      // Don't let moderation hang the checkout for long.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return local;
    const json = (await res.json()) as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    await settleAiUsage(reservation.reservationId, { model: "claude-haiku-4-5-20251001", inputTokens: json.usage?.input_tokens ?? 200, outputTokens: json.usage?.output_tokens ?? 8 }).catch(() => undefined);
    const verdict = (json.content?.[0]?.text ?? "").toUpperCase();
    if (verdict.includes("BLOCK")) {
      return { ok: false, reason: "Message flagged by our content check." };
    }
    return { ok: true };
  } catch {
    await cancelAiUsage(reservation.reservationId).catch(() => undefined);
    return local; // fail open
  }
}
