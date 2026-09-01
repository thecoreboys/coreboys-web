/*
 * This worker deliberately mirrors the small client-side notification target
 * resolver. It cannot import application modules, so keep this logic limited
 * to validated provider permalink parsing. Canonical URLs stay in the event
 * payload; only the click destination is translated to a CORE route.
 */
function safeHttpUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch { return null; }
}

function previewHref(source, payload) {
  const query = new URLSearchParams({ url: source });
  const title = typeof payload.body === "string" && payload.body.trim()
    ? payload.body.trim()
    : typeof payload.title === "string" ? payload.title.trim() : "CORE update";
  if (title) query.set("title", title.slice(0, 240));
  if (typeof payload.previewBody === "string" && payload.previewBody.trim()) query.set("body", payload.previewBody.trim().slice(0, 500));
  if (typeof payload.artworkUrl === "string" && /^https:\/\//i.test(payload.artworkUrl)) query.set("image", payload.artworkUrl.slice(0, 2000));
  return `/preview?${query.toString()}`;
}

function theaterHref(kind, id, source, options) {
  const query = new URLSearchParams({ kind, id, ref: options.ref || id, src: options.src, url: source });
  if (options.login) query.set("login", options.login);
  if (options.format) query.set("format", options.format);
  if (options.orientation) query.set("orientation", options.orientation);
  if (typeof options.title === "string" && options.title.trim()) query.set("title", options.title.trim().slice(0, 240));
  return `/theater?${query.toString()}`;
}

function notificationTarget(payload) {
  const href = typeof payload.href === "string" ? payload.href.trim() : "";
  if (href.startsWith("/theater?")) return href;
  const live = /^\/watch\/live\/([^/?#]+)/i.exec(href);
  if (live && /^[a-z0-9_]{2,40}$/i.test(live[1])) {
    const login = live[1].toLowerCase();
    return theaterHref("live", login, href, { src: "twitch", login, title: payload.body || payload.title });
  }
  if (href.startsWith("/") && !href.startsWith("//")) return href || "/watch";
  const url = safeHttpUrl(href);
  if (!url) return "/watch";
  const source = url.toString();
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const title = payload.body || payload.title;
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com")) {
    const id = host === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : /\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/i.exec(url.pathname)?.[1] || url.searchParams.get("v");
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
      const short = /\/shorts\//i.test(url.pathname);
      return theaterHref("youtube", id, source, { src: "youtube", ref: `yt-${id}`, title, format: short ? "short" : "long", orientation: short ? "portrait" : undefined });
    }
  }
  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "clips.twitch.tv" && parts[0]) return theaterHref("clip", parts[0], source, { src: "twitch", ref: `clip-twitch-${parts[0]}`, title, format: "short" });
    if (parts[0] === "videos" && /^\d+$/.test(parts[1] || "")) return theaterHref("vod", parts[1], source, { src: "twitch", ref: `vod-${parts[1]}`, title, format: "long" });
    if (/^[a-z0-9_]{2,40}$/i.test(parts[0] || "")) {
      const login = parts[0].toLowerCase();
      return theaterHref("live", login, source, { src: "twitch", login, ref: `live-${login}`, title, format: "live" });
    }
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const id = /tiktok\.com\/[^/]+\/video\/(\d+)/i.exec(source)?.[1] || /\/(?:player\/v1|embed\/v2|video)\/(\d+)/i.exec(source)?.[1];
    if (id) return theaterHref("clip", id, source, { src: "tiktok", ref: `tiktok-${id}`, title, format: "short", orientation: "portrait" });
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const match = /\/(reel|reels|p|tv)\/([^/?#]+)/i.exec(url.pathname);
    if (match?.[2]) {
      const photo = match[1].toLowerCase() === "p";
      return theaterHref("clip", match[2], source, { src: "instagram", ref: `instagram-${match[2]}`, title, format: photo ? "long" : "short", orientation: photo ? "square" : "portrait" });
    }
  }
  // X and every unrecognized external document open in CORE's first-party
  // preview. Only the explicit button in that view may leave the site.
  return previewHref(source, payload);
}

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || "CORE update";
  const href = notificationTarget(payload);
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "New creator content is ready.",
    icon: "/favicon.ico", badge: "/favicon.ico", image: payload.artworkUrl || undefined,
    data: { href }, tag: payload.tag || undefined, renotify: false,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data && event.notification.data.href ? event.notification.data.href : "/watch";
  const destination = new URL(href, self.location.origin).toString();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const client of windows) {
      if ("focus" in client) {
        client.navigate(destination);
        return client.focus();
      }
    }
    return clients.openWindow(destination);
  }));
});
