// Keep ATD_BUILD_ID in sync with src/lib/app-build.ts APP_BUILD_ID and
// public/app-version.json. Bumping it changes sw.js bytes -> a new SW installs,
// activate purges the old cache, and cache-first shell/static assets (icons,
// manifest, fonts, face-models) refresh on already-installed apps.
self.ATD_BUILD_ID = "2026-08-19-hydration-live-updates";
self.ATD_STATIC_CACHE = `atd-static-${self.ATD_BUILD_ID}`;
// Single cache slot for the app shell. Every successful navigation overwrites
// it, so an offline launch serves the last real HTML instead of the 503 card.
const ATD_SHELL_REQUEST = "/__atd_app_shell";
self.ATD_SHELL_ASSETS = [
  "/manifest.webmanifest",
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
  // Activate updated SW immediately so installed apps pick up new builds.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("atd-static-") && key !== self.ATD_STATIC_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "FORCE_RELOAD", buildId: self.ATD_BUILD_ID });
      }
    })(),
  );
});

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(self.ATD_STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cached);
    return cached ?? network;
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API / health / streams / build version / SW — always hit the live server.
  // NOTE: the API is a separate origin (cross-origin requests are already ignored above),
  // so do NOT list same-origin app routes like /attendance/* here or their navigations
  // would skip the network-first navigation handler and the offline fallback shell.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/stream") ||
    url.pathname === "/health" ||
    url.pathname.startsWith("/health/") ||
    url.pathname === "/app-version.json" ||
    url.pathname === "/sw.js"
  ) {
    return;
  }

  // App navigations: network-first so deploys show new UI, but each success is
  // cached as the app shell so an offline launch renders the real app instead
  // of the 503 card below.
  if (request.mode === "navigate") {
    event.respondWith(
      Promise.race([
        fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches
              .open(self.ATD_STATIC_CACHE)
              .then((cache) => cache.put(ATD_SHELL_REQUEST, copy))
              .catch(() => {});
          }
          return response;
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Navigation network timeout")), 15000),
        ),
      ]).catch(async () => {
        const cached = (await caches.match(request)) || (await caches.match(ATD_SHELL_REQUEST));
        if (cached) return cached;
        return new Response(
          "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Offline</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0;background:#F6F8FC;color:#1f2937;padding:24px;text-align:center}main{max-width:24rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#64748b;line-height:1.5}</style></head><body><main><h1>You're offline</h1><p>Anytime Diesel Employees could not reach the server. Reconnect and try again.</p></main></body></html>",
          {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      }),
    );
    return;
  }

  // Face models + login mascots are large; serve from cache after first download.
  const heavyStatic =
    url.pathname.startsWith("/face-models/") ||
    url.pathname.startsWith("/login-crew-mascot") ||
    url.pathname.startsWith("/fonts/");
  if (heavyStatic || request.destination === "image") {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Hashed JS/CSS: network-first, fall back to cache only when offline.
  const networkFirstDestination = ["script", "style", "font"].includes(request.destination);
  if (networkFirstDestination || url.pathname === "/manifest.webmanifest") {
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
  }
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Anytime Diesel Employees",
    body: "You have a new workplace update.",
    icon: "/pwa-192.png",
    badge: "/atd-favicon.png",
    renotify: true,
    tag: "atd-update",
    vibrate: [80, 40, 80],
    data: { href: "/notifications" },
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        renotify: payload.renotify,
        tag: payload.tag,
        vibrate: payload.vibrate,
        data: payload.data,
        actions: [
          { action: "open", title: "Open" },
          { action: "dismiss", title: "Dismiss" },
        ],
      }),
      self.navigator && "setAppBadge" in self.navigator
        ? self.navigator.setAppBadge(1).catch(() => undefined)
        : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") {
    if (self.navigator && "clearAppBadge" in self.navigator) {
      event.waitUntil(self.navigator.clearAppBadge());
    }
    return;
  }
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

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
