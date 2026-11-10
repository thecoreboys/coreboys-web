import { extractPublicTikTokPosts } from "@/lib/tiktok-public";

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
    }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => null) as { thumbnail_url?: unknown } | null : null;
    let thumbnailUrl = safeTikTokImageUrl(data?.thumbnail_url);
    if (thumbnailUrl && /\.hei[cf](?:[?#]|$)/i.test(thumbnailUrl)) thumbnailUrl = null;
    if (!thumbnailUrl) {
      // TikTok's current oEmbed response can omit the cover. Its public post
      // document may still contain a fresh image for this exact video.
      const match = VIDEO_PATH.exec(new URL(shareUrl).pathname)!;
      const page = await fetch(shareUrl, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; COREMediaBot/1.0; +https://thecoreboys.com)", accept: "text/html", "accept-language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(4_000),
        next: { revalidate: 300 },
      });
      if (page.ok && Number(page.headers.get("content-length") ?? 0) <= 2_000_000) {
        const html = await page.text();
        const posts = html.length <= 2_000_000 ? extractPublicTikTokPosts(html, match[1]!, 64) : [];
        thumbnailUrl = safeTikTokImageUrl(posts.find((post) => post.id === match[2])?.thumbnailUrl);
        if (thumbnailUrl && /\.hei[cf](?:[?#]|$)/i.test(thumbnailUrl)) thumbnailUrl = null;
      }
    }
    if (!thumbnailUrl) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

    return new Response(null, {
      status: 302,
      headers: {
        Location: thumbnailUrl,
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
