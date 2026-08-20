import { PrismaClient, EmployeeStatus, Role } from "@prisma/client";

const prisma = new PrismaClient();

const UNIT_FIXTURE = [
  ["CHIEF_OF_STAFF", "Chief of Staff", null],
  ["CHIEF_OF_OPERATIONS", "Chief of Operations", "CHIEF_OF_STAFF"],
  ["SALES_TEAM", "Sales Team", "CHIEF_OF_OPERATIONS"],
  ["OPERATIONS", "Operations Department", "CHIEF_OF_OPERATIONS"],
  ["MAINTENANCE", "Maintenance Manager", "OPERATIONS"],
  ["PROCUREMENT", "Procurement", "MAINTENANCE"],
  ["FLEET_DRIVER", "Fleet & Driver Team", "MAINTENANCE"],
  ["ANALYTICS", "Analytics", "OPERATIONS"],
  ["ROUTING_PLANNING", "Routing & Planning", "OPERATIONS"],
  ["SPECIAL_PROJECTS", "Special Projects", "CHIEF_OF_OPERATIONS"],
  ["PRINCIPAL_ADVISOR", "Principal Advisor", "CHIEF_OF_STAFF"],
  ["HR", "Hr Department", "PRINCIPAL_ADVISOR"],
  ["INTERNS", "Interns", "PRINCIPAL_ADVISOR"],
  ["SOFTWARE", "Software", "CHIEF_OF_STAFF"],
  ["INSIDE_SALES", "Inside Sales", "CHIEF_OF_STAFF"],
  ["MARKETING", "Marketing", "CHIEF_OF_STAFF"],
  ["ACCOUNTS", "Accounts Team", "CHIEF_OF_STAFF"],
  ["ADVISOR_GROWTH_STRATEGY", "Advisor Growth & Strategy", "CHIEF_OF_STAFF"],
  ["COMPLIANCE", "Compliance", "CHIEF_OF_STAFF"],
  ["EXECUTIVE_LEADERSHIP", "Executive Leadership", null],
];

const ROLE_FIXTURE = [
  Role.DEVELOPER_ADMIN,
  Role.MAIN_ADMIN,
  Role.CEO,
  Role.CHIEF_OF_STAFF,
  Role.HR,
  Role.MANAGER,
  Role.EMPLOYEE,
  Role.SALES,
  Role.DRIVER,
  Role.FIELD_STAFF,
];

