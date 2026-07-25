import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-border/80 pb-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:pb-5">
      <div className="min-w-0">
        <h1 className="break-words text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
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
