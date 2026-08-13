import { useEffect, useState } from "react";
import { BrandReveal } from "@/components/common/Logo";
import { APP_BUILD_ID } from "@/lib/app-build";
import { cn } from "@/lib/utils";

const PLAYED_KEY = `atd.boot.lockup.played:${APP_BUILD_ID}`;

export function AppOpenSplash() {
  const [phase, setPhase] = useState<"show" | "exit" | "done">("show");

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
    const holdMs = reduceMotion ? 700 : 2200;
    const exitMs = reduceMotion ? 180 : 420;
    const leave = window.setTimeout(() => setPhase("exit"), holdMs);
    const done = window.setTimeout(() => {
      setPhase("done");
      try {
        window.sessionStorage.setItem(PLAYED_KEY, "1");
      } catch {
        // Ignore.
      }
    }, holdMs + exitMs);

    return () => {
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
      <BrandReveal />
    </div>
  );
}
