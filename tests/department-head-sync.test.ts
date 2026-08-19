import { describe, expect, it } from "vitest";

/**
 * Pure decision helpers mirroring department head sync rules used by the API.
 */
function shouldClearHeadLevel(stillHeadsAnyUnit: boolean, organizationLevel: string) {
  return !stillHeadsAnyUnit && organizationLevel === "HEAD";
}

function nextHeadIdsAfterProfileMove(input: {
  currentHeads: string[];
  employeeId: string;
  isHead: boolean;
  movedAwayFromDepartment: boolean;
}) {
  if (!input.isHead && input.movedAwayFromDepartment) {
    return input.currentHeads.filter((id) => id !== input.employeeId);
  }
  if (input.isHead && !input.currentHeads.includes(input.employeeId)) {
    return [...input.currentHeads, input.employeeId];
  }
  return input.currentHeads;
}

describe("department head profile sync rules", () => {
  it("clears HEAD on profile when the person no longer heads any unit", () => {
    expect(shouldClearHeadLevel(false, "HEAD")).toBe(true);
    expect(shouldClearHeadLevel(true, "HEAD")).toBe(false);
    expect(shouldClearHeadLevel(false, "MEMBER")).toBe(false);
  });

  it("adds the person when profile marks them Head of a unit", () => {
    expect(
      nextHeadIdsAfterProfileMove({
        currentHeads: ["a"],
        employeeId: "b",
        isHead: true,
        movedAwayFromDepartment: false,
      }),
    ).toEqual(["a", "b"]);
  });

  it("removes the person from the old unit when they move while Head", () => {
    expect(
      nextHeadIdsAfterProfileMove({
        currentHeads: ["a", "b"],
        employeeId: "b",
        isHead: false,
        movedAwayFromDepartment: true,
      }),
    ).toEqual(["a"]);
  });
});

function nextViewerIdsExcludingHeads(viewerIds: string[], headIds: string[]) {
  return [...new Set(viewerIds.filter(Boolean))].filter((id) => !headIds.includes(id));
}

describe("department view access", () => {
  it("keeps a person as head only when they are also listed as a viewer", () => {
    expect(nextViewerIdsExcludingHeads(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });

  it("allows the same person to view a unit they do not head", () => {
    expect(nextViewerIdsExcludingHeads(["d"], ["a", "b"])).toEqual(["d"]);
  });
});
