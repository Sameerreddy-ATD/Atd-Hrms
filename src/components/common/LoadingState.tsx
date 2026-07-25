import { DieselTruckLoader } from "@/components/common/DieselTruckLoader";
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
      className={cn(
        "flex w-full items-center justify-center overflow-hidden",
        compact ? "min-h-20 py-4" : "min-h-40 py-8 sm:min-h-48 sm:py-10",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col items-center gap-3 text-center",
          showBrandStory ? "w-full max-w-3xl px-1 sm:px-0" : "max-w-xs",
        )}
      >
        {showBrandStory ? (
          <DieselTruckLoader compact={compact} />
        ) : (
          <div
            className={cn(
              "module-logo-loader",
              compact ? "module-logo-loader--compact" : "module-logo-loader--standard",
            )}
            aria-hidden="true"
          >
            <Logo className="h-auto w-full" />
          </div>
        )}

        <div>
          {showBrandStory && (
            <>
              <p className="text-lg font-semibold text-foreground sm:text-xl">Anytime Diesel</p>
              <p className="mx-auto mt-1 max-w-[19rem] text-sm font-medium leading-5 text-primary sm:max-w-none sm:text-base">
                Powering India&apos;s Growth, One Litre at a Time.
              </p>
              <p className="mx-auto mt-2 hidden max-w-xl text-xs leading-5 text-muted-foreground min-[390px]:block sm:text-sm">
                India&apos;s trusted doorstep diesel delivery company serving businesses and
                individuals across multiple cities.
              </p>
            </>
          )}
          <p
            className={cn(
              "text-sm font-medium text-foreground sm:text-base",
              showBrandStory && "mt-3 sm:mt-4",
            )}
          >
            {label}
          </p>
        </div>
      </div>
      <span className="sr-only">Please wait.</span>
    </div>
  );
}
