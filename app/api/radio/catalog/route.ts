import { NextResponse } from "next/server";
import { getPublicRadioCueCatalog } from "@/lib/radio/catalog";
import { isRadioNetworkSlug } from "@/lib/radio/public-catalog";

export const runtime = "nodejs";
export const revalidate = 45;

/**
 * App-session preload manifest. The client fetches this once, then a station
 * tune can still be selected synchronously inside the user's click gesture.
 */
export async function GET(request: Request) {
  const requestedNetwork = new URL(request.url).searchParams.get("network");
  if (requestedNetwork && !isRadioNetworkSlug(requestedNetwork)) {
    return NextResponse.json({ error: "invalid_radio_network" }, { status: 400 });
  }
  const networkSlug = requestedNetwork && isRadioNetworkSlug(requestedNetwork)
    ? requestedNetwork
    : undefined;
  const assets = await getPublicRadioCueCatalog(networkSlug);
  return NextResponse.json({ assets, fetchedAt: new Date().toISOString() }, {
    headers: {
      "Cache-Control": "public, max-age=45, stale-while-revalidate=45",
    },
  });
}
