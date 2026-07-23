import { createApp } from "./app.js";
import { startAttendanceSettlementScheduler } from "./attendanceSettlement.js";
import { assertSecureConfig, config } from "./config.js";
import { prisma } from "./prisma.js";

assertSecureConfig();

const server = createApp().listen(config.port, () => {
  console.log(
    `Anytime Diesel Employee Management API listening on http://localhost:${config.port}`,
  );
  startAttendanceSettlementScheduler();
});
server.requestTimeout = config.requestTimeoutMs;
server.headersTimeout = config.requestTimeoutMs + 5000;
server.keepAliveTimeout = 65000;

async function shutdown(signal: string) {
  console.log(`${signal} received. Closing server...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception", err);
  void shutdown("uncaughtException");
});
