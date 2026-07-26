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

/** Marks open onboarding face-registration checklist items complete after enrollment approval. */
export async function completeFaceEnrollmentChecklistItems(employeeId: string) {
  const open = await prisma.checklistInstance.findMany({
    where: { employeeId, kind: "ONBOARDING", status: "OPEN" },
    include: { items: true },
  });
  const faceItemIds = open.flatMap((instance) =>
    instance.items
      .filter(
        (item) =>
          !item.completed &&
          (/face/i.test(item.title) ||
            item.linkPath === "/dashboard" ||
            item.linkPath === "/face-enrollment"),
      )
      .map((item) => item.stateId),
  );
  if (faceItemIds.length === 0) return 0;
  await prisma.checklistItemState.updateMany({
    where: { stateId: { in: faceItemIds } },
    data: { completed: true, completedAt: new Date() },
  });

  for (const instance of open) {
    const remaining = await prisma.checklistItemState.count({
      where: { instanceId: instance.instanceId, completed: false },
    });
    if (remaining === 0) {
      await prisma.checklistInstance.update({
        where: { instanceId: instance.instanceId },
        data: { status: "COMPLETED" },
      });
    }
  }
  return faceItemIds.length;
}
