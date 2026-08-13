import { useEffect, useState } from "react";
import { BrandReveal } from "@/components/common/Logo";
import { APP_BUILD_ID } from "@/lib/app-build";
import { cn } from "@/lib/utils";

const PLAYED_KEY = `atd.boot.lockup.played:${APP_BUILD_ID}`;

export function AppOpenSplash() {
  const [phase, setPhase] = useState<"hold" | "open" | "exit" | "done">("hold");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(PLAYED_KEY) === "1") {
        setPhase("done");
        return;
      }
    } catch {
      // Private storage — still play once this mount.
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const holdMs = reduceMotion ? 80 : 700;
    const openMs = reduceMotion ? 200 : 900;
    const restMs = reduceMotion ? 280 : 750;
    const exitMs = reduceMotion ? 160 : 380;

    const open = window.setTimeout(() => setPhase("open"), holdMs);
    const leave = window.setTimeout(() => setPhase("exit"), holdMs + openMs + restMs);
    const done = window.setTimeout(() => {
      setPhase("done");
      try {
        window.sessionStorage.setItem(PLAYED_KEY, "1");
      } catch {
        // Ignore.
      }
    }, holdMs + openMs + restMs + exitMs);

    return () => {
      window.clearTimeout(open);
      window.clearTimeout(leave);
      window.clearTimeout(done);
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
