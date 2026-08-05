/** Place name for attendance / location UI — hubs append " - Hub". */
export function formatBranchLocationLabel(
  branch?: { name?: string | null; isHub?: boolean | null } | null,
  fallback = "-",
): string {
  const name = branch?.name?.trim() ?? "";
  if (!name) return fallback;
  return branch?.isHub ? `${name} - Hub` : name;
}

export function formatBranchLocationLabelById(
  branches: Array<{ id: string; name: string; isHub?: boolean | null }>,
  id?: string | null,
  fallback = "-",
): string {
  if (!id) return fallback;
  const branch = branches.find((row) => row.id === id);
  return formatBranchLocationLabel(branch, fallback);
}
