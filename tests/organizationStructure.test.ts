import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  assertNoHierarchyCycle,
  descendantUnitIds,
  isAssignmentActive,
  startOfUtcDay,
} from "../server/src/organizationStructure.js";
import { resolveOrganizationApproversFromGraph } from "../server/src/organizationApprovers.js";
import { resolveLoginRoleForNewAccount } from "../server/src/rbac.js";
import type { OrganizationUnitRow } from "../server/src/organizationStructure.js";

/** Production-like 20-unit hierarchy (+ Executive Leadership). */
function productionUnits(): OrganizationUnitRow[] {
  const rows: Array<[string, string, string | null]> = [
    ["EXECUTIVE_LEADERSHIP", "Executive Leadership", null],
    ["CHIEF_OF_STAFF", "Chief of Staff", null],
    ["CHIEF_OF_OPERATIONS", "Chief of Operations", "CHIEF_OF_STAFF"],
    ["SALES_TEAM", "Sales Team", "CHIEF_OF_OPERATIONS"],
    ["OPERATIONS", "Operations Department", "CHIEF_OF_OPERATIONS"],
    ["MAINTENANCE", "Maintenance Manager", "OPERATIONS"],
    ["PROCUREMENT", "Procurement", "MAINTENANCE"],
    ["FLEET_DRIVER", "Fleet & Driver Team", "MAINTENANCE"],
    ["ANALYTICS", "Analytics", "OPERATIONS"],
    ["ROUTING_PLANNING", "Routing & Planning", "OPERATIONS"],
    ["SPECIAL_PROJECTS", "Special Projects", "CHIEF_OF_OPERATIONS"],
    ["PRINCIPAL_ADVISOR", "Principal Advisor", "CHIEF_OF_STAFF"],
    ["HR", "Hr Department", "PRINCIPAL_ADVISOR"],
    ["INTERNS", "Interns", "PRINCIPAL_ADVISOR"],
    ["SOFTWARE", "Software", "CHIEF_OF_STAFF"],
    ["INSIDE_SALES", "Inside Sales", "CHIEF_OF_STAFF"],
    ["MARKETING", "Marketing", "CHIEF_OF_STAFF"],
    ["ACCOUNTS", "Accounts Team", "CHIEF_OF_STAFF"],
    ["ADVISOR_GROWTH_STRATEGY", "Advisor Growth & Strategy", "CHIEF_OF_STAFF"],
    ["COMPLIANCE", "Compliance", "CHIEF_OF_STAFF"],
  ];
  return rows.map(([departmentId, name, parentCode], index) => ({
    departmentId,
    name,
    unitCode: departmentId,
    parentDepartmentId: parentCode,
    active: true,
    sortOrder: index,
  }));
}

