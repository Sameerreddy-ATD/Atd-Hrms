self.ATD_STATIC_CACHE = "atd-static-v3";
self.ATD_SHELL_ASSETS = [
  "/atd-logo.png",
  "/atd-favicon.png",
  "/pwa-192.png",
  "/pwa-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(self.ATD_STATIC_CACHE).then((cache) => cache.addAll(self.ATD_SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("atd-static-") && key !== self.ATD_STATIC_CACHE)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      Promise.race([
        fetch(request),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Navigation network timeout")), 4000),
        ),
      ])
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(self.ATD_STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match("/dashboard");
          if (shell) return shell;
          return new Response("The app could not load. Check your connection and try again.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }),
    );
    return;
  }

  const networkFirstDestination = ["script", "style", "font"].includes(request.destination);
  if (networkFirstDestination) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(self.ATD_STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached ?? new Response("Asset unavailable while offline", { status: 503 });
        }),
    );
    return;
  }

  const cacheableDestination = request.destination === "image";
  if (!cacheableDestination) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(self.ATD_STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached ?? network;
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Anytime Diesel Employee Management",
    body: "You have a new update.",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    renotify: true,
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
