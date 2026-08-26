self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || "CORE update";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "New creator content is ready.",
    icon: "/favicon.ico", badge: "/favicon.ico", image: payload.artworkUrl || undefined,
    data: { href: payload.href || "/watch" }, tag: payload.tag || undefined, renotify: false,
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close(); const href = event.notification.data && event.notification.data.href ? event.notification.data.href : "/watch";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const client of windows) { if ("focus" in client) { client.navigate(href); return client.focus(); } }
    return clients.openWindow(href);
  }));
});
