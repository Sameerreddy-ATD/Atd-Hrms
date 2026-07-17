import { Logo } from "@/components/common/Logo";
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
        <div className="relative w-36 overflow-hidden px-2 py-1 sm:w-40">
          <Logo className="h-auto w-full" />
          <span
            className="absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-18deg] bg-white/75 blur-sm motion-safe:animate-[atd-sweep_1.35s_ease-in-out_infinite] motion-reduce:hidden"
            aria-hidden="true"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground sm:text-base">{label}</p>
          <div
            className="mx-auto mt-2 h-1 w-24 overflow-hidden rounded-full bg-primary/15"
            aria-hidden="true"
          >
            <span className="block h-full w-2/5 rounded-full bg-primary motion-safe:animate-[atd-progress_1.15s_ease-in-out_infinite] motion-reduce:w-full" />
          </div>
        </div>
      </div>
      <span className="sr-only">Please wait.</span>
    </div>
  );
}
