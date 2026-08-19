import { describe, expect, it } from "vitest";
import {
  matchesWorkforceTypeFilter,
  occupiedWorkforceTypes,
  workforceTypeFromRole,
} from "../src/lib/workforce-type";

describe("workforceTypeFromRole", () => {
  it("maps driver to Bowser Pilot", () => {
    expect(workforceTypeFromRole("driver")).toBe("bowser_pilot");
  });

  it("maps other roles to Team Member", () => {
    expect(workforceTypeFromRole("employee")).toBe("team_member");
    expect(workforceTypeFromRole("sales")).toBe("team_member");
    expect(workforceTypeFromRole("hr")).toBe("team_member");
    expect(workforceTypeFromRole("developer_admin")).toBe("team_member");
  });
});

describe("matchesWorkforceTypeFilter", () => {
  it("passes all when filter is all", () => {
    expect(matchesWorkforceTypeFilter({ role: "driver" }, "all")).toBe(true);
    expect(matchesWorkforceTypeFilter({ role: "employee" }, "all")).toBe(true);
  });

  it("filters by workforce type", () => {
    expect(matchesWorkforceTypeFilter({ role: "driver" }, "bowser_pilot")).toBe(true);
    expect(matchesWorkforceTypeFilter({ role: "driver" }, "team_member")).toBe(false);
    expect(matchesWorkforceTypeFilter({ role: "employee" }, "team_member")).toBe(true);
  });
});

describe("occupiedWorkforceTypes", () => {
  it("returns only types present in the list", () => {
    expect(
      occupiedWorkforceTypes([{ role: "employee" }, { role: "driver" }, { role: "sales" }]),
    ).toEqual(["team_member", "bowser_pilot"]);
    expect(occupiedWorkforceTypes([{ role: "driver" }])).toEqual(["bowser_pilot"]);
  });
});
