import "@/lib/array-at-polyfill";
import "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { NotificationBridge } from "@/components/layout/NotificationBridge";
import { SystemThemeSync } from "@/components/layout/SystemThemeSync";
import { Toaster } from "@/components/ui/sonner";
import { registerAppServiceWorker, unregisterAppServiceWorker } from "@/lib/browser-notifications";
import { detectPwaPlatform, ensureLatestAppBuild } from "@/lib/pwa-install";
import { bootstrapNativeApp, isNativeApp } from "@/lib/native-app";
import { installClientErrorReporter, reportClientError } from "@/lib/client-error-reporter";
import { recoverFromChunkError } from "@/lib/chunk-reload";
import { AppOpenSplash } from "@/components/layout/AppOpenSplash";
import { PortraitOrientationGuard } from "@/components/layout/PortraitOrientationGuard";
import { StoreUpdateGate } from "@/components/layout/StoreUpdateGate";

const SITE_TITLE = "Anytime Workforce";
const SITE_DESCRIPTION =
  "Anytime Workforce — workforce and operations platform for employee records, attendance, leave, tasks, assets, branches, and company operations.";
const SITE_IMAGE = "/atd-logo.png";

function NotFoundComponent() {
  return (
    <div className="aw-scroll-page flex items-center justify-center bg-background px-4">
      <div className="max-w-md py-12 text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:h-9"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  useEffect(() => {
    // A stale-deploy chunk failure surfaces here as a route boundary error.
    // Reload fresh instead of showing the error screen.
    if (recoverFromChunkError(error)) return;
    reportClientError(error, "route-boundary");
  }, [error]);

  return (
    <div className="aw-scroll-page flex items-center justify-center bg-background px-4">
      <div className="max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:h-9"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:h-9"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      {
        name: "keywords",
        content:
          "Anytime Workforce, Anytime Diesel, workforce operations, attendance management, leave management, biometric attendance, GPS attendance, tasks, assets",
      },
      { name: "application-name", content: SITE_TITLE },
      { name: "apple-mobile-web-app-title", content: SITE_TITLE },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { name: "theme-color", content: "#F6F8FC", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#1a1f2a", media: "(prefers-color-scheme: dark)" },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:site_name", content: SITE_TITLE },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:image", content: SITE_IMAGE },
      { property: "og:image:alt", content: "Anytime Workforce logo" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: SITE_IMAGE },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,700;0,800;1,700;1,800&family=Noto+Sans+Telugu:wght@400;500;600;700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/atd-favicon.png", type: "image/png" },
      { rel: "shortcut icon", href: "/atd-favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "preload", href: "/atd-logo.png", as: "image", type: "image/png" },
      { rel: "preload", href: "/atd-mark.png", as: "image", type: "image/png" },
      { rel: "preload", href: "/atd-app-icon.png", as: "image", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Runs before first paint so a stored dark preference never flashes white.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&(!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(t!=="light"&&t!=="dark"){try{localStorage.setItem("theme",d?"dark":"light");}catch(e){}}document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){document.documentElement.classList.add("atd-native");}}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="h-full">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => installClientErrorReporter(), []);

  useEffect(() => {
    let disposeNative: (() => void) | undefined;
    void bootstrapNativeApp()
      .then((dispose) => {
        disposeNative = dispose;
      })
      .catch(() => undefined);
    return () => {
      disposeNative?.();
    };
  }, []);

  useEffect(() => {
    // Service worker is web-only. The build-version check runs on native too so a
    // native WebView holding a stale cached bundle force-refreshes on cold start
    // (native has no SW, so this is its only proactive update path).
    if (isNativeApp()) {
      void unregisterAppServiceWorker().catch(() => undefined);
    } else {
      void registerAppServiceWorker().catch(() => undefined);
    }
    void ensureLatestAppBuild().catch(() => undefined);
  }, []);

  useEffect(() => {
    // Drop the hard-refresh / chunk-recovery cache-bust params so the URL stays clean.
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_r") && !url.searchParams.has("_cb")) return;
    url.searchParams.delete("_r");
    url.searchParams.delete("_cb");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  useEffect(() => {
    // Re-check build on reopen so already-installed apps force-update after deploys.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void ensureLatestAppBuild().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);

  useEffect(() => {
    // Store app: never show Chrome “Add to Home Screen”. Desktop: suppress the mini-infobar.
    // Phone browsers still receive beforeinstallprompt for the PWA banner.
    if (isNativeApp()) {
      function suppressNativeInstall(event: Event) {
        event.preventDefault();
      }
      window.addEventListener("beforeinstallprompt", suppressNativeInstall);
      return () => window.removeEventListener("beforeinstallprompt", suppressNativeInstall);
    }
    const platform = detectPwaPlatform();
    if (platform === "ios" || platform === "android") return;
    function suppressDesktopInstall(event: Event) {
      event.preventDefault();
    }
    window.addEventListener("beforeinstallprompt", suppressDesktopInstall);
    return () => window.removeEventListener("beforeinstallprompt", suppressDesktopInstall);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <div className="flex h-full min-h-0 flex-col">
          <AppOpenSplash />
          <Outlet />
          <PortraitOrientationGuard />
          <StoreUpdateGate />
          <SystemThemeSync />
          <NotificationBridge />
          <Toaster
            position="top-center"
            richColors
            closeButton
            offset="calc(var(--atd-sat, 0px) + 12px)"
          />
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}
