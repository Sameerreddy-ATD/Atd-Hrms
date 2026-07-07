import { EventSource, EventType, PrismaClient, Role, WorkType } from "@prisma/client";
import { createAttendanceEvent } from "../server/src/attendanceEngine.js";
import { hashPassword } from "../server/src/security.js";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hashPassword("ChangeMe@12345");

  const operations = await prisma.department.upsert({
    where: { name: "Operations" },
    update: {},
    create: { name: "Operations" },
  });
  const salesDept = await prisma.department.upsert({
    where: { name: "Sales" },
    update: {},
    create: { name: "Sales" },
  });
  const hrDept = await prisma.department.upsert({
    where: { name: "Human Resources" },
    update: {},
    create: { name: "Human Resources" },
  });

  const b1 = await prisma.branch.upsert({
    where: { branchCode: "B1" },
    update: {},
    create: {
      branchName: "Branch 1 - Head Office",
      branchCode: "B1",
      address: "Plot 12, Industrial Area, Phase 1",
      city: "Mumbai",
    },
  });
  const b2 = await prisma.branch.upsert({
    where: { branchCode: "B2" },
    update: {},
    create: {
      branchName: "Branch 2 - Depot",
      branchCode: "B2",
      address: "NH-8 Bypass Road, Depot Zone",
      city: "Mumbai",
    },
  });

  const d1 = await prisma.biometricDevice.upsert({
    where: { deviceCode: "ZKT-B1-01" },
    update: {},
    create: {
      deviceName: "B1-Scanner-01",
      deviceCode: "ZKT-B1-01",
      branchId: b1.branchId,
      deviceIp: "10.0.1.20",
      port: 4370,
      location: "Main gate",
    },
  });
  const d2 = await prisma.biometricDevice.upsert({
    where: { deviceCode: "ZKT-B2-01" },
    update: {},
    create: {
      deviceName: "B2-Scanner-01",
      deviceCode: "ZKT-B2-01",
      branchId: b2.branchId,
      deviceIp: "10.0.2.20",
      port: 4370,
      location: "Depot gate",
    },
  });

  async function employee(
    code: string,
    name: string,
    email: string,
    branchId: string,
    departmentId: string,
    designation: string,
    managerId?: string,
    isFieldEmployee = false,
  ) {
    return prisma.employee.upsert({
      where: { employeeCode: code },
      update: {},
      create: {
        employeeCode: code,
        name,
        email,
        phone: "+91 9800000000",
        homeBranchId: branchId,
        departmentId,
        designation,
        managerId,
        joiningDate: new Date("2025-01-01"),
        employmentType: "FULL_TIME",
        attendanceMode: isFieldEmployee ? "BOTH" : "THUMB_ONLY",
        isFieldEmployee,
      },
    });
  }

  const hr = await employee(
    "EMP-0004",
    "Suman Iyer",
    "hr@anytimediesel.local",
    b1.branchId,
    hrDept.departmentId,
    "HR Manager",
  );
  const manager = await employee(
    "EMP-0005",
    "Vijay Nair",
    "manager@anytimediesel.local",
    b1.branchId,
    operations.departmentId,
    "Operations Manager",
  );
  const emp = await employee(
    "EMP-0006",
    "Neha Sharma",
    "employee@anytimediesel.local",
    b1.branchId,
    operations.departmentId,
    "Executive",
    manager.employeeId,
  );
  const sales = await employee(
    "EMP-0007",
    "Arjun Kapoor",
    "sales@anytimediesel.local",
    b2.branchId,
    salesDept.departmentId,
    "Sales Executive",
    manager.employeeId,
    true,
  );
  const driver = await employee(
    "EMP-0008",
    "Mohan Das",
    "driver@anytimediesel.local",
    b2.branchId,
    operations.departmentId,
    "Driver",
    manager.employeeId,
    true,
  );

  const userData = [
    ["Dev Admin", "dev@anytimediesel.local", Role.DEVELOPER_ADMIN, null],
    ["Rakesh Menon", "ceo@anytimediesel.local", Role.CEO, null],
    [hr.name, hr.email!, Role.HR, hr.employeeId],
    [manager.name, manager.email!, Role.MANAGER, manager.employeeId],
    [emp.name, emp.email!, Role.EMPLOYEE, emp.employeeId],
    [sales.name, sales.email!, Role.SALES, sales.employeeId],
    [driver.name, driver.email!, Role.DRIVER, driver.employeeId],
  ] as const;

  for (const [name, email, role, employeeId] of userData) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name,
        email,
        role,
        employeeId,
        passwordHash,
        firstLoginPasswordChangeRequired: true,
      },
    });
  }

  await prisma.biometricEmployeeMapping.upsert({
    where: { mappingId: "seed-map-emp-b1" },
    update: {},
    create: {
      mappingId: "seed-map-emp-b1",
      employeeId: emp.employeeId,
      biometricUserId: "1006",
      deviceId: d1.deviceId,
    },
  });
  await prisma.biometricEmployeeMapping.upsert({
    where: { mappingId: "seed-map-sales-b2" },
    update: {},
    create: {
      mappingId: "seed-map-sales-b2",
      employeeId: sales.employeeId,
      biometricUserId: "1007",
      deviceId: d2.deviceId,
    },
  });

  for (const [name, paid] of [
    ["Paid Leave", true],
    ["Sick Leave", true],
    ["Casual Leave", true],
    ["Half-Day Leave", true],
    ["Unpaid Leave", false],
    ["Emergency Leave", true],
    ["Comp Off", true],
  ] as const) {
    await prisma.leaveType.upsert({ where: { name }, update: { paid }, create: { name, paid } });
  }

  await prisma.employeeBranchSchedule.upsert({
    where: { employeeId_date: { employeeId: sales.employeeId, date: new Date("2026-07-07") } },
    update: {},
    create: {
      employeeId: sales.employeeId,
      date: new Date("2026-07-07"),
      scheduledBranchId: b1.branchId,
      workType: WorkType.BRANCH,
      remarks: "Seed multi-branch day",
    },
  });

  await prisma.attendanceEvent.deleteMany({
    where: { employeeId: sales.employeeId, eventDate: new Date("2026-07-07") },
  });
  await createAttendanceEvent({
    employeeId: sales.employeeId,
    eventSource: EventSource.THUMB_SCANNER,
    eventType: EventType.OFFICE_IN,
    branchId: b1.branchId,
    deviceId: d1.deviceId,
    eventTime: new Date("2026-07-07T09:30:00.000Z"),
  });
  await createAttendanceEvent({
    employeeId: sales.employeeId,
    eventSource: EventSource.THUMB_SCANNER,
    eventType: EventType.OFFICE_OUT,
    branchId: b1.branchId,
    deviceId: d1.deviceId,
    eventTime: new Date("2026-07-07T12:00:00.000Z"),
  });
  await createAttendanceEvent({
    employeeId: sales.employeeId,
    eventSource: EventSource.THUMB_SCANNER,
    eventType: EventType.BRANCH_IN,
    branchId: b2.branchId,
    deviceId: d2.deviceId,
    eventTime: new Date("2026-07-07T13:15:00.000Z"),
  });
  await createAttendanceEvent({
    employeeId: sales.employeeId,
    eventSource: EventSource.THUMB_SCANNER,
    eventType: EventType.BRANCH_OUT,
    branchId: b2.branchId,
    deviceId: d2.deviceId,
    eventTime: new Date("2026-07-07T15:30:00.000Z"),
  });
  await createAttendanceEvent({
    employeeId: sales.employeeId,
    eventSource: EventSource.MOBILE_GPS,
    eventType: EventType.CLIENT_CHECK_IN,
    eventTime: new Date("2026-07-07T16:15:00.000Z"),
    latitude: 19.076,
    longitude: 72.8777,
    address: "Andheri East, Mumbai",
    clientName: "Western Logistics",
    clientLocationName: "Client yard",
    workType: WorkType.CLIENT_VISIT,
    mobileDeviceId: "seed-mobile-01",
  });
  await createAttendanceEvent({
    employeeId: sales.employeeId,
    eventSource: EventSource.MOBILE_GPS,
    eventType: EventType.CLIENT_CHECK_OUT,
    eventTime: new Date("2026-07-07T18:30:00.000Z"),
    latitude: 19.077,
    longitude: 72.878,
    address: "Andheri East, Mumbai",
    clientName: "Western Logistics",
    clientLocationName: "Client yard",
    workType: WorkType.CLIENT_VISIT,
    mobileDeviceId: "seed-mobile-01",
  });

  console.log("Seed complete. Login with any seeded email and password ChangeMe@12345");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
