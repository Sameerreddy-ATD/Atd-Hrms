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
        "relative flex w-full items-center justify-center",
        !showBrandStory && "overflow-hidden",
        showBrandStory && "atd-boot",
        compact ? "min-h-16 py-3" : showBrandStory ? "min-h-[100dvh] py-12" : "min-h-36 py-8",
        className,
      )}
    >
      <div
        className={cn(
          "relative z-[1] flex min-w-0 flex-col items-center text-center",
          showBrandStory
            ? "atd-boot__content w-full max-w-[22rem] gap-8 px-6"
            : "max-w-[14rem] gap-4",
          compact && "gap-2.5",
        )}
      >
        {showBrandStory ? (
          <Logo variant="mark" className="h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]" />
        ) : (
          <div
            className={cn(
              "atd-loader-mark",
              compact && "atd-loader-mark--compact",
              !compact && "atd-loader-mark--module",
            )}
            aria-hidden="true"
          >
            <span className="atd-loader-mark__plate">
              <Logo
                variant="mark"
                className={cn("relative z-[1] h-auto", compact ? "w-14" : "w-16")}
              />
            </span>
          </div>
        )}

        <div
          className={cn(
            "w-full",
            showBrandStory ? "space-y-6" : "space-y-3",
            compact && "space-y-2",
          )}
        >
          <div
            className={cn(
              "atd-boot__status mx-auto w-full",
              showBrandStory ? "max-w-[14rem]" : "max-w-[11rem]",
            )}
          >
            <p
              className={cn(
                "font-medium tracking-tight text-muted-foreground",
                "text-sm",
                compact && "text-xs",
              )}
            >
              {label}
            </p>
            <div
              className={cn(
                "loading-progress mx-auto mt-3",
                showBrandStory && "loading-progress--hero",
                compact && "loading-progress--compact mt-2",
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
