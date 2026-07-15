import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingState({
  label = "Loading data",
  compact = false,
  className,
}: {
  label?: string;
  compact?: boolean;
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
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        <div className="relative grid h-11 w-11 place-items-center rounded-lg border border-primary/20 bg-primary/5 sm:h-12 sm:w-12">
          <span className="absolute inset-1 rounded-md bg-primary/10 motion-safe:animate-pulse" />
          <LoaderCircle className="relative h-5 w-5 animate-spin text-primary motion-reduce:animate-none sm:h-6 sm:w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground sm:text-base">{label}</p>
          <div className="mx-auto mt-2 flex w-20 gap-1" aria-hidden="true">
            <span className="h-1 flex-1 rounded-full bg-primary/70 motion-safe:animate-pulse" />
            <span className="h-1 flex-1 rounded-full bg-primary/40 motion-safe:animate-pulse [animation-delay:150ms]" />
            <span className="h-1 flex-1 rounded-full bg-primary/20 motion-safe:animate-pulse [animation-delay:300ms]" />
          </div>
        </div>
      </div>
      <span className="sr-only">Please wait.</span>
    </div>
  );
}
