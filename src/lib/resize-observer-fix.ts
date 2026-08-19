/**
 * Chrome reports "ResizeObserver loop completed with undelivered notifications"
 * when an observer callback mutates layout in the same frame (Radix, Embla,
 * Recharts, measuring lockups). Deferring the callback to the next animation
 * frame breaks that loop at the browser, not by swallowing the error.
 */
export function installResizeObserverLoopFix() {
  if (typeof window === "undefined" || typeof ResizeObserver === "undefined") return;
  const flag = "__atdResizeObserverPatched" as const;
  const g = window as Window & { [flag]?: boolean };
  if (g[flag]) return;
  g[flag] = true;

  const Original = window.ResizeObserver;
  window.ResizeObserver = class ResizeObserver extends Original {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        window.requestAnimationFrame(() => {
          if (entries.length) callback(entries, observer);
        });
      });
    }
  };
}
