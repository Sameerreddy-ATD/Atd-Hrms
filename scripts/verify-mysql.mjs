import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const [
    users,
    employees,
    activeEmployees,
    expenseClaims,
    hrDocumentRequests,
    taskBoards,
    integrationClients,
    employeeChangeEvents,
    settings,
    profileMismatches,
    statusMismatches,
    unconfirmedAttachments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.employee.count(),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.expenseClaim.count(),
    prisma.certificateRequest.count(),
    prisma.taskBoard.count(),
    prisma.integrationClient.count(),
    prisma.employeeChangeEvent.count(),
    prisma.systemSetting.findUnique({ where: { key: "PREDEFINED_PASSWORD_HASH" } }),
    prisma.$queryRaw`
      SELECT e.employee_id AS employeeId
      FROM employees e
      JOIN users u ON u.employee_id = e.employee_id
      WHERE NOT (e.name <=> u.name)
         OR NOT (e.email <=> u.email)
         OR NOT (e.phone <=> u.phone)
      LIMIT 20
    `,
    prisma.$queryRaw`
      SELECT e.employee_id AS employeeId
      FROM employees e
      JOIN users u ON u.employee_id = e.employee_id
      WHERE (e.status = 'ACTIVE' AND u.status = 'INACTIVE')
         OR (e.status <> 'ACTIVE' AND u.status = 'ACTIVE')
      LIMIT 20
    `,
    prisma.expenseClaim.count({
      where: { receiptUrl: { not: null }, receiptAccessConfirmed: false },
    }),
  ]);

  const result = {
    provider: "mysql",
    reachable: true,
    counts: {
      users,
      employees,
      activeEmployees,
      expenseClaims,
      hrDocumentRequests,
      taskBoards,
      integrationClients,
      employeeChangeEvents,
    },
    integrity: {
      employeeAccountProfileMismatches: profileMismatches.length,
      employeeAccountStatusMismatches: statusMismatches.length,
      unconfirmedLegacyAttachments: unconfirmedAttachments,
      sampleMismatchedEmployeeIds: [
        ...new Set([...profileMismatches, ...statusMismatches].map((row) => row.employeeId)),
      ],
    },
    predefinedPasswordConfigured: Boolean(settings),
  };

  console.log(JSON.stringify(result, null, 2));
  if (profileMismatches.length || statusMismatches.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
