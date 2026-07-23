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
    invalidPrivateFieldEnvelopes,
    faceProfiles,
    approvedFaceProfiles,
    pendingFaceProfiles,
    faceEvidence,
    activeFaceEvidence,
    faceVerificationSessions,
    invalidFaceTemplates,
    invalidApprovedFaces,
    invalidFaceEvidence,
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
    prisma.$queryRaw`
      SELECT employee_id AS employeeId
      FROM employees
      WHERE (bank_account_number_encrypted IS NOT NULL AND bank_account_number_encrypted NOT LIKE 'v1.%')
         OR (pan_number_encrypted IS NOT NULL AND pan_number_encrypted NOT LIKE 'v1.%')
         OR (aadhaar_number_encrypted IS NOT NULL AND aadhaar_number_encrypted NOT LIKE 'v1.%')
         OR (uan_number_encrypted IS NOT NULL AND uan_number_encrypted NOT LIKE 'v1.%')
      LIMIT 20
    `,
    prisma.faceProfile.count(),
    prisma.faceProfile.count({ where: { status: "APPROVED" } }),
    prisma.faceProfile.count({ where: { status: "PENDING" } }),
    prisma.faceEvidence.count(),
    prisma.faceEvidence.count({ where: { deletedAt: null } }),
    prisma.faceVerificationSession.count(),
    prisma.faceProfile.count({
      where: { NOT: { descriptorEncrypted: { startsWith: "v1." } } },
    }),
    prisma.faceProfile.count({
      where: {
        status: "APPROVED",
        OR: [{ approvedAt: null }, { approvedByUserId: null }],
      },
    }),
    prisma.faceEvidence.count({
      where: {
        OR: [
          { deletedAt: { not: null }, imageKey: { not: null } },
          {
            outcome: "PASSED",
            purpose: { in: ["ATTENDANCE_CHECK_IN", "ATTENDANCE_CHECK_OUT"] },
            attendanceEventId: null,
          },
        ],
      },
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
      faceProfiles,
      approvedFaceProfiles,
      pendingFaceProfiles,
      faceEvidence,
      activeFaceEvidence,
      faceVerificationSessions,
    },
    integrity: {
      employeeAccountProfileMismatches: profileMismatches.length,
      employeeAccountStatusMismatches: statusMismatches.length,
      unconfirmedLegacyAttachments: unconfirmedAttachments,
      invalidEmployeePrivateFieldEnvelopes: invalidPrivateFieldEnvelopes.length,
      invalidEncryptedFaceTemplates: invalidFaceTemplates,
      invalidApprovedFaceProfiles: invalidApprovedFaces,
      invalidFaceEvidence,
      sampleMismatchedEmployeeIds: [
        ...new Set([...profileMismatches, ...statusMismatches].map((row) => row.employeeId)),
      ],
    },
    predefinedPasswordConfigured: Boolean(settings),
  };

  console.log(JSON.stringify(result, null, 2));
  if (
    profileMismatches.length ||
    statusMismatches.length ||
    invalidPrivateFieldEnvelopes.length ||
    invalidFaceTemplates ||
    invalidApprovedFaces ||
    invalidFaceEvidence
  )
    process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
