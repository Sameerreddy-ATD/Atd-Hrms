import { EmploymentType, Gender, PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../server/src/security.js";

const prisma = new PrismaClient();

async function main() {
  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) throw new Error("SEED_PASSWORD is required to seed baseline accounts");
  const passwordHash = await hashPassword(seedPassword);

  const unitData = [
    ["Executive Leadership", null, "TEAM", 1],
    ["Sales", null, "TEAM", 10],
    ["Field Sales", "Sales", "SUBTEAM", 11],
    ["Tele Sales", "Sales", "SUBTEAM", 12],
    ["Operations", null, "TEAM", 20],
    ["Route Planning", "Operations", "SUBTEAM", 21],
    ["Maintenance & Parking Hub", "Operations", "SUBTEAM", 22],
    ["Data Entry", "Operations", "SUBTEAM", 23],
    ["Fleet & Driver Team", "Operations", "SUBTEAM", 24],
    ["Accounts", null, "TEAM", 30],
    ["Administration", null, "TEAM", 40],
    ["Human Resources", "Administration", "SUBTEAM", 41],
  ] as const;

  const units = new Map<string, string>();
  for (const [name, parentName, unitType, sortOrder] of unitData) {
    const parentDepartmentId = parentName ? (units.get(parentName) ?? null) : null;
    const unitCode = name
      .trim()
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase()
      .slice(0, 60);
    const existing = await prisma.department.findFirst({
      where: { name, parentDepartmentId },
    });
    const unit = existing
      ? await prisma.department.update({
          where: { departmentId: existing.departmentId },
          data: { unitType, sortOrder, parentDepartmentId, unitCode: existing.unitCode || unitCode },
        })
      : await prisma.department.create({
          data: {
            name,
            unitCode,
            unitType,
            sortOrder,
            parentDepartmentId: parentDepartmentId ?? undefined,
          },
        });
    units.set(name, unit.departmentId);
  }

  const madhapur = await prisma.branch.upsert({
    where: { branchCode: "MADHAPUR" },
    update: { latitude: 17.4391592, longitude: 78.3947783, attendanceRadiusMeters: 250 },
    create: {
      branchName: "Madhapur",
      branchCode: "MADHAPUR",
      address: "Anytime Diesel, Madhapur, Hyderabad",
      city: "Hyderabad",
      latitude: 17.4391592,
      longitude: 78.3947783,
      attendanceRadiusMeters: 250,
    },
  });
  const banjaraHills = await prisma.branch.upsert({
    where: { branchCode: "BANJARA" },
    update: {
      latitude: 17.4130575,
      longitude: 78.4232275,
      attendanceRadiusMeters: 250,
    },
    create: {
      branchName: "Banjara Hills",
      branchCode: "BANJARA",
      address: "Anytime Diesel, Banjara Hills, Hyderabad",
      city: "Hyderabad",
      latitude: 17.4130575,
      longitude: 78.4232275,
      attendanceRadiusMeters: 250,
    },
  });

  type Person = {
    code: string;
    name: string;
    email: string;
    role: Role;
    unit?: string;
    designation: string;
    level: "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER";
    managerCode?: string;
    branch?: "madhapur" | "banjara";
    field?: boolean;
  };

  const people: Person[] = [
    {
      code: "EMP-0001",
      name: "Chief Executive Officer",
      email: "ceo@anytimediesel.local",
      role: Role.CEO,
      designation: "CEO",
      level: "HEAD",
    },
    {
      code: "EMP-0002",
      name: "Company Admin",
      email: "admin@anytimediesel.local",
      role: Role.MAIN_ADMIN,
      unit: "Administration",
      designation: "Administration Head",
      level: "HEAD",
      managerCode: "EMP-0001",
    },
    {
      code: "EMP-0003",
      name: "HR Manager",
      email: "hr@anytimediesel.local",
      role: Role.HR,
      unit: "Administration",
      designation: "HR Manager",
      level: "SENIOR",
      managerCode: "EMP-0002",
    },
    {
      code: "EMP-0010",
      name: "Sales Head",
      email: "sales.head@anytimediesel.local",
      role: Role.MANAGER,
      unit: "Sales",
      designation: "Sales Head",
      level: "HEAD",
      managerCode: "EMP-0001",
    },
    {
      code: "EMP-0011",
      name: "Field Sales Head",
      email: "field.head@anytimediesel.local",
      role: Role.MANAGER,
      unit: "Field Sales",
      designation: "Field Sales Head",
      level: "HEAD",
      managerCode: "EMP-0010",
      field: true,
    },
    {
      code: "EMP-0012",
      name: "Senior Field Executive",
      email: "field.senior@anytimediesel.local",
      role: Role.SALES,
      unit: "Field Sales",
      designation: "Senior Field Executive",
      level: "SENIOR",
      managerCode: "EMP-0011",
      field: true,
    },
    {
      code: "EMP-0013",
      name: "Junior Field Executive",
      email: "field.junior@anytimediesel.local",
      role: Role.SALES,
      unit: "Field Sales",
      designation: "Junior Field Executive",
      level: "JUNIOR",
      managerCode: "EMP-0012",
      field: true,
    },
    {
      code: "EMP-0014",
      name: "Tele Sales Head",
      email: "tele.head@anytimediesel.local",
      role: Role.MANAGER,
      unit: "Tele Sales",
      designation: "Tele Sales Head",
      level: "HEAD",
      managerCode: "EMP-0010",
    },
    {
      code: "EMP-0015",
      name: "Senior Tele Executive",
      email: "tele.senior@anytimediesel.local",
      role: Role.EMPLOYEE,
      unit: "Tele Sales",
      designation: "Senior Tele Executive",
      level: "SENIOR",
      managerCode: "EMP-0014",
    },
    {
      code: "EMP-0016",
      name: "Junior Tele Executive",
      email: "tele.junior@anytimediesel.local",
      role: Role.EMPLOYEE,
      unit: "Tele Sales",
      designation: "Junior Tele Executive",
      level: "JUNIOR",
      managerCode: "EMP-0015",
    },
    {
      code: "EMP-0020",
      name: "Operations Head",
      email: "operations.head@anytimediesel.local",
      role: Role.MANAGER,
      unit: "Operations",
      designation: "Operations Head",
      level: "HEAD",
      managerCode: "EMP-0001",
    },
    {
      code: "EMP-0021",
      name: "Route Planning Head",
      email: "route.head@anytimediesel.local",
      role: Role.MANAGER,
      unit: "Route Planning",
      designation: "Route Planning Head",
      level: "HEAD",
      managerCode: "EMP-0020",
    },
    {
      code: "EMP-0022",
      name: "Senior Route Planner",
      email: "route.senior@anytimediesel.local",
      role: Role.EMPLOYEE,
      unit: "Route Planning",
      designation: "Senior Route Planner",
      level: "SENIOR",
      managerCode: "EMP-0021",
    },
    {
      code: "EMP-0023",
      name: "Junior Route Planner",
      email: "route.junior@anytimediesel.local",
      role: Role.EMPLOYEE,
      unit: "Route Planning",
      designation: "Junior Route Planner",
      level: "JUNIOR",
      managerCode: "EMP-0022",
    },
    {
      code: "EMP-0024",
      name: "Maintenance & Parking Head",
      email: "maintenance.head@anytimediesel.local",
      role: Role.MANAGER,
      unit: "Maintenance & Parking Hub",
      designation: "Maintenance & Parking Head",
      level: "HEAD",
      managerCode: "EMP-0020",
    },
    {
      code: "EMP-0025",
      name: "Data Entry Executive",
      email: "data.entry@anytimediesel.local",
      role: Role.EMPLOYEE,
      unit: "Data Entry",
      designation: "Data Entry Executive",
      level: "MEMBER",
      managerCode: "EMP-0020",
    },
    {
      code: "EMP-0026",
      name: "Bowser Pilot",
      email: "driver@anytimediesel.local",
      role: Role.DRIVER,
      unit: "Fleet & Driver Team",
      designation: "Bowser Pilot",
      level: "MEMBER",
      managerCode: "EMP-0020",
      branch: "banjara",
      field: true,
    },
    {
      code: "EMP-0030",
      name: "Accounts Head",
      email: "accounts.head@anytimediesel.local",
      role: Role.MANAGER,
      unit: "Accounts",
      designation: "Accounts Head",
      level: "HEAD",
      managerCode: "EMP-0001",
    },
  ];

  const employeeIds = new Map<string, string>();
  for (const person of people) {
    const employee = await prisma.employee.upsert({
      where: { employeeCode: person.code },
      update: {
        name: person.name,
        email: person.email,
        departmentId: person.unit ? units.get(person.unit) : undefined,
        designation: person.designation,
        organizationLevel: person.level,
        managerId: person.managerCode ? employeeIds.get(person.managerCode) : undefined,
        homeBranchId: person.branch === "banjara" ? banjaraHills.branchId : madhapur.branchId,
      },
      create: {
        employeeCode: person.code,
        name: person.name,
        email: person.email,
        departmentId: person.unit ? units.get(person.unit) : undefined,
        designation: person.designation,
        organizationLevel: person.level,
        managerId: person.managerCode ? employeeIds.get(person.managerCode) : undefined,
        homeBranchId: person.branch === "banjara" ? banjaraHills.branchId : madhapur.branchId,
        joiningDate: new Date("2026-07-01"),
        gender: Gender.PREFER_NOT_TO_SAY,
        employmentType: EmploymentType.FULL_TIME,
        attendanceMode: "BOTH",
        isFieldEmployee: person.field ?? false,
      },
    });
    employeeIds.set(person.code, employee.employeeId);
    await prisma.user.upsert({
      where: { email: person.email },
      update: { name: person.name, role: person.role, employeeId: employee.employeeId },
      create: {
        name: person.name,
        email: person.email,
        role: person.role,
        employeeId: employee.employeeId,
        passwordHash,
        firstLoginPasswordChangeRequired: true,
      },
    });
  }

  await prisma.user.upsert({
    where: { email: "dev@anytimediesel.local" },
    update: { role: Role.DEVELOPER_ADMIN, status: "ACTIVE", failedLoginAttempts: 0 },
    create: {
      name: "Developer Admin",
      email: "dev@anytimediesel.local",
      role: Role.DEVELOPER_ADMIN,
      passwordHash,
      firstLoginPasswordChangeRequired: true,
    },
  });

  for (const policy of [
    {
      leaveTypeId: "leave-casual",
      name: "Casual Leave",
      code: "CASUAL",
      paid: true,
      annualAllowance: 12,
      monthlyCredit: 1,
      carryForward: true,
      requiresMedicalDocument: false,
      approvalRequired: true,
    },
    {
      leaveTypeId: "leave-sick",
      name: "Sick Leave",
      code: "SICK",
      paid: true,
      annualAllowance: 6,
      monthlyCredit: null,
      maxPerMonth: 2,
      carryForward: false,
      requiresMedicalDocument: true,
      approvalRequired: true,
    },
    {
      leaveTypeId: "leave-lop",
      name: "Unpaid Leave / LOP",
      code: "LOP",
      paid: false,
      annualAllowance: null,
      monthlyCredit: null,
      carryForward: false,
      requiresMedicalDocument: false,
      approvalRequired: true,
    },
    {
      leaveTypeId: "leave-comp-off",
      name: "Comp Off",
      code: "COMP_OFF",
      paid: true,
      annualAllowance: null,
      monthlyCredit: null,
      carryForward: false,
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

  for (const shift of [
    {
      shiftId: "shift-morning-0900",
      name: "Morning 09:00–18:00",
      code: "MORNING_0900",
      shiftType: "DAY" as const,
      startMinutes: 540,
      endMinutes: 1080,
    },
    {
      shiftId: "shift-morning-0930",
      name: "Morning 09:30–18:30",
      code: "MORNING_0930",
      shiftType: "DAY" as const,
      startMinutes: 570,
      endMinutes: 1110,
    },
  ]) {
    await prisma.shiftDefinition.upsert({
      where: { code: shift.code },
      update: {
        name: shift.name,
        shiftType: shift.shiftType,
        startMinutes: shift.startMinutes,
        endMinutes: shift.endMinutes,
        active: true,
      },
      create: shift,
    });
  }

  for (const [unitName, headCode] of [
    ["Sales", "EMP-0010"],
    ["Field Sales", "EMP-0011"],
    ["Tele Sales", "EMP-0014"],
    ["Operations", "EMP-0020"],
    ["Route Planning", "EMP-0021"],
    ["Maintenance & Parking Hub", "EMP-0024"],
    ["Accounts", "EMP-0030"],
    ["Administration", "EMP-0002"],
  ] as const) {
    const departmentId = units.get(unitName)!;
    const headEmployeeId = employeeIds.get(headCode)!;
    await prisma.department.update({
      where: { departmentId },
      data: { headEmployeeId },
    });
    const existingHead = await prisma.departmentHeadAssignment.findFirst({
      where: {
        departmentId,
        employeeId: headEmployeeId,
        effectiveTo: null,
      },
    });
    if (existingHead) {
      await prisma.departmentHeadAssignment.update({
        where: { id: existingHead.id },
        data: { sortOrder: 0 },
      });
    } else {
      await prisma.departmentHeadAssignment.create({
        data: {
          departmentId,
          employeeId: headEmployeeId,
          sortOrder: 0,
          isPrimary: true,
          effectiveFrom: new Date(),
        },
      });
    }
  }

  console.log(`Seed complete: ${people.length + 1} baseline accounts are available.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
