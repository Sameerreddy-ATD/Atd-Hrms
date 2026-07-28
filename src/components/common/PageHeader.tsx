import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-3 border-b border-border/70 pb-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:pb-5",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap sm:w-auto sm:justify-end sm:[&>*]:flex-none [&>*]:w-full min-[420px]:[&>*]:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
