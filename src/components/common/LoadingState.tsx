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
        compact ? "min-h-16 py-3" : "min-h-28 py-6 sm:min-h-32",
        className,
      )}
    >
      <div className="flex max-w-xs flex-col items-center gap-2.5 text-center">
        <div
          className="relative flex h-11 w-16 items-center justify-center overflow-hidden rounded-md bg-primary text-base font-black text-primary-foreground shadow-sm"
          aria-hidden="true"
        >
          ATD
          <span className="absolute inset-x-2 bottom-1 h-0.5 origin-left bg-white/80 motion-safe:animate-[atd-progress_0.9s_ease-in-out_infinite]" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
      </div>
      <span className="sr-only">Please wait.</span>
    </div>
  );
}
