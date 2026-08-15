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
    excessiveRetainedFaceImages,
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
    prisma.$queryRaw`
      SELECT user_id AS userId, COUNT(*) AS retainedImages
      FROM face_evidence
      WHERE image_key IS NOT NULL AND deleted_at IS NULL
      GROUP BY user_id
      HAVING COUNT(*) > 5
    `,
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

  // Tables are created as utf8mb4_unicode_ci. A table on a different collation
  // cannot be joined against the rest, which surfaces as MySQL error 1267 part
  // way through a migration rather than at connection time.
  const mixedCollationTables = await prisma.$queryRaw`
    SELECT TABLE_NAME AS tableName, TABLE_COLLATION AS collation
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
      AND TABLE_COLLATION <> 'utf8mb4_unicode_ci'
    LIMIT 20
  `;

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
      usersExceedingFiveRetainedFaceImages: excessiveRetainedFaceImages.length,
      tablesNotOnUtf8mb4UnicodeCi: mixedCollationTables.length,
      sampleMismatchedEmployeeIds: [
        ...new Set([...profileMismatches, ...statusMismatches].map((row) => row.employeeId)),
      ],
      sampleMixedCollationTables: mixedCollationTables.map(
        (row) => `${row.tableName} (${row.collation})`,
      ),
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
    invalidFaceEvidence ||
    excessiveRetainedFaceImages.length ||
    mixedCollationTables.length
  )
    process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
