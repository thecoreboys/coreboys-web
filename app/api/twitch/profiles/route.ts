import { NextResponse } from "next/server";
import { fetchUsersByLogin } from "@/lib/twitch";
import { MEMBERS } from "@/lib/members";

/**
 * Returns a `{ login: profile_image_url }` map for all six members.
 * Used by client components (TopNav, hero strip) so they can render
 * the canonical Twitch avatar without each component issuing its
 * own Helix call.
 *
 * Response is cached at the edge for 1h.
 */
export const revalidate = 3600;

export async function GET() {
  const logins = MEMBERS.map((m) => m.twitchLogin);
  try {
    const users = await fetchUsersByLogin(logins);
    const out: Record<string, string> = {};
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) out[login] = u.profile_image_url;
    }
    return NextResponse.json(
      { profiles: out, fetchedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      },
    );
  } catch {
    return NextResponse.json({ profiles: {}, fetchedAt: new Date().toISOString() });
  }
}