async function main() {
  await prisma.employeeOrganizationAssignment.deleteMany();
  await prisma.departmentHeadAssignment.deleteMany();
  await prisma.departmentViewerAssignment.deleteMany();
  await prisma.user.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.department.deleteMany();

  const unitIdByCode = new Map();
  for (const [code, name, parentCode] of UNIT_FIXTURE) {
    const unit = await prisma.department.create({
      data: {
        unitCode: code,
        name,
        parentDepartmentId: parentCode ? unitIdByCode.get(parentCode) : null,
        unitType: parentCode ? "SUBTEAM" : "TEAM",
        sortOrder: unitIdByCode.size,
        active: true,
      },
    });
    unitIdByCode.set(code, unit.departmentId);
  }

  const ceo = await prisma.employee.create({
    data: {
      employeeCode: "CEO001",
      name: "CEO Person",
      email: "ceo.fixture@test.local",
      status: EmployeeStatus.ACTIVE,
      organizationLevel: "HEAD",
      joiningDate: new Date("2024-01-01"),
    },
  });
  await prisma.user.create({
    data: {
      employeeId: ceo.employeeId,
      name: ceo.name,
      email: "ceo.login.fixture@test.local",
      role: Role.CEO,
      passwordHash: "x",
    },
  });

  let idx = 1;
  for (const role of ROLE_FIXTURE.filter((item) => item !== Role.CEO)) {
    const departmentId =
      role === Role.CHIEF_OF_STAFF
        ? unitIdByCode.get("CHIEF_OF_STAFF")
        : role === Role.HR
          ? unitIdByCode.get("HR")
          : role === Role.SALES
            ? unitIdByCode.get("INSIDE_SALES")
            : role === Role.DRIVER
              ? unitIdByCode.get("FLEET_DRIVER")
              : unitIdByCode.get("SOFTWARE");
    const employee = await prisma.employee.create({
      data: {
        employeeCode: `FIX${String(idx).padStart(3, "0")}`,
        name: `Role ${role}`,
        email: `role-${role.toLowerCase()}@fixture.test`,
        status: EmployeeStatus.ACTIVE,
        departmentId,
        organizationLevel:
          role === Role.MAIN_ADMIN || role === Role.CHIEF_OF_STAFF || role === Role.MANAGER
            ? "HEAD"
            : "MEMBER",
        joiningDate: new Date(`2024-01-${String((idx % 9) + 1).padStart(2, "0")}`),
      },
    });
    await prisma.user.create({
      data: {
        employeeId: employee.employeeId,
        name: employee.name,
        email: `login-${role.toLowerCase()}@fixture.test`,
        role,
        passwordHash: "x",
      },
    });
    idx += 1;
  }

  const salesHead1 = await prisma.employee.create({
    data: {
      employeeCode: "H001",
      name: "Inside Sales Head 1",
      email: "h1@fixture.test",
      status: EmployeeStatus.ACTIVE,
      departmentId: unitIdByCode.get("INSIDE_SALES"),
      organizationLevel: "HEAD",
      joiningDate: new Date("2024-01-10"),
    },
  });
  const salesHead2 = await prisma.employee.create({
    data: {
      employeeCode: "H002",
      name: "Inside Sales Head 2",
      email: "h2@fixture.test",
      status: EmployeeStatus.ACTIVE,
      departmentId: unitIdByCode.get("INSIDE_SALES"),
      organizationLevel: "HEAD",
      joiningDate: new Date("2024-01-11"),
    },
  });
  const multiHead = await prisma.employee.create({
    data: {
      employeeCode: "H003",
      name: "Multi Head",
      email: "h3@fixture.test",
      status: EmployeeStatus.ACTIVE,
      departmentId: unitIdByCode.get("MARKETING"),
      organizationLevel: "HEAD",
      joiningDate: new Date("2024-01-12"),
    },
  });
  const viewer = await prisma.employee.create({
    data: {
      employeeCode: "V001",
      name: "Viewer User",
      email: "viewer@fixture.test",
      status: EmployeeStatus.ACTIVE,
      departmentId: unitIdByCode.get("ANALYTICS"),
      organizationLevel: "MEMBER",
      joiningDate: new Date("2024-01-13"),
    },
  });

  const memberFixtures = [
    ["ANALYTICS", "Analyst A", "E100"],
    ["ROUTING_PLANNING", "Planner B", "E101"],
    ["PROCUREMENT", "Buyer C", "E102"],
    ["FLEET_DRIVER", "Driver D", "E103"],
    ["HR", "HR E", "E104"],
  ];
  for (const [code, name, employeeCode] of memberFixtures) {
    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        name,
        email: `${employeeCode.toLowerCase()}@fixture.test`,
        status: EmployeeStatus.ACTIVE,
        departmentId: unitIdByCode.get(code),
        organizationLevel: "MEMBER",
        joiningDate: new Date("2024-02-01"),
      },
    });
    await prisma.employeeOrganizationAssignment.create({
      data: {
        employeeId: employee.employeeId,
        departmentId: unitIdByCode.get(code),
        organizationLevel: "MEMBER",
        isPrimary: true,
        effectiveFrom: new Date("2024-02-01"),
      },
    });
  }

  for (const [employeeId, code, isPrimary] of [
    [salesHead1.employeeId, "INSIDE_SALES", true],
    [salesHead2.employeeId, "INSIDE_SALES", false],
    [multiHead.employeeId, "MARKETING", true],
    [multiHead.employeeId, "COMPLIANCE", true],
  ]) {
    await prisma.departmentHeadAssignment.create({
      data: {
        departmentId: unitIdByCode.get(code),
        employeeId,
        isPrimary,
        effectiveFrom: new Date("2024-02-01"),
        sortOrder: isPrimary ? 0 : 1,
      },
    });
  }
  await prisma.departmentViewerAssignment.create({
    data: {
      departmentId: unitIdByCode.get("ANALYTICS"),
      employeeId: viewer.employeeId,
      effectiveFrom: new Date("2024-02-01"),
    },
  });

  for (const code of ["INSIDE_SALES", "MARKETING", "COMPLIANCE"]) {
    const heads = await prisma.departmentHeadAssignment.findMany({
      where: { departmentId: unitIdByCode.get(code), effectiveTo: null },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    });
    await prisma.department.update({
      where: { departmentId: unitIdByCode.get(code) },
      data: {
        headEmployeeId: heads.find((row) => row.isPrimary)?.employeeId ?? heads[0]?.employeeId ?? null,
      },
    });
  }

  const rows = await prisma.department.findMany({ orderBy: { sortOrder: "asc" } });
  const duplicateCodes = new Set();
  const seenCodes = new Set();
  for (const row of rows) {
    if (seenCodes.has(row.unitCode)) duplicateCodes.add(row.unitCode);
    seenCodes.add(row.unitCode);
  }

  const hierarchyViolations = rows.filter((row) => {
    if (!row.parentDepartmentId) return false;
    return !rows.some((candidate) => candidate.departmentId === row.parentDepartmentId);
  }).length;

  const insideSalesHeads = await prisma.departmentHeadAssignment.count({
    where: { departmentId: unitIdByCode.get("INSIDE_SALES"), effectiveTo: null },
  });
  const multiHeadCount = await prisma.departmentHeadAssignment.count({
    where: { employeeId: multiHead.employeeId, effectiveTo: null },
  });
  const viewerCount = await prisma.departmentViewerAssignment.count({ where: { effectiveTo: null } });
  const assignedEmployees = await prisma.employee.count({ where: { departmentId: { not: null } } });
  const activePrimaryGroups = await prisma.employeeOrganizationAssignment.groupBy({
    by: ["employeeId"],
    where: { isPrimary: true, effectiveTo: null },
    _count: { _all: true },
  });
  const badPrimaryAssignmentCount = activePrimaryGroups.filter((row) => row._count._all !== 1).length;
  const cacheMismatchCount = (
    await Promise.all(
      rows.map(async (row) => {
        if (!row.headEmployeeId) return 0;
        const activePrimary = await prisma.departmentHeadAssignment.findFirst({
          where: {
            departmentId: row.departmentId,
            effectiveTo: null,
            isPrimary: true,
          },
        });
        return activePrimary?.employeeId === row.headEmployeeId ? 0 : 1;
      }),
    )
  ).reduce((sum, value) => sum + value, 0);

  const hrUnit = await prisma.department.findUniqueOrThrow({
    where: { departmentId: unitIdByCode.get("HR") },
  });
  await prisma.department.update({
    where: { departmentId: hrUnit.departmentId },
    data: { name: "People & Culture" },
  });
  const hrAfterRename = await prisma.department.findUniqueOrThrow({
    where: { departmentId: hrUnit.departmentId },
  });

  const result = {
    unitCount: rows.length,
    expectedUnitCount: UNIT_FIXTURE.length,
    unitCodesUnique: duplicateCodes.size === 0,
    hierarchyPreserved: hierarchyViolations === 0,
    insideSalesHeads,
    multiHeadCount,
    viewerCount,
    assignedEmployees,
    ceoDepartmentNull: (await prisma.employee.findUniqueOrThrow({
      where: { employeeId: ceo.employeeId },
    })).departmentId === null,
    activePrimaryAssignmentViolations: badPrimaryAssignmentCount,
    hrCodeAfterRename: hrAfterRename.unitCode,
    cacheMismatchCount,
    units: rows.map((row) => ({ name: row.name, unitCode: row.unitCode, active: row.active })),
  };

  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
