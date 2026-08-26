import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { createXPostNomination, listApprovedXPostNominations, listMyXPostNominations } from "@/lib/x/nominations";
import { isXCommunityKey } from "@/lib/x/parsing";
import { requestHasSameOrigin } from "@/lib/x/security";
import { X_COMMUNITY_KEYS } from "@/lib/x/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  postUrl: z.string().trim().url().max(300),
  communityKey: z.enum(X_COMMUNITY_KEYS),
  note: z.string().trim().max(280).optional(),
  consent: z.literal(true),
}).strict();

function noStore(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mine = url.searchParams.get("mine") === "1";
  const key = url.searchParams.get("community");
  if (key && !isXCommunityKey(key)) return noStore({ error: "unknown community" }, 400);
  if (mine) {
    const userId = await getCurrentFanUserId();
    if (!userId) return noStore({ error: "unauthorized" }, 401);
    return noStore({ nominations: await listMyXPostNominations(userId) });
  }
  const communityKey = key && isXCommunityKey(key) ? key : null;
  const nominations = await listApprovedXPostNominations(communityKey, 36);
  return NextResponse.json(
    { nominations },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return noStore({ error: "Invalid request origin." }, 403);
  const userId = await getCurrentFanUserId();
  if (!userId) return noStore({ error: "Sign in to nominate an X post." }, 401);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "Enter a valid X post and community." }, 400);
  try {
    const result = await createXPostNomination({
      userId,
      postUrl: parsed.data.postUrl,
      communityKey: parsed.data.communityKey,
      note: parsed.data.note,
      consentVersion: "x-nomination-v1",
    });
    if ("rateLimited" in result) {
      const response = noStore({ error: "You reached today’s nomination limit." }, 429);
      response.headers.set("Retry-After", "3600");
      return response;
    }
    return noStore(result, result.created ? 201 : 200);
  } catch (error) {
    return noStore({ error: error instanceof Error && error.message === "invalid_post_url" ? "Use a direct X post URL." : "Nominations are temporarily unavailable." }, 400);
  }
}
