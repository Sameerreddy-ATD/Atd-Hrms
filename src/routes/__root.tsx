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
import { registerAppServiceWorker } from "@/lib/browser-notifications";
import { detectPwaPlatform, ensureLatestAppBuild } from "@/lib/pwa-install";
import { PortraitOrientationGuard } from "@/components/layout/PortraitOrientationGuard";

const SITE_TITLE = "Anytime Workforce";
const SITE_DESCRIPTION =
  "Anytime Workforce — workforce and operations platform for employee records, attendance, leave, tasks, assets, branches, and company operations.";
const SITE_IMAGE = "/atd-logo.png";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      {
        name: "keywords",
        content:
          "Anytime Workforce, Anytime Diesel, workforce operations, attendance management, leave management, biometric attendance, GPS attendance, tasks, assets",
      },
      { name: "application-name", content: "Workforce" },
      { name: "apple-mobile-web-app-title", content: "Workforce" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { name: "theme-color", content: "#dc2f20", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#1a1f2a", media: "(prefers-color-scheme: dark)" },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:site_name", content: SITE_TITLE },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:image", content: SITE_IMAGE },
      { property: "og:image:alt", content: "Anytime Diesel logo" },
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
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/atd-favicon.png", type: "image/png" },
      { rel: "shortcut icon", href: "/atd-favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "preload", href: "/atd-logo.png", as: "image", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Runs before first paint so a stored dark preference never flashes white.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&(!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(t!=="light"&&t!=="dark"){try{localStorage.setItem("theme",d?"dark":"light");}catch(e){}}document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    void registerAppServiceWorker().catch(() => undefined);
    void ensureLatestAppBuild().catch(() => undefined);
  }, []);

  useEffect(() => {
    // Drop the hard-refresh cache-bust param so the URL stays clean.
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_r")) return;
    url.searchParams.delete("_r");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
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
    // Suppress Chrome/Edge install mini-infobar on laptop/desktop; users can still install
    // from the browser address bar / menu if they choose.
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
        <Outlet />
        <PortraitOrientationGuard />
        <SystemThemeSync />
        <NotificationBridge />
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  );
}
