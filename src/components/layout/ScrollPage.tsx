import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Full-viewport scroll host for routes that sit outside the authenticated
 * app shell. Required on native/Capacitor because html/body are overflow:hidden.
 */
export function ScrollPage({
  children,
  className,
  contentClassName,
  center = false,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Vertically center content when it fits; still scrolls when it does not. */
  center?: boolean;
}) {
  return (
    <div className={cn("aw-auth-canvas aw-scroll-page", className)}>
      <div
        className={cn(
          center
            ? "flex min-h-full items-center justify-center px-4 py-8 pb-[max(2rem,var(--atd-sab))] pt-[max(2rem,var(--atd-sat))]"
            : "px-4 py-8 pb-[max(2rem,var(--atd-sab))] pt-[max(2rem,var(--atd-sat))]",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
