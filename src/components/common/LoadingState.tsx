import { Logo } from "@/components/common/Logo";
import { cn } from "@/lib/utils";
import { systemApi, type BrandProofSettings } from "@/services/api";
import { useEffect, useState } from "react";

const defaultBrandProof: BrandProofSettings = {
  litresDelivered: "10M+",
  happyClients: "5,000+",
  appRating: "4.8 / 5",
  certification: "PESO & OMC",
};

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
  const [brandProof, setBrandProof] = useState(defaultBrandProof);

  useEffect(() => {
    if (!showBrandStory) return;
    void systemApi
      .brandProof()
      .then(setBrandProof)
      .catch(() => undefined);
  }, [showBrandStory]);

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
        <div className="relative w-32 shrink-0 overflow-hidden px-2 py-1 sm:w-40">
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
          <div
            className="mx-auto mt-2 h-1 w-24 overflow-hidden rounded-full bg-primary/15"
            aria-hidden="true"
          >
            <span className="block h-full w-2/5 rounded-full bg-primary motion-safe:animate-[atd-progress_1.15s_ease-in-out_infinite] motion-reduce:w-full" />
          </div>
        </div>

        {showBrandStory && (
          <div className="startup-proof mt-2 flex w-full snap-x snap-mandatory overflow-x-auto rounded-lg border bg-card text-left sm:mt-3 sm:grid sm:grid-cols-4 sm:overflow-hidden">
            <BrandProof value={brandProof.litresDelivered} label="Litres delivered" />
            <BrandProof value={brandProof.happyClients} label="Happy clients" />
            <BrandProof value={brandProof.appRating} label="App rating" />
            <BrandProof value={brandProof.certification} label="Certified operations" />
          </div>
        )}
      </div>
      <span className="sr-only">Please wait.</span>
    </div>
  );
}

function BrandProof({ value, label }: { value: string; label: string }) {
  return (
    <div className="w-[44%] min-w-[8.5rem] shrink-0 snap-start border-r p-3 last:border-r-0 sm:w-auto sm:min-w-0 sm:p-4">
      <p className="text-sm font-bold text-foreground sm:text-base">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
