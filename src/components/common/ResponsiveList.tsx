import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Outer border shell that hosts mobile cards + desktop table. */
export function ResponsiveListShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Stacked card list shown below the `md` breakpoint. */
export function MobileList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-2 p-3 md:hidden", className)}>{children}</div>;
}

/** Desktop table wrapper shown from `md` up. */
export function DesktopTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("hidden overflow-x-auto md:block", className)}>{children}</div>;
}

export function MobileListItem({
  children,
  className,
  intrinsicSize = "170px",
}: {
  children: ReactNode;
  className?: string;
  /** Hint for content-visibility intrinsic size. */
  intrinsicSize?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3 [content-visibility:auto]",
        className,
      )}
      style={{ containIntrinsicSize: intrinsicSize }}
    >
      {children}
    </div>
  );
}

export function MobileListHeader({
  title,
  meta,
  trailing,
}: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        {meta != null && meta !== "" && (
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        )}
      </div>
      {trailing}
    </div>
  );
}

export function MobileListFields({
  children,
  className,
  cols = 2,
}: {
  children: ReactNode;
  className?: string;
  cols?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "mt-3 grid gap-x-3 gap-y-2 text-xs",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MobileListField({
  label,
  value,
  className,
  mono,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={className}>
      <p className="text-muted-foreground">{label}</p>
      <div className={cn("mt-0.5 break-words", mono && "font-mono")}>{value ?? "-"}</div>
    </div>
  );
}

export function MobileListActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-3 flex w-full flex-col gap-2 min-[420px]:flex-row", className)}>
      {children}
    </div>
  );
}
