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
        "flex w-full items-center justify-center",
        compact ? "min-h-20 py-4" : "min-h-40 py-8 sm:min-h-48 sm:py-10",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-3 text-center",
          showBrandStory ? "w-full max-w-3xl" : "max-w-xs",
        )}
      >
        <div className="relative w-36 overflow-hidden px-2 py-1 sm:w-40">
          <Logo className="h-auto w-full" />
          <span
            className="absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-18deg] bg-white/75 blur-sm motion-safe:animate-[atd-sweep_1.35s_ease-in-out_infinite] motion-reduce:hidden"
            aria-hidden="true"
          />
        </div>

        <div>
          {showBrandStory && (
            <>
              <p className="text-lg font-semibold text-foreground sm:text-xl">Anytime Diesel</p>
              <p className="mt-1 text-sm font-medium text-primary sm:text-base">
                Powering India&apos;s Growth, One Litre at a Time.
              </p>
              <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-muted-foreground sm:text-sm">
                India&apos;s trusted doorstep diesel delivery company serving businesses and
                individuals across multiple cities.
              </p>
            </>
          )}
          <p
            className={cn(
              "text-sm font-medium text-foreground sm:text-base",
              showBrandStory && "mt-4",
            )}
          >
            {label}
          </p>
          <div
            className="mx-auto mt-2 h-1 w-24 overflow-hidden rounded-full bg-primary/15"
            aria-hidden="true"
          >
            <span className="block h-full w-2/5 rounded-full bg-primary motion-safe:animate-[atd-progress_1.15s_ease-in-out_infinite] motion-reduce:w-full" />
          </div>
          {showBrandStory && (
            <div className="mt-2 flex h-4 items-end justify-center gap-1" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((index) => (
                <span
                  key={index}
                  className="h-3 w-1.5 origin-bottom rounded-sm bg-primary motion-safe:animate-[atd-fuel-pulse_900ms_ease-in-out_infinite]"
                  style={{ animationDelay: `${index * 110}ms` }}
                />
              ))}
            </div>
          )}
        </div>

        {showBrandStory && (
          <div className="mt-3 grid w-full grid-cols-2 overflow-hidden rounded-lg border bg-card text-left sm:grid-cols-4">
            <BrandProof value="10M+" label="Litres delivered" />
            <BrandProof value="5,000+" label="Happy clients" />
            <BrandProof value="4.8 / 5" label="App rating" />
            <BrandProof value="PESO & OMC" label="Certified operations" />
          </div>
        )}
      </div>
      <span className="sr-only">Please wait.</span>
    </div>
  );
}

function BrandProof({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-b border-r p-3 last:border-r-0 sm:border-b-0 sm:p-4">
      <p className="text-sm font-bold text-foreground sm:text-base">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
