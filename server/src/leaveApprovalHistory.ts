/**
 * Append-only Leave approval / status history.
 */
import type { LeaveStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { audit } from "./audit.js";

export const LeaveHistoryAction = {
  SUBMITTED: "SUBMITTED",
  MANAGER_APPROVED: "MANAGER_APPROVED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
  CANCELLED: "CANCELLED",
  HR_OVERRIDE: "HR_OVERRIDE",
} as const;

export type LeaveHistoryActionName =
  (typeof LeaveHistoryAction)[keyof typeof LeaveHistoryAction];

export async function recordLeaveHistory(input: {
  leaveRequestId: string;
  actorUserId?: string | null;
  action: LeaveHistoryActionName;
  fromStatus?: LeaveStatus | string | null;
  toStatus?: LeaveStatus | string | null;
  note?: string | null;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  const row = await db.leaveApprovalHistory.create({
    data: {
      leaveRequestId: input.leaveRequestId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      fromStatus: input.fromStatus ? String(input.fromStatus) : null,
      toStatus: input.toStatus ? String(input.toStatus) : null,
      note: input.note?.trim() || null,
    },
  });
  if (!input.tx) {
    await audit({
      action: `LEAVE_${input.action}`,
      performedByUserId: input.actorUserId ?? undefined,
      newValue: {
        leaveRequestId: input.leaveRequestId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        note: input.note ?? null,
        historyId: row.historyId,
      },
    });
  }
  return row;
}
