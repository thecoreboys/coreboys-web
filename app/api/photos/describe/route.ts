import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/admin-api";
import { cancelAiUsage, reserveAiUsage, settleAiUsage } from "@/lib/ai-usage";

/**
 * AI photo description.
 *
 *   POST /api/photos/describe
 *   body: {
 *     src: "/members/marlon/foo.jpg",
 *     people: [{ name: "Marlon", role: "member" }, ...],
 *     adminNotes?: string,    // optional admin-supplied prompt notes
 *   }
 *
 * Sends the image bytes + structured context to Claude Vision and gets
 * back a one-paragraph description used for the metadata sidebar +
 * AI-mode search.
 *
 * Description is intended to be persisted to `media_descriptions` —
 * the response shape matches that schema.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const PUBLIC = path.join(process.cwd(), "public");

type Body = {
  src?: string;
  people?: Array<{ name: string; role?: string }>;
  adminNotes?: string;
};

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const src = body.src ?? "";
  if (!src.startsWith("/") || src.includes("..")) {
    return NextResponse.json({ error: "invalid src" }, { status: 400 });
  }
  const abs = path.join(PUBLIC, src.replace(/^\//, ""));
  if (!existsSync(abs)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let env: ReturnType<typeof serverEnv>;
  try {
    env = serverEnv();
  } catch {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY missing — describe endpoint disabled" },
      { status: 503 },
    );
  }
  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "anthropic key missing" }, { status: 503 });
  }

  const peopleLine = (body.people ?? [])
    .map((p) => `- ${p.name}${p.role ? ` (${p.role})` : ""}`)
    .join("\n");
  const notesLine = body.adminNotes?.trim() ?? "";

  const ext = path.extname(abs).toLowerCase();
  const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const bytes = readFileSync(abs);
  const base64 = bytes.toString("base64");
  const reservation = await reserveAiUsage({
    provider: "anthropic", feature: "photo_describe", model: "claude-sonnet-4-6", subjectKey: `admin:${auth.id}`,
    estimatedInputTokens: Math.max(4_000, Math.ceil(bytes.length / 1_000)), maxOutputTokens: 400,
  });
  if (!reservation.ok) return NextResponse.json({ error: "AI description is temporarily unavailable." }, { status: reservation.reason === "unavailable" ? 503 : 429 });

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const system = `You write concise photo descriptions for a media organization called CORE. \
Return one well-formed paragraph of 2–4 sentences. Describe what's happening, the setting, \
and any notable visual details. Do not invent identities — only refer to people by name when \
the user has explicitly tagged them in the photo. Do not mention emotions you can't visibly \
verify. Keep it factual and neutral. No markdown.`;

  const userParts: Anthropic.Messages.ContentBlockParam[] = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/jpeg" | "image/png" | "image/webp",
        data: base64,
      },
    },
    {
      type: "text",
      text: [
        peopleLine ? `Tagged in this photo:\n${peopleLine}` : "No people are tagged.",
        notesLine ? `\nAdditional admin notes:\n${notesLine}` : "",
        "\nDescribe the photo as one paragraph.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: userParts }],
    });

    const description = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    await settleAiUsage(reservation.reservationId, {
      model: "claude-sonnet-4-6", inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens,
    }).catch(() => undefined);

    return NextResponse.json({
      description,
      generatedBy: "claude_vision",
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    await cancelAiUsage(reservation.reservationId).catch(() => undefined);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "anthropic call failed" },
      { status: 502 },
    );
  }
}
