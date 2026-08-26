import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listLoyalty } from "@/lib/oauth/loyalty";
import { memberTargets } from "@/lib/oauth/roster";
import {
  normalizeTwitchLogin,
  twitchTierOnePriceLabel,
  twitchSubscribeHref,
  TWITCH_TIER_ONE_PRICE_NOTE,
  type TwitchSubscriptionVerification,
} from "@/lib/twitch-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnknownReason =
  | "signed_out"
  | "not_synced"
  | "verification_unavailable";

function response(
  login: string,
  verification: TwitchSubscriptionVerification | { status: "unknown"; reason: UnknownReason },
) {
  const result = NextResponse.json({
    ...verification,
    login,
    subscribeHref: twitchSubscribeHref(login),
    tierOnePrice: twitchTierOnePriceLabel(process.env.NEXT_PUBLIC_TWITCH_TIER_ONE_PRICE_LABEL),
    priceNote: TWITCH_TIER_ONE_PRICE_NOTE,
  });
  result.headers.set("Cache-Control", "private, no-store");
  return result;
}

export async function GET(request: Request) {
  const login = normalizeTwitchLogin(new URL(request.url).searchParams.get("login"));
  const target = login
    ? memberTargets().find((candidate) => candidate.twitchLogin === login)
    : null;
  if (!login || !target) {
    const result = NextResponse.json({ error: "unknown Twitch channel" }, { status: 404 });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  }

  const userId = await getCurrentFanUserId();
  if (!userId) return response(login, { status: "unknown", reason: "signed_out" });

  try {
    // Playback never calls Twitch. Account connect/sync is the single place
    // that refreshes this fact; the player reads the persisted result only.
    const cached = (await listLoyalty(userId)).find((fact) => (
      fact.platform === "twitch"
      && fact.subject === target.slug
      && fact.kind === "sub"
    ));
    if (!cached) {
      return response(login, { status: "unknown", reason: "not_synced" });
    }
    if (!cached.value) return response(login, { status: "not_subscribed" });
    const tier = cached.meta?.tier;
    return response(login, {
      status: "subscribed",
      tier: tier === "1000" || tier === "2000" || tier === "3000" ? tier : null,
      gift: cached.meta?.gift === true,
    });
  } catch {
    return response(login, { status: "unknown", reason: "verification_unavailable" });
  }
}
