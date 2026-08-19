import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function Logo({
  className = "h-8 w-auto",
  variant = "wordmark",
}: {
  className?: string;
  /** wordmark = diesel logotype on legal pages; mark = official red ATD icon. */
  variant?: "wordmark" | "mark";
}) {
  return (
    <img
      src={variant === "mark" ? "/atd-mark.png" : "/atd-logo.png"}
      alt="AnyTime Diesel"
      className={cn("max-w-full object-contain", className)}
    />
  );
}

export function BrandWordmark({
  className,
  stacked = false,
}: {
  className?: string;
  stacked?: boolean;
}) {
  return (
    <span className={cn("atd-wordmark", stacked && "atd-wordmark--stacked", className)}>
      <span className="atd-wordmark__anytime">AnyTime</span>
      <span className="atd-wordmark__diesel">Diesel</span>
    </span>
  );
}

/** App chrome lockup: red mark + AnyTime Diesel. Never the Diesel wordmark image. */
export function BrandLockup({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Logo variant="mark" className={cn("h-8 w-8 shrink-0", markClassName)} />
      <BrandWordmark className="shrink-0" />
    </div>
  );
}

/** Boot animation: the red app icon starts centered, then slides left as the name opens to its right. */
export function BrandReveal({
  open = false,
  className,
  markClassName,
}: {
  open?: boolean;
  className?: string;
  markClassName?: string;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [wordWidth, setWordWidth] = useState(0);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const measure = () => {
      // Italic + skew paint past the layout box; keep a little ink inside the clip.
      const next = Math.ceil(el.scrollWidth) + 8;
      setWordWidth((prev) => (prev === next ? prev : next));
    };

    const raf = window.requestAnimationFrame(measure);
    const fonts = document.fonts?.ready;
    void fonts?.then(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div
      className={cn("atd-reveal", open && "atd-reveal--open", className)}
      style={
        wordWidth > 0 ? ({ "--atd-word-width": `${wordWidth}px` } as CSSProperties) : undefined
      }
      aria-label="AnyTime Diesel"
    >
      <img src="/atd-app-icon.png" alt="" className={cn("atd-reveal__mark", markClassName)} />
      <span className="atd-reveal__word">
        <span ref={measureRef} className="atd-reveal__measure">
          <BrandWordmark className="atd-wordmark--lockup" />
        </span>
      </span>
    </div>
  );
}
