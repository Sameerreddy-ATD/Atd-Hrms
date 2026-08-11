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
        "mb-5 flex flex-col gap-3 border-b border-border/70 pb-4.5 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:pb-5",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary dark:bg-primary/15">
            <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
            {eyebrow}
          </div>
        )}
        <h1 className="gradient-heading break-words text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
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
