// Read-only HTTP checks. Use a production server for comparable timings;
// development compilation and upstream provider latency distort cold runs.
const base = new URL(process.argv[2] || "http://127.0.0.1:3000");
if (!["http:", "https:"].includes(base.protocol)) throw new Error("Expected an HTTP(S) base URL");
const paths = process.argv.slice(3);
const routes = paths.length ? paths : ["/", "/channels/core", "/channels/ron?mode=continuous", "/guide", "/shorts", "/theater", "/legal/privacy", "/api/watch/guide"];
const results = [];
for (const path of routes) {
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error("All routes must use the same origin");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const start = performance.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45_000), redirect: "manual" });
      const headersMs = performance.now() - start;
      const body = await response.arrayBuffer();
      results.push({ route: path, attempt, status: response.status,
        headersMs: Math.round(headersMs), completeMs: Math.round(performance.now() - start),
        decodedBytes: body.byteLength, cacheControl: response.headers.get("cache-control"),
        contentEncoding: response.headers.get("content-encoding"),
      });
      if (response.status >= 400) process.exitCode = 1;
    } catch (error) {
      results.push({ route: path, attempt, error: error instanceof Error ? error.message : "Request failed" });
      process.exitCode = 1;
    }
  }
}
console.log(JSON.stringify({ base: base.origin, measuredAt: new Date().toISOString(), results }, null, 2));
