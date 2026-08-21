/** Place name for any branch/hub UI — hubs always append " - Hub". */
const HUB_SUFFIX = " - Hub";

function alreadyLabeledAsHub(name: string) {
  return /(?:\s+-\s*hub|\s+hub)$/i.test(name);
}

/**
 * Display label for a branch or parking hub.
 * Hubs always read as `Name - Hub` so they are never confused with a branch.
 * Inactive Base Offices append " (Inactive)" so status is not color-only.
 */
export function formatBranchLocationLabel(
  branch?: { name?: string | null; isHub?: boolean | null; status?: string | null } | null,
  fallback = "-",
): string {
  const name = branch?.name?.trim() ?? "";
  if (!name) return fallback;
  let label: string;
  if (alreadyLabeledAsHub(name)) {
    const base = name.replace(/(?:\s+-\s*hub|\s+hub)$/i, "").trim();
    label = base ? `${base}${HUB_SUFFIX}` : fallback;
  } else {
    label = branch?.isHub ? `${name}${HUB_SUFFIX}` : name;
  }
  if (branch?.status === "INACTIVE" && label !== fallback) {
    return `${label} (Inactive)`;
  }
  return label;
}

export function formatBranchLocationLabelById(
  branches: Array<{ id: string; name: string; isHub?: boolean | null; status?: string | null }>,
  id?: string | null,
  fallback = "-",
): string {
  if (!id) return fallback;
  const branch = branches.find((row) => row.id === id);
  return formatBranchLocationLabel(branch, fallback);
}

/** Strip a trailing hub marker so imports can match either "Madhapur" or "Madhapur - Hub". */
export function branchLookupKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/(?:\s+-\s*hub|\s+hub)$/i, "")
    .trim();
}
