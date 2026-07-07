import type { ReactNode } from "react";

export function TableToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
    </div>
  );
}
