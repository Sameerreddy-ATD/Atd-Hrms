import { Logo } from "@/components/common/Logo";
import { cn } from "@/lib/utils";

export function LoadingState({
  label = "Loading data",
  compact = false,
  showBrandStory = false,
  className,
}: {
  label?: string;
  compact?: boolean;
  showBrandStory?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden",
        showBrandStory && "atd-boot",
        compact ? "min-h-16 py-3" : showBrandStory ? "min-h-[100dvh] py-10" : "min-h-36 py-8",
        className,
      )}
    >
      {showBrandStory && (
        <>
          <div className="atd-boot__glow atd-boot__glow--primary" aria-hidden="true" />
          <div className="atd-boot__glow atd-boot__glow--soft" aria-hidden="true" />
          <div className="atd-boot__grid" aria-hidden="true" />
        </>
      )}

      <div
        className={cn(
          "relative z-[1] flex min-w-0 flex-col items-center text-center animate-in fade-in duration-500",
          showBrandStory ? "w-full max-w-sm gap-8 px-6" : "max-w-[14rem] gap-4",
          compact && "gap-2.5",
        )}
      >
        <div
          className={cn(
            "atd-loader-mark",
            showBrandStory && "atd-loader-mark--hero",
            compact && "atd-loader-mark--compact",
            !showBrandStory && !compact && "atd-loader-mark--module",
          )}
          aria-hidden="true"
        >
          <span className="atd-loader-mark__ring" />
          <Logo
            className={cn(
              "h-auto",
              showBrandStory ? "w-[9.5rem] sm:w-44" : compact ? "w-24" : "w-32",
            )}
          />
        </div>

        <div className={cn("w-full space-y-3", compact && "space-y-2")}>
          {showBrandStory && (
            <div className="space-y-1.5">
              <p className="text-[1.65rem] font-semibold tracking-tight text-foreground sm:text-3xl">
                Anytime Diesel
              </p>
              <p className="text-sm font-medium text-primary sm:text-[0.95rem]">
                Powering India&apos;s Growth, One Litre at a Time.
              </p>
            </div>
          )}

          <div className={cn("space-y-2.5", compact && "space-y-2")}>
            <p
              className={cn(
                "font-medium tracking-tight text-muted-foreground",
                showBrandStory ? "text-sm sm:text-[0.95rem]" : "text-sm",
                compact && "text-xs",
              )}
            >
              {label}
            </p>
            <div
              className={cn(
                "loading-progress mx-auto",
                showBrandStory && "loading-progress--hero",
                compact && "loading-progress--compact",
              )}
              aria-hidden="true"
            >
              <span className="loading-progress__bar" />
            </div>
          </div>
        </div>
      </div>

      <span className="sr-only">Please wait.</span>
    </div>
  );
}
