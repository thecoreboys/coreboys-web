const POST_PATH = /^\/(p|reel|reels|tv)\/([a-zA-Z0-9_-]{5,32})\/?$/;

function safeInstagramPostUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.instagram.com", "instagram.com"].includes(url.hostname.toLowerCase())) return null;
    const match = POST_PATH.exec(url.pathname);
    if (!match) return null;
    return `https://www.instagram.com/${match[1]}/${match[2]}/`;
  } catch {
    return null;
  }
}

function safeInstagramImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isInstagramCdn = host === "cdninstagram.com"
      || host.endsWith(".cdninstagram.com")
      || host === "fbcdn.net"
      || host.endsWith(".fbcdn.net");
    return url.protocol === "https:" && !url.username && !url.password && isInstagramCdn ? url.toString() : null;
  } catch {
    return null;
  }
}

function openGraphImage(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map((match) => [match[1]!.toLowerCase(), match[3]!]));
    if ((attributes.get("property") ?? attributes.get("name"))?.toLowerCase() !== "og:image") continue;
    const content = attributes.get("content");
    if (!content) continue;
    return safeInstagramImageUrl(content.replace(/&amp;/gi, "&").replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (entity, hex: string | undefined, decimal: string | undefined) => {
      const point = hex ? parseInt(hex, 16) : Number(decimal);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }));
  }
  return null;
}

export async function GET(request: Request) {
  const shareUrl = safeInstagramPostUrl(new URL(request.url).searchParams.get("url"));
  if (!shareUrl) return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });

  try {
    // oEmbed no longer provides a reliable thumbnail. The public post's
    // social-sharing metadata is a best-effort fallback to stored artwork.
    // Never follow a redirect to a sign-in/challenge page or call a paid API.
    const response = await fetch(shareUrl, {
      headers: { accept: "text/html" },
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
      next: { revalidate: 300 },
    });
    if (!response.ok) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    if (!response.headers.get("content-type")?.includes("text/html")) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    // Bound the document read even when Content-Length is absent or incorrect.
    const reader = response.body?.getReader();
    if (!reader) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    const decoder = new TextDecoder();
    let bytes = 0;
    let html = "";
    try {
      while (bytes < 1_000_000 && !html.includes("</head>")) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value.subarray(0, Math.max(0, 1_000_000 - (bytes - value.byteLength))), { stream: true });
      }
    } finally { await reader.cancel(); }
    const thumbnailUrl = openGraphImage(html);
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
