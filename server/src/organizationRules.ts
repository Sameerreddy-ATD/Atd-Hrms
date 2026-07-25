export function reportingHierarchyCycle(
  hierarchy: Array<{ employeeId: string; managerId: string | null }>,
  employeeId: string,
  managerId: string,
): "WOULD_CREATE_CYCLE" | "EXISTING_CYCLE" | null {
  const managers = new Map(hierarchy.map((row) => [row.employeeId, row.managerId]));
  const visited = new Set<string>();
  let cursor: string | null | undefined = managerId;
  while (cursor) {
    if (cursor === employeeId) return "WOULD_CREATE_CYCLE";
    if (visited.has(cursor)) return "EXISTING_CYCLE";
    visited.add(cursor);
    cursor = managers.get(cursor);
  }
  return null;
}