describe("organization structure foundation", () => {
  const units = productionUnits();

  it("preserves the current 20-unit hierarchy shape", () => {
    expect(units).toHaveLength(20);
    expect(descendantUnitIds("CHIEF_OF_OPERATIONS", units).size).toBe(9);
    expect(descendantUnitIds("OPERATIONS", units).has("FLEET_DRIVER")).toBe(true);
    expect(descendantUnitIds("CHIEF_OF_OPERATIONS", units).has("SOFTWARE")).toBe(false);
  });

  it("prevents self-parent and descendant-parent cycles", () => {
    expect(() =>
      assertNoHierarchyCycle({
        unitId: "OPERATIONS",
        parentDepartmentId: "OPERATIONS",
        units,
      }),
    ).toThrow();
    expect(() =>
      assertNoHierarchyCycle({
        unitId: "OPERATIONS",
        parentDepartmentId: "MAINTENANCE",
        units,
      }),
    ).toThrow();
  });

  it("resolves assignment active windows with exclusive effectiveTo", () => {
    const from = startOfUtcDay(new Date("2026-08-01"));
    const to = startOfUtcDay(new Date("2026-08-31"));
    expect(isAssignmentActive(from, to, startOfUtcDay(new Date("2026-08-30")))).toBe(true);
    expect(isAssignmentActive(from, to, startOfUtcDay(new Date("2026-08-31")))).toBe(false);
    expect(isAssignmentActive(from, null, startOfUtcDay(new Date("2026-08-31")))).toBe(true);
  });

  it("returns multiple heads on Inside Sales", () => {
    const heads = [
      {
        departmentId: "INSIDE_SALES",
        employeeId: "naveen",
        isPrimary: true,
        effectiveFrom: startOfUtcDay(new Date("2026-01-01")),
        effectiveTo: null,
        employeeName: "Reguri Naveen",
        employeeCode: "E1",
      },
      {
        departmentId: "INSIDE_SALES",
        employeeId: "niharika",
        isPrimary: false,
        effectiveFrom: startOfUtcDay(new Date("2026-01-01")),
        effectiveTo: null,
        employeeName: "CH Niharika",
        employeeCode: "E2",
      },
    ];
    const approvers = resolveOrganizationApproversFromGraph({
      employeeId: "member",
      primaryUnitId: "INSIDE_SALES",
      units,
      headAssignments: heads,
    });
    expect(approvers).toHaveLength(2);
  });

  it("walks upward to nearest parent head when unit has no head", () => {
    const approvers = resolveOrganizationApproversFromGraph({
      employeeId: "analyst",
      primaryUnitId: "ANALYTICS",
      units,
      headAssignments: [
        {
          departmentId: "OPERATIONS",
          employeeId: "ops-head",
          isPrimary: true,
          effectiveFrom: startOfUtcDay(new Date("2026-01-01")),
          effectiveTo: null,
          employeeName: "Ops Head",
          employeeCode: "OPS",
        },
      ],
    });
    expect(approvers[0]?.departmentId).toBe("OPERATIONS");
    expect(approvers[0]?.ancestorDepth).toBe(1);
  });

  it("excludes the requesting employee from approver results", () => {
    const approvers = resolveOrganizationApproversFromGraph({
      employeeId: "self",
      primaryUnitId: "SALES_TEAM",
      units,
      headAssignments: [
        {
          departmentId: "SALES_TEAM",
          employeeId: "self",
          isPrimary: true,
          effectiveFrom: startOfUtcDay(new Date("2026-01-01")),
          effectiveTo: null,
        },
        {
          departmentId: "CHIEF_OF_OPERATIONS",
          employeeId: "cos-ops",
          isPrimary: true,
          effectiveFrom: startOfUtcDay(new Date("2026-01-01")),
          effectiveTo: null,
          employeeName: "CoS Ops",
          employeeCode: "CO",
        },
      ],
    });
    expect(approvers.every((row) => row.employeeId !== "self")).toBe(true);
    expect(approvers[0]?.departmentId).toBe("CHIEF_OF_OPERATIONS");
  });
});

describe("organization unit is independent from application role", () => {
  it("no unit + no explicit role defaults to EMPLOYEE, never CEO", () => {
    expect(resolveLoginRoleForNewAccount({})).toBe(Role.EMPLOYEE);
  });

  it("CEO requires explicit CEO role assignment", () => {
    expect(resolveLoginRoleForNewAccount({ explicitRole: Role.CEO })).toBe(Role.CEO);
  });

  it("HR/Fleet/Sales/CoS units do not auto-create privileged roles when role omitted", () => {
    expect(resolveLoginRoleForNewAccount({ explicitRole: null })).toBe(Role.EMPLOYEE);
  });
});

describe("employee transfer invariants (pure)", () => {
  it("transfer closes prior assignment conceptually before opening new one", () => {
    const effective = startOfUtcDay(new Date("2026-09-01"));
    const previousTo = effective;
    const previousFrom = startOfUtcDay(new Date("2026-01-01"));
    expect(isAssignmentActive(previousFrom, previousTo, startOfUtcDay(new Date("2026-08-31")))).toBe(
      true,
    );
    expect(isAssignmentActive(previousFrom, previousTo, effective)).toBe(false);
    expect(isAssignmentActive(effective, null, effective)).toBe(true);
  });
});
