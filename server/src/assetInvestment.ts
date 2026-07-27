import type { AssetCostFrequency } from "@prisma/client";

export function equalCostShare(total: number, seatCount: number) {
  if (seatCount <= 0) return 0;
  return Math.round((total / seatCount) * 100) / 100;
}

/** Approximate months between two dates (minimum one day counts as a fraction). */
export function monthsBetween(start: Date, end: Date) {
  const ms = Math.max(0, end.getTime() - start.getTime());
  return Math.max(ms / (1000 * 60 * 60 * 24 * 30.4375), 0);
}

export function monthlyEquivalent(amount: number, frequency: AssetCostFrequency | string) {
  if (frequency === "MONTHLY") return amount;
  if (frequency === "YEARLY") return amount / 12;
  return 0;
}

export function annualEquivalent(amount: number, frequency: AssetCostFrequency | string) {
  if (frequency === "MONTHLY") return amount * 12;
  if (frequency === "YEARLY") return amount;
  return 0;
}

export function lifetimeCostForAssignment(input: {
  costShareAmount: number;
  costShareFrequency: AssetCostFrequency | string;
  assignedAt: Date;
  returnedAt?: Date | null;
  asOf?: Date;
}) {
  const amount = Number(input.costShareAmount);
  if (input.costShareFrequency === "ONE_TIME") return amount;
  const end = input.returnedAt ?? input.asOf ?? new Date();
  const months = monthsBetween(input.assignedAt, end);
  return monthlyEquivalent(amount, input.costShareFrequency) * months;
}

export type InvestmentAccumulator = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department?: string;
  physicalAssets: number;
  onlineAssets: number;
  oneTimeInvestment: number;
  monthlyRecurring: number;
  annualRecurring: number;
  firstYearInvestment: number;
  lifetimeInvestment: number;
};

export function emptyInvestmentRow(input: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department?: string;
}): InvestmentAccumulator {
  return {
    ...input,
    physicalAssets: 0,
    onlineAssets: 0,
    oneTimeInvestment: 0,
    monthlyRecurring: 0,
    annualRecurring: 0,
    firstYearInvestment: 0,
    lifetimeInvestment: 0,
  };
}
