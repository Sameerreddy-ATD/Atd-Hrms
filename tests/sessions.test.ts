import { describe, expect, it } from "vitest";
import { describePlatform, SESSION_TTL_MS } from "../server/src/sessions.js";

describe("device labelling", () => {
  it("names the Capacitor shells before falling back to the browser checks", () => {
    // The Android shell also reports "Android"; the app check has to win.
    expect(describePlatform("AnytimeWorkforce/1.0 (Android 14; Pixel 7) Capacitor")).toBe(
      "Android app",
    );
    expect(describePlatform("AnytimeWorkforce/1.0 (iPhone; iOS 17) Capacitor")).toBe("iOS app");
  });

  it("distinguishes a mobile browser from the installed app", () => {
    expect(describePlatform("Mozilla/5.0 (Linux; Android 14) Chrome/120")).toBe("Android browser");
    expect(describePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari")).toBe("iPhone");
    expect(describePlatform("Mozilla/5.0 (iPad; CPU OS 17_0) Safari")).toBe("iPad");
  });

  it("labels desktop clients", () => {
    expect(describePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Mac");
    expect(describePlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(describePlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
  });

  it("does not fail on a missing or unrecognised user agent", () => {
    expect(describePlatform(undefined)).toBe("Unknown");
    expect(describePlatform("")).toBe("Unknown");
    expect(describePlatform("curl/8.5.0")).toBe("Web");
  });
});

describe("session lifetime", () => {
  it("matches the seven day refresh cookie so a device is not dropped early", () => {
    expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
