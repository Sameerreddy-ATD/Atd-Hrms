import jwt from "jsonwebtoken";
import { createApp } from "../server/src/app.ts";
import { config } from "../server/src/config.ts";
import { prisma } from "../server/src/prisma.ts";

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "DEVELOPER_ADMIN" } });
  if (admin.firstLoginPasswordChangeRequired) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { firstLoginPasswordChangeRequired: false },
    });
  }
  const session = await prisma.userSession.create({
    data: {
      userId: admin.id,
      sessionVersion: admin.sessionVersion,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      platform: "Test",
    },
  });
  const token = jwt.sign(
    {
      id: admin.id,
      employeeId: admin.employeeId,
      role: admin.role,
      name: admin.name,
      email: admin.email,
      mustChangePassword: false,
      sessionVersion: admin.sessionVersion,
      sid: session.sessionId,
    },
    config.accessSecret,
    { expiresIn: "15m", algorithm: "HS256" },
  );

  const app = createApp();
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;

  const parentUnit = await prisma.department.findFirstOrThrow({
    where: { unitCode: "CHIEF_OF_OPERATIONS" },
  });
  const historyUnit = await prisma.department.findFirstOrThrow({
    where: { unitCode: "COMPLIANCE" },
  });

  const parentRes = await fetch(`http://127.0.0.1:${port}/departments/${parentUnit.departmentId}`, {
    method: "DELETE",
    headers: { Cookie: `${config.sessionCookie}=${token}` },
  });
  const parentJson = await parentRes.json().catch(() => ({}));

  const historyRes = await fetch(`http://127.0.0.1:${port}/departments/${historyUnit.departmentId}`, {
    method: "DELETE",
    headers: { Cookie: `${config.sessionCookie}=${token}` },
  });
  const historyJson = await historyRes.json().catch(() => ({}));
  const historyAfter = await prisma.department.findUniqueOrThrow({
    where: { departmentId: historyUnit.departmentId },
  });

  console.log(
    JSON.stringify(
      {
        parentDeleteStatus: parentRes.status,
        parentDeleteMessage: parentJson.error ?? parentJson.message ?? null,
        historyDeleteStatus: historyRes.status,
        historyUnitActiveAfterDelete: historyAfter.active,
        historyUnitReturnedActive: historyJson.active,
      },
      null,
      2,
    ),
  );

  server.close();
  await prisma.userSession.deleteMany({ where: { sessionId: session.sessionId } });
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
