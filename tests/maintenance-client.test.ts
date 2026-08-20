import { describe, expect, it, beforeEach } from "vitest";
import {
  clearMaintenance,
  enterMaintenance,
  getMaintenanceInfo,
  isMaintenancePayload,
  MUTATION_MAINTENANCE_MESSAGE,
  subscribeMaintenance,
} from "../src/lib/maintenance";

describe("frontend maintenance helpers", () => {
  beforeEach(() => {
    clearMaintenance();
  });

  it("detects maintenance payloads", () => {
    expect(isMaintenancePayload({ maintenance: true, code: "APP_UPDATE_IN_PROGRESS" })).toBe(
      true,
    );
    expect(isMaintenancePayload({ code: "APP_UPDATE_IN_PROGRESS" })).toBe(true);
    expect(isMaintenancePayload({ maintenance: false })).toBe(false);
    expect(isMaintenancePayload({ error: "Nope" })).toBe(false);
  });

  it("enterMaintenance is deduped for polling storms", () => {
    let emits = 0;
    const stop = subscribeMaintenance(() => {
      emits += 1;
    });
    enterMaintenance({ message: "A" });
    enterMaintenance({ message: "A" });
    enterMaintenance({ message: "A" });
    expect(getMaintenanceInfo().active).toBe(true);
    // initial subscribe + first enter
    expect(emits).toBe(2);
    stop();
  });

  it("mutation message is distinct", () => {
    expect(MUTATION_MAINTENANCE_MESSAGE).toMatch(/not submitted/i);
  });
});
