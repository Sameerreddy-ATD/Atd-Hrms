import type { AssetCostFrequency, AssetType, Prisma, PrismaClient } from "@prisma/client";
import {
  annualEquivalent,
  emptyInvestmentRow,
  equalCostShare,
  lifetimeCostForAssignment,
  monthlyEquivalent,
  type InvestmentAccumulator,
} from "./assetInvestment.js";

export type AssetOperationalStatus = "AVAILABLE" | "ASSIGNED" | "UNDER_REPAIR" | "RETIRED";

/**
 * Assignment wins: if an employee is linked, status is always ASSIGNED.
 * Clearing the assignee with previous ASSIGNED falls back to AVAILABLE.
 */
export function resolveAssetStatus(input: {
  assignedEmployeeId: string | null;
  activeAssignmentCount?: number;
  requestedStatus?: AssetOperationalStatus;
  previousStatus?: string;
}) {
  const hasAssignee =
    Boolean(input.assignedEmployeeId) || (input.activeAssignmentCount ?? 0) > 0;
  if (hasAssignee) return "ASSIGNED";
  if (input.requestedStatus === "ASSIGNED") {
    throw new Error("An asset cannot be marked assigned without an employee");
  }
  if (input.requestedStatus) return input.requestedStatus;
  return input.previousStatus === "ASSIGNED" ? "AVAILABLE" : (input.previousStatus ?? "AVAILABLE");
}

type Tx = Prisma.TransactionClient | PrismaClient;

export async function recountActiveSeats(tx: Tx, assetId: string) {
  return tx.assetAssignment.count({
    where: { assetId, returnedAt: null },
  });
}

export async function recalculateActiveCostShares(
  tx: Tx,
  asset: { assetId: string; purchaseValue: Prisma.Decimal | number; costFrequency: AssetCostFrequency },
) {
  const active = await tx.assetAssignment.findMany({
    where: { assetId: asset.assetId, returnedAt: null },
    select: { assignmentId: true },
  });
  const share = equalCostShare(Number(asset.purchaseValue), active.length);
  if (active.length === 0) return { seatCount: 0, share: 0 };
  await tx.assetAssignment.updateMany({
    where: { assetId: asset.assetId, returnedAt: null },
    data: {
      costShareAmount: share,
      costShareFrequency: asset.costFrequency,
    },
  });
  return { seatCount: active.length, share };
}

export async function syncAssetAssigneeDenorm(tx: Tx, assetId: string) {
  const active = await tx.assetAssignment.findMany({
    where: { assetId, returnedAt: null },
    orderBy: { assignedAt: "asc" },
    select: { employeeId: true },
  });
  const asset = await tx.companyAsset.findUniqueOrThrow({ where: { assetId } });
  let status: string;
  try {
    status = resolveAssetStatus({
      assignedEmployeeId: active[0]?.employeeId ?? null,
      activeAssignmentCount: active.length,
      previousStatus: asset.status,
      requestedStatus:
        asset.status === "UNDER_REPAIR" || asset.status === "RETIRED"
          ? (asset.status as AssetOperationalStatus)
          : undefined,
    });
  } catch {
    status = active.length ? "ASSIGNED" : asset.status === "RETIRED" ? "RETIRED" : "AVAILABLE";
  }
  // Physical employee assets keep a single denormalized assignee; online multi-seat clears it when >1.
  const denormAssignee =
    active.length === 1 ? active[0]!.employeeId : active.length === 0 ? null : null;

  return tx.companyAsset.update({
    where: { assetId },
    data: {
      assignedEmployeeId: denormAssignee,
      status: asset.status === "RETIRED" ? "RETIRED" : status,
    },
    include: {
      assignedEmployee: true,
      branch: true,
      assignments: {
        where: { returnedAt: null },
        include: { employee: { select: { employeeId: true, name: true, employeeCode: true } } },
        orderBy: { assignedAt: "asc" },
      },
    },
  });
}

