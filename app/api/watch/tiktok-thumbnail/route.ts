const VIDEO_PATH = /^\/@([a-zA-Z0-9._]{1,50})\/video\/(\d{12,24})\/?$/;

function safeTikTokVideoUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.tiktok.com", "tiktok.com"].includes(url.hostname.toLowerCase())) return null;
    const match = VIDEO_PATH.exec(url.pathname);
    if (!match) return null;
    return `https://www.tiktok.com/@${match[1]}/video/${match[2]}`;
  } catch {
    return null;
  }
}

function safeTikTokImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isTikTokCdn = host === "tiktokcdn.com"
      || host.endsWith(".tiktokcdn.com")
      || host === "tiktokcdn-us.com"
      || host.endsWith(".tiktokcdn-us.com")
      || host === "tiktokcdn-eu.com"
      || host.endsWith(".tiktokcdn-eu.com")
      || host === "muscdn.com"
      || host.endsWith(".muscdn.com");
    return url.protocol === "https:" && !url.username && !url.password && isTikTokCdn ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const shareUrl = safeTikTokVideoUrl(new URL(request.url).searchParams.get("url"));
  if (!shareUrl) return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });

  try {
    const endpoint = new URL("https://www.tiktok.com/oembed");
    endpoint.searchParams.set("url", shareUrl);
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
      next: { revalidate: 300 },
    });
    if (!response.ok) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    const data = await response.json() as { thumbnail_url?: unknown };
    const thumbnailUrl = safeTikTokImageUrl(data.thumbnail_url);
    if (!thumbnailUrl) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });

    return new Response(null, {
      status: 302,
      headers: {
        Location: thumbnailUrl,
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  }
}
