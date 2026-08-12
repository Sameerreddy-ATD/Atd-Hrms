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
    allowNavigation: ["hrms.anytime-diesel.com", "*.anytime-diesel.com"],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#F6F8FC",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#dc2f20",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
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