export async function assignEmployeeToAsset(
  tx: Tx,
  input: {
    assetId: string;
    employeeId: string;
    visibleToEmployee: boolean;
    assetType: AssetType;
    assignmentScope: "EMPLOYEE" | "COMPANY";
    purchaseValue: number;
    costFrequency: AssetCostFrequency;
  },
) {
  if (input.assignmentScope === "COMPANY") {
    throw new Error("Company-use assets cannot be assigned to an employee");
  }
  const existingActive = await tx.assetAssignment.findFirst({
    where: { assetId: input.assetId, employeeId: input.employeeId, returnedAt: null },
  });
  if (existingActive) throw new Error("Employee is already assigned to this asset");

  if (input.assetType === "PHYSICAL") {
    const other = await tx.assetAssignment.findFirst({
      where: { assetId: input.assetId, returnedAt: null },
    });
    if (other) throw new Error("Physical assets can only be assigned to one employee");
  }

  const seatCount = (await recountActiveSeats(tx, input.assetId)) + 1;
  const share = equalCostShare(input.purchaseValue, seatCount);

  await tx.assetAssignment.create({
    data: {
      assetId: input.assetId,
      employeeId: input.employeeId,
      visibleToEmployee: input.visibleToEmployee,
      costShareAmount: share,
      costShareFrequency: input.costFrequency,
    },
  });

  await recalculateActiveCostShares(tx, {
    assetId: input.assetId,
    purchaseValue: input.purchaseValue,
    costFrequency: input.costFrequency,
  });

  return syncAssetAssigneeDenorm(tx, input.assetId);
}

export async function returnAssetAssignment(
  tx: Tx,
  input: { assetId: string; employeeId?: string | null },
) {
  const active = await tx.assetAssignment.findMany({
    where: {
      assetId: input.assetId,
      returnedAt: null,
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
    },
  });
  if (!active.length) throw new Error("No active assignment to return");

  const now = new Date();
  await tx.assetAssignment.updateMany({
    where: { assignmentId: { in: active.map((row) => row.assignmentId) } },
    data: { returnedAt: now },
  });

  const asset = await tx.companyAsset.findUniqueOrThrow({ where: { assetId: input.assetId } });
  await recalculateActiveCostShares(tx, {
    assetId: asset.assetId,
    purchaseValue: Number(asset.purchaseValue),
    costFrequency: asset.costFrequency,
  });
  return syncAssetAssigneeDenorm(tx, input.assetId);
}

export function buildInvestmentSummary(
  rows: Array<{
    employeeId: string;
    employee: { employeeId: string; name: string; employeeCode: string; department?: { name: string } | null };
    visibleToEmployee: boolean;
    assignedAt: Date;
    returnedAt: Date | null;
    costShareAmount: { toString(): string } | number;
    costShareFrequency: AssetCostFrequency;
    asset: { assetType: AssetType; status: string };
  }>,
) {
  const summary = new Map<string, InvestmentAccumulator>();
  for (const row of rows) {
    if (row.asset.status === "RETIRED" && row.returnedAt) {
      // Still count lifetime for returned seats on retired assets.
    }
    const acc =
      summary.get(row.employeeId) ??
      emptyInvestmentRow({
        employeeId: row.employee.employeeId,
        employeeName: row.employee.name,
        employeeCode: row.employee.employeeCode,
        department: row.employee.department?.name,
      });
    const amount = Number(row.costShareAmount);
    const active = !row.returnedAt;
    if (active) {
      if (row.asset.assetType === "PHYSICAL") acc.physicalAssets += 1;
      else acc.onlineAssets += 1;
      if (row.costShareFrequency === "ONE_TIME") acc.oneTimeInvestment += amount;
      acc.monthlyRecurring += monthlyEquivalent(amount, row.costShareFrequency);
      acc.annualRecurring += annualEquivalent(amount, row.costShareFrequency);
    }
    acc.lifetimeInvestment += lifetimeCostForAssignment({
      costShareAmount: amount,
      costShareFrequency: row.costShareFrequency,
      assignedAt: row.assignedAt,
      returnedAt: row.returnedAt,
    });
    acc.firstYearInvestment = acc.oneTimeInvestment + acc.annualRecurring;
    summary.set(row.employeeId, acc);
  }
  return [...summary.values()].sort((a, b) => b.lifetimeInvestment - a.lifetimeInvestment);
}
