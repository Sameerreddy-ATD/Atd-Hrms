/**
 * One-off / ops: reassign login roles from organization units.
 *
 * Usage (on the app server, from the deploy directory):
 *   node --import tsx scripts/sync-login-roles-from-org-units.mjs
 * or after build:
 *   node dist-scripts/... 
 *
 * Safe to re-run. Skips DEVELOPER_ADMIN. Does not change department head assignments.
 */
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

function formatPath(unit, byId) {
  if (!unit) return "";
  const names = [];
  const seen = new Set();
  let cursor = unit;
  while (cursor) {
    if (seen.has(cursor.departmentId)) break;
    seen.add(cursor.departmentId);
    if (cursor.name?.trim()) names.unshift(cursor.name.trim());
    cursor = cursor.parentDepartmentId ? byId.get(cursor.parentDepartmentId) : null;
  }
  return names.join(" / ");
}

function resolveRole(unitName, unitPath) {
  const name = (unitName ?? "").trim().toLowerCase();
  const path = (unitPath ?? name).trim().toLowerCase();
  if (!name && !path) return Role.CEO;
  if (name === "executive leadership") return Role.CEO;
  if (
    name.includes("fleet & driver") ||
    path.includes("fleet & driver") ||
    name === "drivers" ||
    path === "drivers"
  ) {
    return Role.DRIVER;
  }
  if (
    name === "hr" ||
    name.includes("hr department") ||
    name.includes("human resources") ||
    path.includes("human resources") ||
    /(^|\/)\s*hr(\s|\/|$)/.test(path)
  ) {
    return Role.HR;
  }
  if (
    name.includes("sales") ||
    path.includes("sales team") ||
    path.includes("inside sales") ||
    path.includes("field sales") ||
    path.includes("tele sales")
  ) {
    return Role.SALES;
  }
  return Role.EMPLOYEE;
}

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const departments = await prisma.department.findMany({
    select: { departmentId: true, name: true, parentDepartmentId: true },
  });
  const byId = new Map(departments.map((d) => [d.departmentId, d]));

  const users = await prisma.user.findMany({
    where: { role: { not: Role.DEVELOPER_ADMIN } },
    include: {
      employee: { select: { employeeId: true, name: true, departmentId: true, employeeCode: true } },
    },
  });

  const changes = [];
  for (const user of users) {
    const deptId = user.employee?.departmentId ?? null;
    const unit = deptId ? byId.get(deptId) : null;
    const path = formatPath(unit, byId);
    const nextRole = resolveRole(unit?.name, path);
    if (user.role === nextRole) continue;
    changes.push({
      email: user.email,
      name: user.employee?.name || user.name,
      code: user.employee?.employeeCode || "",
      from: user.role,
      to: nextRole,
      unit: path || "(no unit → CEO)",
      userId: user.id,
    });
  }

  console.log(`Users scanned: ${users.length}`);
  console.log(`Role changes: ${changes.length}${dryRun ? " (dry-run)" : ""}`);
  for (const row of changes) {
    console.log(
      `  ${row.code || "-"} | ${row.name} <${row.email}> | ${row.from} → ${row.to} | ${row.unit}`,
    );
  }

  if (!dryRun && changes.length) {
    for (const row of changes) {
      await prisma.user.update({
        where: { id: row.userId },
        data: { role: row.to },
      });
    }
    console.log(`Updated ${changes.length} login roles.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
