/**
 * Deterministic E2E seed for disposable MySQL.
 * Creates the 20-unit organization fixture and synthetic users with real bcrypt passwords.
 *
 * Password for every E2E account: E2eTestPass123!
 * (test-only disposable database — never use on production)
 */
import { hash } from "@node-rs/bcrypt";
import { PrismaClient, EmployeeStatus, Role } from "@prisma/client";

const prisma = new PrismaClient();
export const E2E_PASSWORD = "E2eTestPass123!";

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

/** Maps E2E user keys to login email addresses. */
export const E2E_USER_EMAILS = {
  developer_admin: "e2e-developer_admin@test.local",
  ceo: "e2e-ceo@test.local",
  chief_of_staff: "e2e-chief_of_staff@test.local",
  manager: "e2e-manager@test.local",
  employee: "e2e-employee@test.local",
  hr: "e2e-hr@test.local",
  sales: "e2e-sales@test.local",
  driver: "e2e-driver@test.local",
  viewer: "e2e-viewer@test.local",
};

async function main() {
  const passwordHash = await hash(E2E_PASSWORD, 12);

  // Disposable DB only: reset org fixture quickly even after partial E2E mutations.
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
  await prisma.checklistItemState.deleteMany().catch(() => undefined);
  await prisma.checklistInstance.deleteMany().catch(() => undefined);
  await prisma.notificationPreference.deleteMany().catch(() => undefined);
  // Attendance must be cleared while FK checks are off — otherwise orphan Workdays
  // break /attendance/exceptions/detect (P2003 on employee_id).
  await prisma.attendanceException.deleteMany().catch(() => undefined);
  await prisma.attendanceSession.deleteMany().catch(() => undefined);
  await prisma.attendanceCorrectionRequest.deleteMany().catch(() => undefined);
  await prisma.attendanceEvent.deleteMany().catch(() => undefined);
  await prisma.attendanceWorkday.deleteMany().catch(() => undefined);
  await prisma.attendanceDailySummary.deleteMany().catch(() => undefined);
  await prisma.leaveApprovalHistory.deleteMany().catch(() => undefined);
  await prisma.leaveLedgerEntry.deleteMany().catch(() => undefined);
  await prisma.leaveRequest.deleteMany().catch(() => undefined);
  await prisma.leaveBalance.deleteMany().catch(() => undefined);
  await prisma.compOffCredit.deleteMany().catch(() => undefined);
  await prisma.weeklyOffRequest.deleteMany().catch(() => undefined);
  await prisma.employeeOrganizationAssignment.deleteMany();
  await prisma.departmentHeadAssignment.deleteMany();
  await prisma.departmentViewerAssignment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.employeeChangeEvent.deleteMany().catch(() => undefined);
  await prisma.userSession.deleteMany().catch(() => undefined);
  await prisma.taskAttachment.deleteMany().catch(() => undefined);
  await prisma.taskUpdate.deleteMany().catch(() => undefined);
  await prisma.taskAssignment.deleteMany().catch(() => undefined);
  await prisma.workTask.updateMany({ data: { parentTaskId: null } }).catch(() => undefined);
  await prisma.workTask.deleteMany().catch(() => undefined);
  await prisma.taskStage.deleteMany().catch(() => undefined);
  await prisma.taskBoardMember.deleteMany().catch(() => undefined);
  await prisma.taskBoardDepartment.deleteMany().catch(() => undefined);
  await prisma.taskBoard.deleteMany().catch(() => undefined);
  await prisma.user.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.department.deleteMany();
  await prisma.branch.deleteMany().catch(() => undefined);
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");

  // Create Login UI needs at least one attendance location option.
  const hq = await prisma.branch.create({
    data: {
      branchName: "E2E HQ",
      branchCode: "E2E_HQ",
      address: "E2E Test Address",
      city: "Hyderabad",
      status: "ACTIVE",
      latitude: 17.385,
      longitude: 78.4867,
      attendanceRadiusMeters: 250,
      isHub: true,
    },
  });

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
        // Disposable E2E: GPS punches without live face capture.
        faceVerificationEnabled: false,
      },
    });
    unitIdByCode.set(code, unit.departmentId);
  }

  async function createUser({
    key,
    role,
    name,
    departmentId = null,
    organizationLevel = "MEMBER",
    employeeCode,
  }) {
    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        name,
        email: `${employeeCode.toLowerCase()}@employee.test.local`,
        status: EmployeeStatus.ACTIVE,
        departmentId,
        organizationLevel,
        joiningDate: new Date("2024-01-01"),
        homeBranchId: hq.branchId,
        attendanceRequired: true,
      },
    });
    if (departmentId) {
      await prisma.employeeOrganizationAssignment.create({
        data: {
          employeeId: employee.employeeId,
          departmentId,
          organizationLevel,
          isPrimary: true,
          effectiveFrom: new Date("2024-01-01"),
        },
      });
    }
    await prisma.user.create({
      data: {
        employeeId: employee.employeeId,
        name,
        email: E2E_USER_EMAILS[key],
        role,
        passwordHash,
        firstLoginPasswordChangeRequired: false,
        status: "ACTIVE",
      },
    });
    return employee;
  }

  await createUser({
    key: "ceo",
    role: Role.CEO,
    name: "E2E CEO",
    organizationLevel: "HEAD",
    employeeCode: "E2E-CEO",
  });

  await createUser({
    key: "developer_admin",
    role: Role.DEVELOPER_ADMIN,
    name: "E2E Developer Admin",
    departmentId: unitIdByCode.get("SOFTWARE"),
    organizationLevel: "MEMBER",
    employeeCode: "E2E-DEV",
  });

  await createUser({
    key: "chief_of_staff",
    role: Role.CHIEF_OF_STAFF,
    name: "E2E Chief of Staff",
    departmentId: unitIdByCode.get("CHIEF_OF_STAFF"),
    organizationLevel: "HEAD",
    employeeCode: "E2E-COS",
  });

  const opsHead = await createUser({
    key: "manager",
    role: Role.MANAGER,
    name: "E2E Operations Head",
    departmentId: unitIdByCode.get("OPERATIONS"),
    organizationLevel: "HEAD",
    employeeCode: "E2E-OPS",
  });

  await createUser({
    key: "employee",
    role: Role.EMPLOYEE,
    name: "E2E Analyst",
    departmentId: unitIdByCode.get("ANALYTICS"),
    organizationLevel: "MEMBER",
    employeeCode: "E2E-ANALYST",
  });

  await createUser({
    key: "hr",
    role: Role.HR,
    name: "E2E HR",
    departmentId: unitIdByCode.get("HR"),
    organizationLevel: "MEMBER",
    employeeCode: "E2E-HR",
  });

  await createUser({
    key: "sales",
    role: Role.SALES,
    name: "E2E Sales",
    departmentId: unitIdByCode.get("INSIDE_SALES"),
    organizationLevel: "MEMBER",
    employeeCode: "E2E-SALES",
  });

  await createUser({
    key: "driver",
    role: Role.DRIVER,
    name: "E2E Bowser Pilot",
    departmentId: unitIdByCode.get("FLEET_DRIVER"),
    organizationLevel: "MEMBER",
    employeeCode: "E2E-DRIVER",
  });

  const viewerEmployee = await createUser({
    key: "viewer",
    role: Role.EMPLOYEE,
    name: "E2E Viewer",
    departmentId: unitIdByCode.get("ANALYTICS"),
    organizationLevel: "MEMBER",
    employeeCode: "E2E-VIEWER",
  });

  const salesHead1 = await prisma.employee.create({
    data: {
      employeeCode: "E2E-H1",
      name: "Inside Sales Head 1",
      email: "e2e-h1@employee.test.local",
      status: EmployeeStatus.ACTIVE,
      departmentId: unitIdByCode.get("INSIDE_SALES"),
      organizationLevel: "HEAD",
      joiningDate: new Date("2024-01-10"),
      homeBranchId: hq.branchId,
    },
  });
  const salesHead2 = await prisma.employee.create({
    data: {
      employeeCode: "E2E-H2",
      name: "Inside Sales Head 2",
      email: "e2e-h2@employee.test.local",
      status: EmployeeStatus.ACTIVE,
      departmentId: unitIdByCode.get("INSIDE_SALES"),
      organizationLevel: "HEAD",
      joiningDate: new Date("2024-01-11"),
      homeBranchId: hq.branchId,
    },
  });

  for (const [employeeId, code, isPrimary] of [
    [opsHead.employeeId, "OPERATIONS", true],
    [salesHead1.employeeId, "INSIDE_SALES", true],
    [salesHead2.employeeId, "INSIDE_SALES", false],
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
      employeeId: viewerEmployee.employeeId,
      effectiveFrom: new Date("2024-02-01"),
    },
  });

  // Extra synthetic people for Head / Viewer browser flows (no privileged login required).
  await prisma.employee.create({
    data: {
      employeeCode: "E2E-HEAD3",
      name: "E2E Head Candidate",
      email: "e2e-h3@employee.test.local",
      status: EmployeeStatus.ACTIVE,
      departmentId: unitIdByCode.get("MARKETING"),
      organizationLevel: "MEMBER",
      joiningDate: new Date("2024-03-01"),
    },
  });
  const viewerCandidate = await prisma.employee.create({
    data: {
      employeeCode: "E2E-VIEW2",
      name: "E2E Viewer Candidate",
      email: "e2e-view2@employee.test.local",
      status: EmployeeStatus.ACTIVE,
      departmentId: unitIdByCode.get("SOFTWARE"),
      organizationLevel: "MEMBER",
      joiningDate: new Date("2024-03-02"),
    },
  });
  await prisma.user.create({
    data: {
      employeeId: viewerCandidate.employeeId,
      name: "E2E Viewer Candidate",
      email: "e2e-viewer-candidate@test.local",
      role: Role.EMPLOYEE,
      passwordHash,
      firstLoginPasswordChangeRequired: false,
      status: "ACTIVE",
    },
  });
  await prisma.employeeOrganizationAssignment.create({
    data: {
      employeeId: viewerCandidate.employeeId,
      departmentId: unitIdByCode.get("SOFTWARE"),
      organizationLevel: "MEMBER",
      isPrimary: true,
      effectiveFrom: new Date("2024-03-02"),
    },
  });

  for (const code of ["OPERATIONS", "INSIDE_SALES"]) {
    const heads = await prisma.departmentHeadAssignment.findMany({
      where: { departmentId: unitIdByCode.get(code), effectiveTo: null },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    });
    await prisma.department.update({
      where: { departmentId: unitIdByCode.get(code) },
      data: {
        headEmployeeId:
          heads.find((row) => row.isPrimary)?.employeeId ?? heads[0]?.employeeId ?? null,
      },
    });
  }

  // Leave types required for Leave E2E (policy confirmation defaults preserved).
  for (const policy of [
    {
      leaveTypeId: "leave-casual",
      name: "Casual Leave",
      code: "CASUAL",
      paid: true,
      annualAllowance: 12,
      monthlyCredit: 1,
      carryForward: true,
      halfDayAllowed: true,
      requiresMedicalDocument: false,
      approvalRequired: true,
    },
    {
      leaveTypeId: "leave-sick",
      name: "Sick Leave",
      code: "SICK",
      paid: true,
      annualAllowance: 6,
      maxPerMonth: 2,
      carryForward: false,
      halfDayAllowed: true,
      requiresMedicalDocument: true,
      approvalRequired: true,
    },
    {
      leaveTypeId: "leave-lop",
      name: "Unpaid Leave / LOP",
      code: "LOP",
      paid: false,
      carryForward: false,
      halfDayAllowed: true,
      requiresMedicalDocument: false,
      approvalRequired: true,
    },
    {
      leaveTypeId: "leave-comp-off",
      name: "Comp Off",
      code: "COMP_OFF",
      paid: true,
      carryForward: false,
      halfDayAllowed: false,
      requiresMedicalDocument: false,
      approvalRequired: true,
    },
  ]) {
    const { leaveTypeId, ...data } = policy;
    await prisma.leaveType.upsert({
      where: { code: policy.code },
      update: data,
      create: { leaveTypeId, ...data },
    });
  }

  // Company default General Shift pointer (migration also sets this; seed is idempotent).
  await prisma.shiftDefinition.updateMany({
    where: { code: "GENERAL_0900_1800", name: "General Shift" },
    data: { name: "Day Shift 09:00–18:00" },
  });
  await prisma.shiftDefinition.updateMany({
    where: {
      shiftId: "shift-morning-0930",
      startMinutes: 570,
      endMinutes: 1110,
    },
    data: {
      name: "General Shift",
      expectedWorkMinutes: 540,
      timezone: "Asia/Kolkata",
    },
  });
  await prisma.systemSetting.upsert({
    where: { key: "attendance.defaultShiftId" },
    create: { key: "attendance.defaultShiftId", value: "shift-morning-0930" },
    update: {},
  });

  // Task Planner foundation fixtures — MEMBER_GATED AWF project with role matrix.
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E_USER_EMAILS.developer_admin },
  });
  const adminEmployee = await prisma.employee.findFirstOrThrow({
    where: { employeeCode: "E2E-DEV" },
  });
  const leadEmployee = await prisma.employee.findFirstOrThrow({
    where: { employeeCode: "E2E-OPS" },
  });
  const memberEmployee = await prisma.employee.findFirstOrThrow({
    where: { employeeCode: "E2E-ANALYST" },
  });
  const viewerEmp = await prisma.employee.findFirstOrThrow({
    where: { employeeCode: "E2E-VIEWER" },
  });

  const { TaskBoardAccessType, TaskProjectRole, TaskStatus, TaskStatusCategory } = await import(
    "@prisma/client"
  );

  await prisma.taskBoard.create({
    data: {
      name: "Anytime Workforce",
      keyPrefix: "AWF",
      nextIssueNumber: 1,
      description: "E2E Task Planner foundation project",
      accessType: TaskBoardAccessType.MEMBER_GATED,
      createdByUserId: adminUser.id,
      leadEmployeeId: leadEmployee.employeeId,
      stages: {
        create: [
          {
            name: "To do",
            color: "SLATE",
            status: TaskStatus.TODO,
            statusCategory: TaskStatusCategory.TODO,
            sortOrder: 0,
          },
          {
            name: "In progress",
            color: "BLUE",
            status: TaskStatus.IN_PROGRESS,
            statusCategory: TaskStatusCategory.IN_PROGRESS,
            sortOrder: 1,
          },
          {
            name: "Done",
            color: "EMERALD",
            status: TaskStatus.COMPLETED,
            statusCategory: TaskStatusCategory.DONE,
            isCompleted: true,
            sortOrder: 2,
          },
        ],
      },
      members: {
        create: [
          { employeeId: adminEmployee.employeeId, role: TaskProjectRole.PROJECT_ADMIN },
          { employeeId: leadEmployee.employeeId, role: TaskProjectRole.PROJECT_LEAD },
          { employeeId: memberEmployee.employeeId, role: TaskProjectRole.MEMBER },
          { employeeId: viewerEmp.employeeId, role: TaskProjectRole.VIEWER },
        ],
      },
      customFieldDefs: [
        { key: "customer", label: "Customer", type: "text" },
        { key: "effort", label: "Effort points", type: "number" },
      ],
    },
  });

  const unitCount = await prisma.department.count();
  console.log(
    JSON.stringify({
      ok: true,
      unitCount,
      users: Object.keys(E2E_USER_EMAILS).length,
      password: E2E_PASSWORD,
      plannerProject: "AWF",
    }),
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
