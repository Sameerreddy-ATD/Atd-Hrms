import { prisma } from "./prisma.js";

export async function ensureChecklistInstance(
  employeeId: string,
  kind: "ONBOARDING" | "OFFBOARDING",
) {
  const existing = await prisma.checklistInstance.findFirst({
    where: { employeeId, kind, status: "OPEN" },
    select: { instanceId: true },
  });
  if (existing) return existing;

  const template = await prisma.checklistTemplate.findFirst({
    where: { kind, isActive: true },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template || template.items.length === 0) return null;

  return prisma.checklistInstance.create({
    data: {
      templateId: template.templateId,
      employeeId,
      kind,
      items: {
        create: template.items.map((item) => ({
          title: item.title,
          linkPath: item.linkPath,
          sortOrder: item.sortOrder,
        })),
      },
    },
    select: { instanceId: true },
  });
}
