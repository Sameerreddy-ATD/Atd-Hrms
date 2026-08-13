import { useEffect, useState } from "react";
import { BrandReveal } from "@/components/common/Logo";
import { APP_BUILD_ID } from "@/lib/app-build";
import { hideNativeSplash, isNativeApp } from "@/lib/native-app";
import { cn } from "@/lib/utils";

const PLAYED_KEY = `atd.boot.lockup.played:${APP_BUILD_ID}`;

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function AppOpenSplash() {
  const [phase, setPhase] = useState<"hold" | "open" | "exit" | "done">("hold");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const native = isNativeApp();
    // Desktop tab: play once per session. Native WebView keeps sessionStorage
    // across app opens, so skipping here would hide the lockup on the phone.
    if (!native) {
      try {
        if (window.sessionStorage.getItem(PLAYED_KEY) === "1") {
          setPhase("done");
          return;
        }
      } catch {
        // Play anyway.
      }
    }

    const reduceMotion = !native && prefersReducedMotion();
    const holdMs = reduceMotion ? 120 : native ? 560 : 640;
    const openMs = reduceMotion ? 160 : 820;
    const restMs = reduceMotion ? 280 : 720;
    const exitMs = reduceMotion ? 160 : 360;

    let cancelled = false;
    let openTimer = 0;
    let leaveTimer = 0;
    let doneTimer = 0;

    function play() {
      if (cancelled) return;
      setPhase("hold");
      openTimer = window.setTimeout(() => {
        if (!cancelled) setPhase("open");
      }, holdMs);
      leaveTimer = window.setTimeout(() => {
        if (!cancelled) setPhase("exit");
      }, holdMs + openMs + restMs);
      doneTimer = window.setTimeout(() => {
        if (cancelled) return;
        setPhase("done");
        if (!native) {
          try {
            window.sessionStorage.setItem(PLAYED_KEY, "1");
          } catch {
            // Ignore.
          }
        }
      }, holdMs + openMs + restMs + exitMs);
    }

    async function start() {
      if (native) {
        await hideNativeSplash(160);
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
        });
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      }
      play();
    }

    void start();

    return () => {
      cancelled = true;
      window.clearTimeout(openTimer);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      className={cn("atd-open-splash", phase === "exit" && "atd-open-splash--exit")}
      role="img"
      aria-label="AnyTime Diesel"
    >
      <BrandReveal open={phase === "open" || phase === "exit"} />
    </div>
  );
}
