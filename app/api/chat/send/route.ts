import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { sendTwitchChat } from "@/lib/oauth/chat-send";
import { fetchLiveStreams } from "@/lib/twitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  message: z.string().min(1).max(500),
  /** Explicit recipients used by the modern composer. */
  targets: z.array(z.string().min(1).max(40)).min(1).max(8).optional(),
  /** Backwards compatibility for older clients. */
  target: z.string().min(1).max(40).optional(),
  channels: z.array(z.string().min(1).max(40)).max(8).optional(),
  replyParentMessageId: z.string().min(1).max(120).optional(),
}).refine((value) => Boolean(value.targets?.length || value.target), {
  message: "Choose at least one chat.",
});

export async function POST(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "Sign in to send chat." }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }

  let targets: string[] = [];
  if (body.target === "live") {
    const pool = (body.channels ?? []).map((c) => c.toLowerCase());
    if (pool.length === 0) {
      return NextResponse.json({ error: "No channels to send to." }, { status: 400 });
    }
    const live = await fetchLiveStreams(pool);
    for (const s of live) targets.push(s.user_login.toLowerCase());
    if (targets.length === 0) {
      return NextResponse.json({ error: "Nobody on that list is live." }, { status: 409 });
    }
  } else if (body.targets?.length) {
    targets = body.targets.map((target) => target.toLowerCase());
  } else if (body.target) {
    targets.push(body.target.toLowerCase());
  }

  targets = [...new Set(targets.map((target) => target.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 8);
  if (targets.length === 0) {
    return NextResponse.json({ error: "Choose at least one chat." }, { status: 400 });
  }

  const results = [];
  for (const login of targets) {
    results.push(
      await sendTwitchChat(uid, login, body.message, {
        waitForRateLimit: targets.length > 1,
        replyParentMessageId: targets.length === 1 ? body.replyParentMessageId : undefined,
      }),
    );
  }
  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;
  const ok = succeeded > 0;
  const complete = failed === 0;
  const status = complete ? 200 : ok ? 207 : 400;
  return NextResponse.json(
    { ok, complete, attempted: results.length, succeeded, failed, results },
    { status },
  );
}
