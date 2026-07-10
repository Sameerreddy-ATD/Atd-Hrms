import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const users = await prisma.user.count();
const employees = await prisma.employee.count();
const settings = await prisma.systemSetting.findUnique({
  where: { key: "PREDEFINED_PASSWORD_HASH" },
});
console.log(JSON.stringify({ users, employees, predefinedPasswordConfigured: Boolean(settings) }));
await prisma.$disconnect();
