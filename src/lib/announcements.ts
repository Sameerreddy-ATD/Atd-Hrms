import type { Announcement } from "../types/domain.js";

const PRIORITY_RANK: Record<Announcement["priority"], number> = {
  URGENT: 0,
  IMPORTANT: 1,
  NORMAL: 2,
};

/** Urgent first, then important, then normal; newest publish time within each level. */
export function sortAnnouncements<T extends Pick<Announcement, "priority" | "publishAt">>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDelta !== 0) return priorityDelta;
    return +new Date(b.publishAt) - +new Date(a.publishAt);
  });
}
