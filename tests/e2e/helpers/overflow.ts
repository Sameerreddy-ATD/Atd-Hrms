import type { Page } from "@playwright/test";

/** Find horizontal overflow beyond the viewport (ignores intentional scroll containers). */
export async function findOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector("main") ?? document.documentElement;
    const docWidth = document.documentElement.clientWidth;
    const limit = docWidth + 1;
    // Prefer measuring the authenticated main region rather than chrome.
    if (root.scrollWidth <= limit && document.documentElement.scrollWidth <= limit + 80) {
      return null;
    }
    let worst: { selector: string; right: number } | null = null;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === "fixed" || style.visibility === "hidden" || style.display === "none") {
        continue;
      }
      if (
        el.classList.contains("atd-wordmark") ||
        el.classList.contains("atd-reveal__measure") ||
        el.closest(".atd-wordmark") ||
        el.closest(".atd-reveal__measure")
      ) {
        continue;
      }
      let parent = el.parentElement;
      let scrollable = false;
      while (parent && parent !== document.body) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          scrollable = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (scrollable) continue;
      if (rect.right > limit && (!worst || rect.right > worst.right)) {
        const id = el.id ? `#${el.id}` : "";
        const cls =
          el.className && typeof el.className === "string"
            ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : "";
        worst = { selector: `${el.tagName.toLowerCase()}${id}${cls}`, right: Math.round(rect.right) };
      }
    }
    if (!worst) return null;
    return {
      docWidth,
      scrollWidth: Math.max(root.scrollWidth, worst.right),
      worst,
    };
  });
}
