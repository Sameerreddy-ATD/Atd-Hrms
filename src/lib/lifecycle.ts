export const CANDIDATE_STAGES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "HIRED",
] as const;

/** Stages that can be set from the pipeline dropdown (Hire action sets HIRED). */
export const CANDIDATE_PIPELINE_STAGES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const CHANGE_KINDS = [
  "SHIFT_CHANGE",
  "SHIFT_SWAP",
  "PROMOTION",
  "DEPARTMENT_CHANGE",
  "EMPLOYMENT_TYPE_CHANGE",
  "SALARY_CHANGE",
  "DESIGNATION_CHANGE",
  "BRANCH_CHANGE",
  "ADDRESS_CHANGE",
  "MANAGER_CHANGE",
  "HIERARCHY_CHANGE",
  "RECURRING_ALLOWANCE",
  "ONE_TIME_PAYMENT",
] as const;

export const CHANGE_KIND_LABELS: Record<(typeof CHANGE_KINDS)[number], string> = {
  SHIFT_CHANGE: "Shift change",
  SHIFT_SWAP: "Shift swap",
  PROMOTION: "Promotion",
  DEPARTMENT_CHANGE: "Department change",
  EMPLOYMENT_TYPE_CHANGE: "Part-time / intern to full-time",
  SALARY_CHANGE: "Salary change",
  DESIGNATION_CHANGE: "Designation change",
  BRANCH_CHANGE: "Branch change",
  ADDRESS_CHANGE: "Address change",
  MANAGER_CHANGE: "Manager change",
  HIERARCHY_CHANGE: "Hierarchy change",
  RECURRING_ALLOWANCE: "Recurring allowance",
  ONE_TIME_PAYMENT: "One-time payment",
};

export const ONBOARDING_DOC_LABELS: Record<string, string> = {
  OFFER_LETTER: "Offer letter",
  NDA: "NDA",
  AADHAAR: "Aadhaar",
  PAN: "PAN",
  HANDBOOK: "Employee handbook",
};

export function labelize(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function fileToPayload(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  return { fileName: file.name, contentBase64: dataUrl, mimeType: file.type || "application/pdf" };
}

export function isPeopleOpsRole(role: string | undefined) {
  return role === "hr" || role === "developer_admin" || role === "main_admin" || role === "ceo";
}

export function isPeopleLeaderRole(role: string | undefined) {
  return isPeopleOpsRole(role) || role === "manager";
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 540;
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
