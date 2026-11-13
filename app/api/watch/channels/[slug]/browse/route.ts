import { NextResponse } from "next/server";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildNetworkChannelHub, resolveNetworkChannel } from "@/lib/watch/channels";
import {
  BROWSE_PAGE_SIZE,
  browseCoverage,
  browseFacets,
  browseItemKey,
  browseSignalNote,
  filterBrowseItems,
  parseBrowseFilters,
  rankBrowseItems,
} from "@/lib/watch/channel-browse";
import { loadBrowseSignals } from "@/lib/watch/channel-browse-signals";

export const dynamic = "force-dynamic";

const MAX_OFFSET = 20_000;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const channel = resolveNetworkChannel((await params).slug);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const search = new URL(request.url).searchParams;
  const filters = parseBrowseFilters(search);
  const offset = Math.max(0, Math.min(MAX_OFFSET, Number.parseInt(search.get("offset") ?? "0", 10) || 0));
  try {
    const now = Date.now();
    const catalog = await getWatchCatalog();
    const hub = buildNetworkChannelHub(catalog, channel);
    const facets = browseFacets(hub.all, filters);
    const filtered = filterBrowseItems(hub.all, filters, now);
    const signals = await loadBrowseSignals(filtered, filters, now);
    const ranked = rankBrowseItems(filtered, signals, filters.sort);
    const coverage = browseCoverage(filtered, signals, filters.sort);
    const page = ranked.slice(offset, offset + BROWSE_PAGE_SIZE);
    return NextResponse.json({
      filters,
      facets,
      total: ranked.length,
      offset,
      nextOffset: offset + page.length < ranked.length ? offset + page.length : null,
      note: browseSignalNote(filters, coverage),
      coverage,
      items: page.map(({ item, rank }) => ({ item, rank, signal: signals[browseItemKey(item)] ?? null })),
    }, {
      // Rankings only move on provider refresh; a short shared cache keeps
      // filter taps instant without hiding a newly published video for long.
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "This channel's library could not be loaded. Please try again." }, { status: 503 });
  }
}
