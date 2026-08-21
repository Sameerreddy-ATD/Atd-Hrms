/**
 * India state / UT catalog for Work Locations.
 * UI label ↔ persisted canonical code (uppercase snake without spaces).
 */
export const INDIA_STATES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "ANDAMAN_AND_NICOBAR_ISLANDS", label: "Andaman and Nicobar Islands" },
  { code: "ANDHRA_PRADESH", label: "Andhra Pradesh" },
  { code: "ARUNACHAL_PRADESH", label: "Arunachal Pradesh" },
  { code: "ASSAM", label: "Assam" },
  { code: "BIHAR", label: "Bihar" },
  { code: "CHANDIGARH", label: "Chandigarh" },
  { code: "CHHATTISGARH", label: "Chhattisgarh" },
  { code: "DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU", label: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DELHI", label: "Delhi" },
  { code: "GOA", label: "Goa" },
  { code: "GUJARAT", label: "Gujarat" },
  { code: "HARYANA", label: "Haryana" },
  { code: "HIMACHAL_PRADESH", label: "Himachal Pradesh" },
  { code: "JAMMU_AND_KASHMIR", label: "Jammu and Kashmir" },
  { code: "JHARKHAND", label: "Jharkhand" },
  { code: "KARNATAKA", label: "Karnataka" },
  { code: "KERALA", label: "Kerala" },
  { code: "LADAKH", label: "Ladakh" },
  { code: "LAKSHADWEEP", label: "Lakshadweep" },
  { code: "MADHYA_PRADESH", label: "Madhya Pradesh" },
  { code: "MAHARASHTRA", label: "Maharashtra" },
  { code: "MANIPUR", label: "Manipur" },
  { code: "MEGHALAYA", label: "Meghalaya" },
  { code: "MIZORAM", label: "Mizoram" },
  { code: "NAGALAND", label: "Nagaland" },
  { code: "ODISHA", label: "Odisha" },
  { code: "PUDUCHERRY", label: "Puducherry" },
  { code: "PUNJAB", label: "Punjab" },
  { code: "RAJASTHAN", label: "Rajasthan" },
  { code: "SIKKIM", label: "Sikkim" },
  { code: "TAMIL_NADU", label: "Tamil Nadu" },
  { code: "TELANGANA", label: "Telangana" },
  { code: "TRIPURA", label: "Tripura" },
  { code: "UTTAR_PRADESH", label: "Uttar Pradesh" },
  { code: "UTTARAKHAND", label: "Uttarakhand" },
  { code: "WEST_BENGAL", label: "West Bengal" },
] as const;

const byCode = new Map(INDIA_STATES.map((s) => [s.code, s.label]));
const byLabel = new Map(INDIA_STATES.map((s) => [s.label.toLowerCase(), s.code]));

export function indiaStateLabel(code: string | null | undefined) {
  if (!code) return "";
  return byCode.get(code) ?? code;
}

export function parseIndiaStateInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase().replace(/\s+/g, "_");
  if (byCode.has(upper)) return upper;
  return byLabel.get(trimmed.toLowerCase()) ?? null;
}

export const WORK_LOCATION_TYPES = [
  "OFFICE",
  "BRANCH",
  "PARKING_HUB",
  "DEPOT",
  "WAREHOUSE",
  "OTHER",
] as const;

export type WorkLocationType = (typeof WORK_LOCATION_TYPES)[number];

export const WORK_LOCATION_TYPE_LABELS: Record<WorkLocationType, string> = {
  OFFICE: "Office",
  BRANCH: "Branch",
  PARKING_HUB: "Parking Hub",
  DEPOT: "Depot",
  WAREHOUSE: "Warehouse",
  OTHER: "Other",
};

export function isWorkLocationType(value: string): value is WorkLocationType {
  return (WORK_LOCATION_TYPES as readonly string[]).includes(value);
}

export function suggestLocationCode(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function composeAddressLine(parts: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  locality?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}) {
  const stateLabel = indiaStateLabel(parts.state ?? undefined);
  return [
    parts.addressLine1,
    parts.addressLine2,
    parts.locality,
    parts.city,
    stateLabel,
    parts.postalCode,
    parts.country ?? "India",
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(", ");
}
