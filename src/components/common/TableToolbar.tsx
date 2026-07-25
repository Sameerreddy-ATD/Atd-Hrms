import type { ReactNode } from "react";

export function TableToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-center [&>*]:min-w-0 [&>*]:w-full min-[480px]:[&>*]:w-auto">
      {children}
    </div>
  );
}
