/** Array.prototype.at / String.prototype.at — missing on older Android WebViews. */
function defineAt<T>(proto: { length: number; [index: number]: T }) {
  if (typeof (proto as { at?: unknown }).at === "function") return;
  Object.defineProperty(proto, "at", {
    configurable: true,
    writable: true,
    value(this: ArrayLike<T>, index: number) {
      const len = this.length;
      const i = Math.trunc(index);
      const k = i >= 0 ? i : len + i;
      if (k < 0 || k >= len) return undefined;
      return this[k];
    },
  });
}

export function installArrayAtPolyfill() {
  if (typeof Array !== "undefined") defineAt(Array.prototype);
  if (typeof String !== "undefined") defineAt(String.prototype as unknown as { length: number });
}

installArrayAtPolyfill();
