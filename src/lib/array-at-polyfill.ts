/** Array.prototype.at is missing on older Android WebViews (e.g. Android 11). */
export function installArrayAtPolyfill() {
  if (typeof Array === "undefined" || typeof Array.prototype.at === "function") return;
  Object.defineProperty(Array.prototype, "at", {
    configurable: true,
    writable: true,
    value(this: unknown[], index: number) {
      const len = this.length;
      const i = Math.trunc(index);
      const k = i >= 0 ? i : len + i;
      if (k < 0 || k >= len) return undefined;
      return this[k];
    },
  });
}

installArrayAtPolyfill();
