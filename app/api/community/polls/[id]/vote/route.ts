import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { castRankedVote, castVote, getPoll } from "@/lib/community";
import { buildLoyaltyCard, listLoyalty } from "@/lib/oauth/loyalty";
import { checkPassportPollAudience } from "@/lib/passport/polls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VoteBody = z.union([
  z.object({ optionId: z.string().uuid() }),
  z.object({ ranking: z.array(z.string().uuid()).min(2).max(8) }),
]);

/**
 * Feature 2 — fan casts a single vote. One vote per user per poll
 * (DB PK). A fresh vote awards +10 points idempotently. Returns the
 * refreshed live results.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: z.infer<typeof VoteBody>;
  try {
    body = VoteBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const currentPoll = await getPoll(id, uid);
  if (!currentPoll) return NextResponse.json({ error: "poll not found" }, { status: 404 });
  const audience=await checkPassportPollAudience(id,uid);
  if(!audience.allowed)return NextResponse.json({error:audience.reason ?? "not_eligible"},{status:403});
  const facts = await listLoyalty(uid);
  const card = buildLoyaltyCard(facts, null);
  const weight = card.houseStatus === "super" ? 5 : 4;
  const result = currentPoll.kind === "ranked"
    ? "ranking" in body
      ? await castRankedVote(id, body.ranking, uid, weight)
      : { ok: false as const, reason: "bad_option" as const }
    : "optionId" in body
      ? await castVote(id, body.optionId, uid, weight)
      : { ok: false as const, reason: "bad_option" as const };
  if (!result.ok) {
    if (result.reason === "not_found")
      return NextResponse.json({ error: "poll not found" }, { status: 404 });
    if (result.reason === "already_voted")
      return NextResponse.json({ error: "already voted" }, { status: 409 });
    // closed | bad_option
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  const poll = await getPoll(id, uid);
  return NextResponse.json(
    { ok: true, results: poll },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
