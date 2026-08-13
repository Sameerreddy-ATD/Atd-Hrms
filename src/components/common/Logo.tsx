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
      <BrandWordmark className="min-w-0" />
    </div>
  );
}

/** Boot animation: mark starts centered, then slides left as the name reveals. */
export function BrandReveal({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <div className={cn("atd-lockup", className)} aria-label="AnyTime Diesel">
      <span className="atd-lockup__mark">
        <Logo
          variant="mark"
          className={cn("h-[4.75rem] w-[4.75rem] sm:h-[5.5rem] sm:w-[5.5rem]", markClassName)}
        />
      </span>
      <span className="atd-lockup__word">
        <BrandWordmark className="atd-wordmark--lockup" />
      </span>
    </div>
  );
}
