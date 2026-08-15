import type { CapacitorConfig } from "@capacitor/cli";

const PROD_ORIGIN = "https://hrms.anytime-diesel.com";

/**
 * Capacitor shell loads the live production site so HTTP-only cookies and
 * FRONTEND_ORIGIN CORS continue to work without an auth rewrite.
 * Local `webDir` is only a cold-start fallback if the network is unreachable.
 */
const config: CapacitorConfig = {
  appId: "com.anytimediesel.workforce",
  appName: "Anytime Workforce",
  webDir: "mobile/www",
  server: {
    url: PROD_ORIGIN,
    cleartext: false,
    // Bundled mobile/www/index.html — Capacitor only shows it when errorPath is set.
    // Without this, a cold start with no network renders the raw WebView error page.
    errorPath: "index.html",
    allowNavigation: ["hrms.anytime-diesel.com", "*.anytime-diesel.com"],
  },
  plugins: {
    SplashScreen: {
      // Safety-net auto-hide: online, bootstrapNativeApp() hides the splash ~700ms
      // after mount (nothing visible changes). Offline/DNS/TLS failure at cold start
      // means the remote JS never runs, so this timeout reveals the WebView error
      // page instead of an infinite black splash ("app won't open").
      launchAutoHide: true,
      launchShowDuration: 8000,
      backgroundColor: "#FFFFFF",
      showSpinner: false,
      androidScaleType: "CENTER",
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#F6F8FC",
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      // "body" + resizeOnFullScreen:false avoids Samsung One UI WebView crashes /
      // ANRs that happen when the soft keyboard dismisses right after Sign-in
      // (native resize + orientation re-lock storm).
      resize: "body",
      resizeOnFullScreen: false,
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#F6F8FC",
  },
  ios: {
    backgroundColor: "#F6F8FC",
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "Anytime Workforce",
  },
};

export default config;
