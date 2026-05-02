import { NextResponse } from "next/server";
import { fetchUsersByLogin } from "@/lib/twitch";

/**
 * Resolves a single Twitch login to its public user record:
 *   { id, login, displayName, profileImageUrl }
 *
 * Used by the /chat hub when the viewer adds a non-CORE channel —
 * the BTTV / 7TV emote APIs key off Twitch user IDs, so the chat
 * client needs the ID before it can subscribe.
 */
export const revalidate = 3600;

type Params = { params: Promise<{ login: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { login } = await params;
  const cleaned = (login ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!cleaned) {
    return NextResponse.json({ error: "invalid login" }, { status: 400 });
  }
  try {
    const users = await fetchUsersByLogin([cleaned]);
    const u = users[cleaned];
    if (!u) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        id: u.id,
        login: u.login,
        displayName: u.display_name,
        profileImageUrl: u.profile_image_url ?? null,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "lookup failed" }, { status: 502 });
  }
}
