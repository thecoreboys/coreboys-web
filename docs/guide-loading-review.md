# Guide loading review — 2026-11-09

Changes are local. Do not push or deploy until the owner explicitly releases the accumulated updates.

## Findings

- The normal Guide page and its polling response both carried the complete archive. A real 4,933-item catalog produced an 11,037,845-byte packed JSON payload (1,940,957 bytes with gzip).
- Opening the page started the year-long airtime heatmap and its database reads even when nobody opened history.
- The browser recomputed linear schedules from every channel library and rendered timeline cards far outside the visible horizontal area. The one-second live clock revisited that large tree.
- The archive refreshed every 20 seconds alongside a separate recent/live catalog, duplicating expensive historical work. A completely cold full catalog took 10.9 seconds in the isolated local source profile.

## Changes

- Calculate the continuous schedule on the server with the full source archive. Transfer only the requested date window and its referenced playback items. Initial coverage is 26 hours back and 18 hours ahead, sufficient for the current local day in any timezone within the planning horizon.
- Date paging requests another bounded window (maximum eight days). The legacy API response remains compatible with existing playback tools.
- Populate the Guide from its server snapshot immediately. Background refresh keeps the same data visible; it does not download every historical channel library.
- Start the selected video immediately and hydrate only that channel's complete queue on intent. Queue failures expose an explicit retry while playback continues.
- Render timeline cards within the horizontal viewport plus 512 pixels of overscan. Full date geometry, drag scrolling, zoom, and arrow navigation remain available.
- Fetch and dynamically load Airtime history only after View history is selected.
- Keep historical catalog data fresh for five minutes, with the existing six-hour stale fallback. Current live status/new uploads still use the separate 20-second recent snapshot, and durable deletion checks still run after shared-cache retrieval.
- Share the public in-memory cache across server bundles. Startup warmup was removed after a local test returned an incomplete archive outside the normal request context.
- Shorts and Tonight start with the bounded recent catalog. Chat and Multiview do the same when no specific historical item/layout is requested. Explicit archived references still load the complete source catalogue.
- Tonight requests dated events without linear channel libraries.

## Verification

- Tests compare windowed linear airings with the full archive, page into historical dates, preserve signed media through packing, reject oversized windows, and verify full queue hydration after selection.
- A conservative 66-hour window on the real catalog produced 3,027,729 bytes of JSON / 510,273 bytes with gzip, about 74% less transfer than the full snapshot. The normal initial window is smaller (44 hours). These are source/transport measurements, not production Core Web Vitals.
- An optimized build passed. The startup-warmup experiment produced an incomplete archive, so its very fast HTTP timings are not representative and the experiment was removed. Cold full-archive loading remains an outstanding bottleneck.

## Release limits

The production website has not changed yet. Recheck cold/warm timing, cache readiness, and origin/CDN behavior on Azure after the owner authorizes deployment. Optional provider outages and external embeds can still take longer than the page itself.
