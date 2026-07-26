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
        compact ? "min-h-16 py-3" : showBrandStory ? "min-h-[100dvh] py-12" : "min-h-40 py-10",
        className,
      )}
    >
      {showBrandStory && (
        <div className="atd-boot__stage" aria-hidden="true">
          <span className="atd-boot__grid" />
          <span className="atd-boot__orb atd-boot__orb--a" />
          <span className="atd-boot__orb atd-boot__orb--b" />
          <span className="atd-boot__orb atd-boot__orb--c" />
          <span className="atd-boot__sheen" />
          <span className="atd-boot__horizon" />
        </div>
      )}

      <div
        className={cn(
          "relative z-[1] flex min-w-0 flex-col items-center text-center",
          showBrandStory ? "atd-boot__content w-full max-w-[24rem] gap-8 px-6" : "max-w-[16rem] gap-5",
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
          <span className="atd-loader-mark__halo" />
          <span className="atd-loader-mark__plate">
            <Logo
              className={cn(
                "relative z-[1] h-auto",
                showBrandStory ? "w-40 sm:w-[11.75rem]" : compact ? "w-24" : "w-[8.5rem]",
              )}
            />
          </span>
        </div>

        <div
          className={cn(
            "w-full",
            showBrandStory ? "space-y-5" : "space-y-3.5",
            compact && "space-y-2",
          )}
        >
          {showBrandStory && (
            <div className="atd-boot__copy space-y-2.5">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-primary">
                Employee Management
              </p>
              <p className="text-[1.9rem] font-semibold leading-none tracking-[-0.035em] text-foreground sm:text-[2.2rem]">
                Anytime Diesel
              </p>
              <p className="mx-auto max-w-[19rem] text-[0.9375rem] font-medium leading-snug text-muted-foreground">
                Powering India&apos;s Growth, One Litre at a Time.
              </p>
            </div>
          )}

          <div
            className={cn(
              "atd-boot__status mx-auto w-full",
              showBrandStory ? "max-w-[16rem]" : "max-w-[12rem]",
            )}
          >
            <p
              className={cn(
                "font-medium tracking-tight text-muted-foreground",
                showBrandStory ? "text-[0.8125rem] sm:text-sm" : "text-sm",
                compact && "text-xs",
              )}
            >
              {label}
            </p>
            <div
              className={cn(
                "loading-progress mx-auto mt-3.5",
                showBrandStory && "loading-progress--hero",
                compact && "loading-progress--compact mt-2",
              )}
              aria-hidden="true"
            >
              <span className="loading-progress__glow" />
              <span className="loading-progress__bar" />
            </div>
            <div
              className={cn(
                "loading-dots mx-auto",
                showBrandStory ? "mt-4" : "mt-3",
                compact && "mt-2 scale-90",
              )}
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>

      <span className="sr-only">Please wait.</span>
    </div>
  );
}
