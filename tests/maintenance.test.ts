import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import {
  clearMaintenanceCache,
  MAINTENANCE_CODE,
  readMaintenanceState,
  writeMaintenanceState,
} from "../server/src/maintenance.js";
import { maintenanceMiddleware } from "../server/src/maintenanceMiddleware.js";
import { maintenanceApiPayload } from "../server/src/maintenance.js";

async function withApp(cwd: string, run: (base: string) => Promise<void>) {
  process.env.MAINTENANCE_FILE = join(cwd, "maintenance.json");
  clearMaintenanceCache();

  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/maintenance/status", (_req, res) => {
    const state = readMaintenanceState(cwd);
    res.json(maintenanceApiPayload(state));
  });
  app.use(maintenanceMiddleware);
  app.get("/employees", (_req, res) => res.json({ ok: true, employees: [] }));
  app.post("/employees", (_req, res) => res.status(201).json({ created: true }));
  app.post("/attendance/mobile/check-in", (_req, res) => res.status(201).json({ eventId: "x" }));
  app.post("/attendance/mobile/check-out", (_req, res) => res.status(201).json({ eventId: "y" }));
  app.get("/attendance/current", (_req, res) => res.json({ checkedIn: false }));

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await run(base);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    clearMaintenanceCache();
    delete process.env.MAINTENANCE_FILE;
  }
}

describe("maintenance mode", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "atd-maint-"));
  });

  afterEach(() => {
    clearMaintenanceCache();
    delete process.env.MAINTENANCE_FILE;
    rmSync(cwd, { recursive: true, force: true });
  });

  it("maintenance OFF → normal API works", async () => {
    await withApp(cwd, async (base) => {
      writeMaintenanceState({ enabled: false }, cwd);
      const res = await fetch(`${base}/employees`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, employees: [] });
    });
  });

  it("maintenance ON → normal API returns 503 with code and Retry-After", async () => {
    await withApp(cwd, async (base) => {
      writeMaintenanceState({ enabled: true, startedBy: "test" }, cwd);
      const res = await fetch(`${base}/employees`);
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("600");
      const body = await res.json();
      expect(body.maintenance).toBe(true);
      expect(body.code).toBe(MAINTENANCE_CODE);
      expect(String(body.message)).toMatch(/updated by the developer/i);
      expect(body.retryAfterSeconds).toBe(600);
    });
  });

  it("/health remains accessible during maintenance", async () => {
    await withApp(cwd, async (base) => {
      writeMaintenanceState({ enabled: true }, cwd);
      const res = await fetch(`${base}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });

  it("maintenance status works on and off", async () => {
    await withApp(cwd, async (base) => {
      writeMaintenanceState({ enabled: false }, cwd);
      let res = await fetch(`${base}/maintenance/status`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ maintenance: false });

      writeMaintenanceState({ enabled: true }, cwd);
      clearMaintenanceCache();
      res = await fetch(`${base}/maintenance/status`);
      const body = await res.json();
      expect(body.maintenance).toBe(true);
      expect(body.code).toBe(MAINTENANCE_CODE);
    });
  });

  it("mutation is not processed during maintenance", async () => {
    await withApp(cwd, async (base) => {
      writeMaintenanceState({ enabled: true }, cwd);
      const res = await fetch(`${base}/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.created).toBeUndefined();
      expect(body.maintenance).toBe(true);
    });
  });

  it("maintenance OFF restores normal API", async () => {
    await withApp(cwd, async (base) => {
      writeMaintenanceState({ enabled: true }, cwd);
      expect((await fetch(`${base}/employees`)).status).toBe(503);
      writeMaintenanceState({ enabled: false }, cwd);
      clearMaintenanceCache();
      const res = await fetch(`${base}/employees`);
      expect(res.status).toBe(200);
    });
  });

  it("attendance mutations return 503 during maintenance and recover after OFF", async () => {
    await withApp(cwd, async (base) => {
      writeMaintenanceState({ enabled: false }, cwd);
      clearMaintenanceCache();
      expect((await fetch(`${base}/attendance/current`)).status).toBe(200);
      expect((await fetch(`${base}/attendance/mobile/check-in`, { method: "POST" })).status).toBe(
        201,
      );

      writeMaintenanceState({ enabled: true }, cwd);
      clearMaintenanceCache();
      const blockedIn = await fetch(`${base}/attendance/mobile/check-in`, { method: "POST" });
      expect(blockedIn.status).toBe(503);
      const blockedBody = await blockedIn.json();
      expect(blockedBody.maintenance).toBe(true);
      expect(blockedBody.code).toBe(MAINTENANCE_CODE);
      expect((await fetch(`${base}/attendance/mobile/check-out`, { method: "POST" })).status).toBe(
        503,
      );

      writeMaintenanceState({ enabled: false }, cwd);
      clearMaintenanceCache();
      expect((await fetch(`${base}/attendance/current`)).status).toBe(200);
      expect((await fetch(`${base}/attendance/mobile/check-in`, { method: "POST" })).status).toBe(
        201,
      );
    });
  });
});
