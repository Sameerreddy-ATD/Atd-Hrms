import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function audit(input: {
  action: string;
  performedByUserId?: string;
  affectedUserId?: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string;
}) {
  return prisma.auditLog.create({ data: input });
}
