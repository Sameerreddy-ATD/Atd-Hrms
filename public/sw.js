self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Anytime Diesel Employee Management",
    body: "You have a new update.",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    data: { href: "/notifications" },
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(self.registration.showNotification(payload.title, payload));
  if (self.navigator && "setAppBadge" in self.navigator) {
    event.waitUntil(self.navigator.setAppBadge(1));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (self.navigator && "clearAppBadge" in self.navigator) {
    event.waitUntil(self.navigator.clearAppBadge());
  }
  const targetUrl = event.notification.data?.href || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
