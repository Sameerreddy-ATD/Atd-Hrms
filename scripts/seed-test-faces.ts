/**
 * Approves a face profile for every seeded non-admin account.
 *
 * requireAuth blocks staff without an approved face, which otherwise returns 403
 * for every request and makes RBAC checks pass for the wrong reason. This gets
 * test accounts past that gate so role and ownership rules are what is actually
 * being exercised.
 *
 * Local verification only — never run this against a real database.
 */
import { PrismaClient, Role } from "@prisma/client";
import { encryptEmployeeField } from "../server/src/employeePrivateData.js";

const prisma = new PrismaClient();

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to fabricate face profiles in production");
}

/** Deterministic but distinct per user, so no two accounts share a template. */
function templateFor(seed: number) {
  return Array.from({ length: 128 }, (_, i) => Math.sin(seed * 31 + i) / 2);
}

const developerAdmin = await prisma.user.findFirst({
  where: { role: Role.DEVELOPER_ADMIN },
  select: { id: true },
});
if (!developerAdmin) throw new Error("Seed the database first: no developer admin found");

const users = await prisma.user.findMany({
  where: { role: { not: Role.DEVELOPER_ADMIN } },
  select: { id: true, email: true },
});

let created = 0;
for (const [index, user] of users.entries()) {
  const descriptorEncrypted = encryptEmployeeField(JSON.stringify(templateFor(index + 1)))!;
  await prisma.faceProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      status: "APPROVED",
      descriptorEncrypted,
      consentVersion: "test-consent-v1",
      consentedAt: new Date(),
      approvedByUserId: developerAdmin.id,
      approvedAt: new Date(),
    },
    update: {
      status: "APPROVED",
      approvedByUserId: developerAdmin.id,
      approvedAt: new Date(),
      rejectedAt: null,
      disabledAt: null,
    },
  });
  created += 1;
}

console.log(`Approved face profiles for ${created} test accounts.`);
await prisma.$disconnect();
