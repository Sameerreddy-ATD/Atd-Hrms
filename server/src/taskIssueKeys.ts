import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/** Build a Jira-style project key from a board name (e.g. Operations → OPS). */
export function deriveBoardKeyPrefix(name: string, fallbackId = "BOARD") {
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  let prefix =
    words.length >= 2
      ? words
          .slice(0, 3)
          .map((word) => word[0] ?? "")
          .join("")
      : (words[0] ?? "TASK").replace(/[^A-Z0-9]/g, "");
  prefix = prefix.slice(0, 4);
  if (prefix.length < 2) {
    prefix = `B${fallbackId.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "RD"}`;
  }
  return prefix.slice(0, 8);
}

export async function allocateUniqueBoardKeyPrefix(
  db: PrismaClient | Prisma.TransactionClient,
  name: string,
  boardIdHint?: string,
) {
  const base = deriveBoardKeyPrefix(name, boardIdHint);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate =
      attempt === 0
        ? base
        : `${base.slice(0, Math.max(1, 7 - String(attempt).length))}${attempt}`.slice(0, 8);
    const existing = await db.taskBoard.findFirst({
      where: { keyPrefix: candidate },
      select: { boardId: true },
    });
    if (!existing) return candidate;
  }
  return `P${Date.now().toString(36).slice(-7).toUpperCase()}`.slice(0, 8);
}

/** Atomically reserve the next OPS-123 style key for a board. */
export async function allocateIssueKey(
  db: Prisma.TransactionClient,
  boardId: string,
): Promise<{ issueNumber: number; issueKey: string; keyPrefix: string }> {
  const boards = await db.$queryRaw<Array<{ key_prefix: string; next_issue_number: number }>>`
    SELECT key_prefix, next_issue_number
    FROM task_boards
    WHERE board_id = ${boardId}
    FOR UPDATE
  `;
  const board = boards[0];
  if (!board) throw new Error("Board not found while allocating issue key");
  const issueNumber = board.next_issue_number;
  const issueKey = `${board.key_prefix}-${issueNumber}`;
  await db.taskBoard.update({
    where: { boardId },
    data: { nextIssueNumber: issueNumber + 1 },
  });
  return { issueNumber, issueKey, keyPrefix: board.key_prefix };
}

export async function nextRankInStage(
  db: PrismaClient | Prisma.TransactionClient,
  boardId: string,
  stageId: string | null,
) {
  const top = await db.workTask.findFirst({
    where: { boardId, stageId, archivedAt: null },
    orderBy: { rank: "desc" },
    select: { rank: true },
  });
  return (top?.rank ?? 0) + 1000;
}

/** Returns null when neighbors are too close and the column should be rebalanced. */
export function midpointRank(before?: number | null, after?: number | null) {
  if (before == null && after == null) return 1000;
  if (before == null && after != null) {
    if (!Number.isFinite(after) || Math.abs(after) < 1e-3) return null;
    const next = after / 2;
    if (!Number.isFinite(next) || Math.abs(after - next) < 1e-3) return null;
    return next;
  }
  if (before != null && after == null) return before + 1000;
  const gap = after! - before!;
  if (!Number.isFinite(gap) || Math.abs(gap) < 1e-3) return null;
  return before! + gap / 2;
}

/** Spread ranks in a column to n*1000 so midpoint inserts stay stable. */
export async function rebalanceRanksInStage(
  db: PrismaClient | Prisma.TransactionClient,
  boardId: string,
  stageId: string | null,
) {
  const rows = await db.workTask.findMany({
    where: { boardId, stageId, archivedAt: null },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }, { taskId: "asc" }],
    select: { taskId: true },
  });
  let rank = 1000;
  for (const row of rows) {
    await db.workTask.update({
      where: { taskId: row.taskId },
      data: { rank },
    });
    rank += 1000;
  }
}
