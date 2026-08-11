import {
  COMPANY_LABELS,
  ROLE_LABELS,
  WEEKLY_OFF_POLICY_LABELS,
  type BankAccountType,
  type Branch,
  type CompanyEntity,
  type Department,
  type Role,
  type User,
  type WeeklyOffPolicy,
} from "@/types/domain";

export const LOGIN_SHEET_NAME = "Create Logins";

export const CREATABLE_ROLES: Role[] = [
  "ceo",
  "main_admin",
  "hr",
  "manager",
  "employee",
  "sales",
  "driver",
  "field_staff",
];

export const LEVELS = ["HEAD", "SENIOR", "JUNIOR", "MEMBER"] as const;
export const GENDERS = ["MALE", "FEMALE", "PREFER_NOT_TO_SAY"] as const;
export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "INTERN"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const BANK_ACCOUNT_TYPES = ["SAVINGS", "CURRENT", "SALARY", "NRE", "NRO", "OTHER"] as const;
export const WEEKLY_OFF_POLICIES = ["SUNDAY_FIXED", "SELECTABLE"] as const;
export const SHIFT_TYPES = ["DAY", "NIGHT"] as const;

export type LoginImportColumnType =
  | "text"
  | "email"
  | "password"
  | "date"
  | "time"
  | "enum"
  | "branch"
  | "mainOrgUnit"
  | "childOrgUnit"
  | "manager"
  | "company"
  | "role";

export type LoginImportFieldKey =
  | "employeeCode"
  | "name"
  | "email"
  | "password"
  | "role"
  | "companyEntity"
  | "phone"
  | "companyPhone"
  | "branchName"
  | "mainUnitName"
  | "childUnitName"
  | "designation"
  | "organizationLevel"
  | "weeklyOffPolicy"
  | "shiftType"
  | "shiftStart"
  | "shiftEnd"
  | "managerReference"
  | "joiningDate"
  | "dateOfBirth"
  | "gender"
  | "employmentType"
  | "bloodGroup"
  | "bankAccountHolderName"
  | "bankAccountType"
  | "bankAccountNumber"
  | "bankIfscCode"
  | "panNumber"
  | "aadhaarNumber"
  | "uanNumber";

export interface LoginImportColumn {
  key: LoginImportFieldKey;
  label: string;
  required: boolean;
  type: LoginImportColumnType;
  width: number;
  defaultValue?: string;
  enumOptions?: readonly string[];
  /** When true, CEO rows may leave this blank. */
  optionalForCeo?: boolean;
}

/** Single source of truth for Bulk add columns — add new Create-login fields here. */
export const LOGIN_IMPORT_COLUMNS: LoginImportColumn[] = [
  { key: "employeeCode", label: "Employee Code", required: false, type: "text", width: 140 },
  { key: "name", label: "Full Name*", required: true, type: "text", width: 180 },
  { key: "email", label: "Email*", required: true, type: "email", width: 220 },
  { key: "password", label: "Temporary Password*", required: true, type: "password", width: 160 },
  {
    key: "role",
    label: "Login Role*",
    required: true,
    type: "role",
    width: 140,
    defaultValue: ROLE_LABELS.employee,
    enumOptions: CREATABLE_ROLES.map((role) => ROLE_LABELS[role]),
  },
  {
    key: "companyEntity",
    label: "Employer Company*",
    required: true,
    type: "company",
    width: 220,
    defaultValue: COMPANY_LABELS.ANYTIME_DIESEL,
    enumOptions: Object.values(COMPANY_LABELS),
  },
  { key: "phone", label: "Personal Phone", required: false, type: "text", width: 140 },
  { key: "companyPhone", label: "Company Phone", required: false, type: "text", width: 140 },
  { key: "branchName", label: "Attendance Branch", required: false, type: "branch", width: 160 },
  {
    key: "mainUnitName",
    label: "Main Organization Unit*",
    required: true,
    type: "mainOrgUnit",
    width: 180,
    optionalForCeo: true,
  },
  {
    key: "childUnitName",
    label: "Child Organization Unit",
    required: false,
    type: "childOrgUnit",
    width: 200,
    defaultValue: "Use main unit",
  },
  { key: "designation", label: "Designation*", required: true, type: "text", width: 160 },
  {
    key: "organizationLevel",
    label: "Organization Level*",
    required: true,
    type: "enum",
    width: 140,
    defaultValue: "MEMBER",
    enumOptions: LEVELS,
  },
  {
    key: "weeklyOffPolicy",
    label: "Weekly Off Policy*",
    required: true,
    type: "enum",
    width: 180,
    defaultValue: WEEKLY_OFF_POLICY_LABELS.SELECTABLE,
    enumOptions: WEEKLY_OFF_POLICIES.map((policy) => WEEKLY_OFF_POLICY_LABELS[policy]),
  },
  {
    key: "shiftType",
    label: "Shift Type",
    required: false,
    type: "enum",
    width: 100,
    defaultValue: "DAY",
    enumOptions: SHIFT_TYPES,
  },
  {
    key: "shiftStart",
    label: "Shift Start",
    required: false,
    type: "time",
    width: 110,
    defaultValue: "09:00",
  },
  {
    key: "shiftEnd",
    label: "Shift End",
    required: false,
    type: "time",
    width: 110,
    defaultValue: "18:00",
  },
  {
    key: "managerReference",
    label: "Reporting Manager",
    required: false,
    type: "manager",
    width: 180,
    defaultValue: "Automatic",
  },
  { key: "joiningDate", label: "Joining Date", required: false, type: "date", width: 130 },
  { key: "dateOfBirth", label: "Date of Birth", required: false, type: "date", width: 130 },
  {
    key: "gender",
    label: "Gender*",
    required: true,
    type: "enum",
    width: 160,
    defaultValue: "PREFER_NOT_TO_SAY",
    enumOptions: GENDERS,
  },
  {
    key: "employmentType",
    label: "Employment Type*",
    required: true,
    type: "enum",
    width: 140,
    defaultValue: "FULL_TIME",
    enumOptions: EMPLOYMENT_TYPES,
  },
  {
    key: "bloodGroup",
    label: "Blood Group",
    required: false,
    type: "enum",
    width: 110,
    enumOptions: BLOOD_GROUPS,
  },
  {
    key: "bankAccountHolderName",
    label: "Account Holder Name",
    required: false,
    type: "text",
    width: 180,
  },
  {
    key: "bankAccountType",
    label: "Account Type",
    required: false,
    type: "enum",
    width: 120,
    enumOptions: BANK_ACCOUNT_TYPES,
  },
  {
    key: "bankAccountNumber",
    label: "Bank Account Number",
    required: false,
    type: "text",
    width: 180,
  },
  { key: "bankIfscCode", label: "IFSC Code", required: false, type: "text", width: 120 },
  { key: "panNumber", label: "PAN Number", required: false, type: "text", width: 120 },
  { key: "aadhaarNumber", label: "Aadhaar Number", required: false, type: "text", width: 140 },
  { key: "uanNumber", label: "UAN Number", required: false, type: "text", width: 120 },
];

export type LoginImportRowValues = Record<LoginImportFieldKey, string>;

export interface LoginImportRow extends LoginImportRowValues {
  id: string;
  errors: string[];
}

export interface LoginImportContext {
  branches: Branch[];
  departments: Department[];
  existingEmployees: User[];
  /** Emails / codes already present in the sheet (excluding current row). */
  sheetEmails: Set<string>;
  sheetCodes: Set<string>;
}

export function emptyLoginRow(id: string): LoginImportRow {
  const values = Object.fromEntries(
    LOGIN_IMPORT_COLUMNS.map((column) => [column.key, column.defaultValue ?? ""]),
  ) as LoginImportRowValues;
  return { id, ...values, errors: [] };
}

export function createBlankRows(count: number, startIndex = 0): LoginImportRow[] {
  return Array.from({ length: count }, (_, index) =>
    emptyLoginRow(`row-${startIndex + index}-${Math.random().toString(36).slice(2, 8)}`),
  );
}

export function isRowBlank(row: LoginImportRowValues) {
  return !(
    row.name?.trim() ||
    row.email?.trim() ||
    row.password?.trim() ||
    row.employeeCode?.trim()
  );
}

export function resolveLoginRole(raw: string): Role | undefined {
  const text = raw.trim().toLowerCase();
  if (!text) return undefined;
  const byKey = CREATABLE_ROLES.find(
    (role) => role === text || role.replace(/_/g, " ") === text,
  );
  if (byKey) return byKey;
  const byLabel = CREATABLE_ROLES.find((role) => ROLE_LABELS[role].toLowerCase() === text);
  if (byLabel) return byLabel;
  if (text === "admin" || text === "administration head") return "main_admin";
  if (text === "department head") return "manager";
  return undefined;
}

export function resolveCompany(raw: string): CompanyEntity | undefined {
  const text = raw.trim().toLowerCase();
  if (!text) return undefined;
  for (const [value, label] of Object.entries(COMPANY_LABELS) as Array<[CompanyEntity, string]>) {
    if (value.toLowerCase() === text || label.toLowerCase() === text) return value;
  }
  return undefined;
}

export function resolveWeeklyOff(raw: string): WeeklyOffPolicy | undefined {
  const text = raw.trim().toLowerCase();
  if (!text) return undefined;
  if (text === "sunday_fixed" || text === "sunday fixed") return "SUNDAY_FIXED";
  if (
    text === "selectable" ||
    text === "selectable (approval)" ||
    text === "selectable with approval"
  )
    return "SELECTABLE";
  return WEEKLY_OFF_POLICIES.find((policy) => policy.toLowerCase() === text);
}

export function parseShiftMinutes(text: string): number | undefined {
  const value = text.trim();
  if (!value) return undefined;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

function normalizeDate(text: string): string | undefined {
  const value = text.trim();
  if (!value) return undefined;
  // DD/MM/YYYY
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export function childUnitChoices(departments: Department[]) {
  return departments
    .filter((department) => department.parentDepartmentId)
    .map((department) => {
      const parent = departments.find(
        (candidate) => candidate.id === department.parentDepartmentId,
      );
      return {
        id: department.id,
        parentId: department.parentDepartmentId!,
        label: `${parent?.name ?? "Parent"} > ${department.name}`,
      };
    });
}

export function validateLoginRow(
  row: LoginImportRowValues,
  context: LoginImportContext,
  options?: { excludeEmail?: string; excludeCode?: string },
): string[] {
  if (isRowBlank(row)) return [];

  const errors: string[] = [];
  const role = resolveLoginRole(row.role);
  const isCeo = role === "ceo";
  const companyEntity = resolveCompany(row.companyEntity);
  const weeklyOffPolicy = resolveWeeklyOff(row.weeklyOffPolicy);
  const mainUnits = context.departments.filter((department) => !department.parentDepartmentId);
  const mainUnit = mainUnits.find(
    (department) => department.name.trim().toLowerCase() === row.mainUnitName.trim().toLowerCase(),
  );
  const childChoices = childUnitChoices(context.departments);
  const childText = row.childUnitName.trim();
  const useMainUnit = !childText || childText.toLowerCase() === "use main unit";
  const childUnit = useMainUnit
    ? undefined
    : childChoices.find((choice) => choice.label.toLowerCase() === childText.toLowerCase());
  const branch = context.branches.find(
    (item) => item.name.trim().toLowerCase() === row.branchName.trim().toLowerCase(),
  );

  if (!row.name.trim()) errors.push("Full name is required");
  const email = row.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid email is required");
  if (!role) errors.push(`Unknown login role: ${row.role || "blank"}`);
  if (!companyEntity) errors.push(`Unknown employer company: ${row.companyEntity || "blank"}`);
  if (row.phone.trim().length > 30) errors.push("Personal phone must be 30 characters or fewer");
  if (row.companyPhone.trim().length > 30)
    errors.push("Company phone must be 30 characters or fewer");

  if (!isCeo) {
    if (!mainUnit) errors.push(`Unknown main organization unit: ${row.mainUnitName || "blank"}`);
    if (!useMainUnit && !childUnit)
      errors.push(`Unknown child organization unit: ${childText}`);
    if (mainUnit && childUnit && childUnit.parentId !== mainUnit.id)
      errors.push(`${childText} is not under ${row.mainUnitName}`);
  }
  if (row.branchName.trim() && !branch)
    errors.push(`Unknown attendance branch: ${row.branchName}`);
  if (!row.designation.trim()) errors.push("Designation is required");
  if (!LEVELS.includes(row.organizationLevel.trim().toUpperCase() as (typeof LEVELS)[number]))
    errors.push("Invalid organization level");
  if (!weeklyOffPolicy) errors.push("Weekly Off Policy is required");
  const shiftType = (row.shiftType.trim().toUpperCase() || "DAY") as (typeof SHIFT_TYPES)[number];
  if (!SHIFT_TYPES.includes(shiftType)) errors.push("Shift Type must be DAY or NIGHT");
  if (row.shiftStart.trim() && parseShiftMinutes(row.shiftStart) === undefined)
    errors.push("Shift Start must be HH:MM");
  if (row.shiftEnd.trim() && parseShiftMinutes(row.shiftEnd) === undefined)
    errors.push("Shift End must be HH:MM");

  const gender = row.gender.trim().toUpperCase();
  if (!GENDERS.includes(gender as (typeof GENDERS)[number])) errors.push("Invalid gender");
  const employmentType = row.employmentType.trim().toUpperCase();
  if (!EMPLOYMENT_TYPES.includes(employmentType as (typeof EMPLOYMENT_TYPES)[number]))
    errors.push("Invalid employment type");
  const bloodGroup = row.bloodGroup.trim().toUpperCase();
  if (bloodGroup && !BLOOD_GROUPS.includes(bloodGroup as never)) errors.push("Invalid blood group");
  const bankAccountType = row.bankAccountType.trim().toUpperCase();
  if (bankAccountType && !BANK_ACCOUNT_TYPES.includes(bankAccountType as never))
    errors.push("Invalid bank account type");

  const joiningDate = normalizeDate(row.joiningDate);
  if (row.joiningDate.trim() && !joiningDate) errors.push("Invalid joining date");
  if (joiningDate && (joiningDate < "1900-01-01" || joiningDate > "2100-12-31"))
    errors.push("Joining date must be between 1900-01-01 and 2100-12-31");
  const dateOfBirth = normalizeDate(row.dateOfBirth);
  if (row.dateOfBirth.trim() && !dateOfBirth) errors.push("Invalid date of birth");
  const today = new Date().toISOString().slice(0, 10);
  if (dateOfBirth && (dateOfBirth < "1900-01-01" || dateOfBirth > today))
    errors.push("Date of birth must be between 1900-01-01 and today");
  if (joiningDate && dateOfBirth && joiningDate <= dateOfBirth)
    errors.push("Joining date must be after date of birth");

  const bankAccountNumber = row.bankAccountNumber.trim();
  const bankIfscCode = row.bankIfscCode.replace(/\s+/g, "").toUpperCase();
  const panNumber = row.panNumber.replace(/\s+/g, "").toUpperCase();
  const aadhaarNumber = row.aadhaarNumber.replace(/\s+/g, "");
  const uanNumber = row.uanNumber.replace(/\s+/g, "");
  if (bankAccountNumber && !/^[A-Za-z0-9-]{6,34}$/.test(bankAccountNumber))
    errors.push("Invalid bank account number");
  if (bankIfscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfscCode))
    errors.push("Invalid IFSC code");
  if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) errors.push("Invalid PAN number");
  if (aadhaarNumber && !/^[2-9][0-9]{11}$/.test(aadhaarNumber))
    errors.push("Invalid Aadhaar number");
  if (uanNumber && !/^[0-9]{12}$/.test(uanNumber)) errors.push("Invalid UAN number");

  const password = row.password;
  if (!password) errors.push("Temporary password is required");
  else if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
    errors.push("Password needs 10+ characters, an uppercase letter, and a number");

  if (email && email !== options?.excludeEmail?.toLowerCase()) {
    if (context.sheetEmails.has(email)) errors.push("Duplicate email in sheet");
    if (
      context.existingEmployees.some((employee) => employee.email?.toLowerCase() === email)
    )
      errors.push("Email already has an account");
  }

  const code = row.employeeCode.trim().toLowerCase();
  if (code && code !== options?.excludeCode?.toLowerCase()) {
    if (context.sheetCodes.has(code)) errors.push("Duplicate employee ID in sheet");
    if (
      context.existingEmployees.some(
        (employee) =>
          (employee.employeeCode ?? employee.employeeId)?.toLowerCase() === code,
      )
    )
      errors.push("Employee ID already exists");
  }

  const managerText = row.managerReference.trim();
  const managerReference =
    managerText && managerText.toLowerCase() !== "automatic" ? managerText.toLowerCase() : "";
  if (managerReference) {
    const known = context.existingEmployees.some((employee) =>
      [employee.employeeCode, employee.employeeId, employee.email]
        .filter(Boolean)
        .some((key) => String(key).trim().toLowerCase() === managerReference),
    );
    const inSheet =
      context.sheetEmails.has(managerReference) || context.sheetCodes.has(managerReference);
    if (!known && !inSheet) errors.push(`Reporting manager not found: ${managerText}`);
    if (managerReference === email || managerReference === code)
      errors.push("Employee cannot be their own reporting manager");
  }

  return errors;
}

export function revalidateRows(
  rows: LoginImportRow[],
  context: Omit<LoginImportContext, "sheetEmails" | "sheetCodes">,
): LoginImportRow[] {
  const filled = rows.filter((row) => !isRowBlank(row));
  return rows.map((row) => {
    if (isRowBlank(row)) return { ...row, errors: [] };
    const sheetEmails = new Set(
      filled
        .filter((candidate) => candidate.id !== row.id)
        .map((candidate) => candidate.email.trim().toLowerCase())
        .filter(Boolean),
    );
    const sheetCodes = new Set(
      filled
        .filter((candidate) => candidate.id !== row.id)
        .map((candidate) => candidate.employeeCode.trim().toLowerCase())
        .filter(Boolean),
    );
    return {
      ...row,
      errors: validateLoginRow(row, { ...context, sheetEmails, sheetCodes }),
    };
  });
}

export interface LoginCreatePayload {
  name: string;
  email: string;
  role: Role;
  phone?: string;
  companyPhone?: string;
  companyEntity: CompanyEntity;
  employeeCode?: string;
  departmentId?: string | null;
  homeBranchId?: string;
  designation?: string;
  managerId?: string | null;
  managerReference?: string;
  organizationLevel: "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER";
  weeklyOffPolicy?: WeeklyOffPolicy;
  shiftType: "DAY" | "NIGHT";
  shiftStartMinutes: number;
  shiftEndMinutes: number;
  gender: "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY";
  employmentType: "FULL_TIME" | "PART_TIME" | "INTERN";
  attendanceMode: "BOTH";
  joiningDate?: string;
  dateOfBirth?: string;
  bloodGroup?: (typeof BLOOD_GROUPS)[number];
  bankAccountHolderName?: string;
  bankAccountType?: BankAccountType;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  uanNumber?: string;
  password: string;
  active: true;
  mustChangePassword: true;
}

export function rowToCreatePayload(
  row: LoginImportRowValues,
  context: {
    branches: Branch[];
    departments: Department[];
    managerId?: string | null;
  },
): LoginCreatePayload {
  const role = resolveLoginRole(row.role) ?? "employee";
  const isCeo = role === "ceo";
  const companyEntity = resolveCompany(row.companyEntity) ?? "ANYTIME_DIESEL";
  const weeklyOffPolicy = resolveWeeklyOff(row.weeklyOffPolicy) ?? "SELECTABLE";
  const mainUnit = context.departments.find(
    (department) =>
      !department.parentDepartmentId &&
      department.name.trim().toLowerCase() === row.mainUnitName.trim().toLowerCase(),
  );
  const childChoices = childUnitChoices(context.departments);
  const childText = row.childUnitName.trim();
  const useMainUnit = !childText || childText.toLowerCase() === "use main unit";
  const childUnit = useMainUnit
    ? undefined
    : childChoices.find((choice) => choice.label.toLowerCase() === childText.toLowerCase());
  const departmentId = isCeo
    ? childUnit?.id ?? mainUnit?.id ?? null
    : childUnit?.id ?? mainUnit?.id;
  const branch = context.branches.find(
    (item) => item.name.trim().toLowerCase() === row.branchName.trim().toLowerCase(),
  );
  const managerText = row.managerReference.trim();
  const managerReference =
    managerText && managerText.toLowerCase() !== "automatic" ? managerText.toLowerCase() : undefined;
  const level = row.organizationLevel.trim().toUpperCase();
  const organizationLevel = (
    LEVELS.includes(level as never) ? level : "MEMBER"
  ) as LoginCreatePayload["organizationLevel"];
  const gender = row.gender.trim().toUpperCase() as LoginCreatePayload["gender"];
  const employmentType =
    row.employmentType.trim().toUpperCase() as LoginCreatePayload["employmentType"];
  const bloodGroup = row.bloodGroup.trim().toUpperCase();
  const bankAccountType = row.bankAccountType.trim().toUpperCase();
  const shiftType = (row.shiftType.trim().toUpperCase() || "DAY") as "DAY" | "NIGHT";

  return {
    name: row.name.trim(),
    email: row.email.trim().toLowerCase(),
    role,
    phone: row.phone.trim() || undefined,
    companyPhone: row.companyPhone.trim() || undefined,
    companyEntity,
    employeeCode: row.employeeCode.trim() || undefined,
    departmentId,
    homeBranchId: branch?.id,
    designation: row.designation.trim() || undefined,
    managerId: context.managerId ?? null,
    managerReference,
    organizationLevel: isCeo ? "HEAD" : organizationLevel,
    weeklyOffPolicy: isCeo ? undefined : weeklyOffPolicy,
    shiftType,
    shiftStartMinutes: parseShiftMinutes(row.shiftStart) ?? 540,
    shiftEndMinutes: parseShiftMinutes(row.shiftEnd) ?? 1080,
    gender: GENDERS.includes(gender as never) ? gender : "PREFER_NOT_TO_SAY",
    employmentType: EMPLOYMENT_TYPES.includes(employmentType as never)
      ? employmentType
      : "FULL_TIME",
    attendanceMode: "BOTH",
    joiningDate: normalizeDate(row.joiningDate),
    dateOfBirth: normalizeDate(row.dateOfBirth),
    bloodGroup: BLOOD_GROUPS.includes(bloodGroup as never)
      ? (bloodGroup as (typeof BLOOD_GROUPS)[number])
      : undefined,
    bankAccountHolderName: row.bankAccountHolderName.trim() || undefined,
    bankAccountType: BANK_ACCOUNT_TYPES.includes(bankAccountType as never)
      ? (bankAccountType as BankAccountType)
      : undefined,
    bankAccountNumber: row.bankAccountNumber.trim() || undefined,
    bankIfscCode: row.bankIfscCode.replace(/\s+/g, "").toUpperCase() || undefined,
    panNumber: row.panNumber.replace(/\s+/g, "").toUpperCase() || undefined,
    aadhaarNumber: row.aadhaarNumber.replace(/\s+/g, "") || undefined,
    uanNumber: row.uanNumber.replace(/\s+/g, "") || undefined,
    password: row.password,
    active: true,
    mustChangePassword: true,
  };
}

export function parseClipboardTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell.length > 0));
}

export function pastedRowsMatchHeaders(firstRow: string[]) {
  const labels = LOGIN_IMPORT_COLUMNS.map((column) => column.label.toLowerCase());
  const matches = firstRow.filter((cell, index) => {
    const normalized = cell.trim().toLowerCase().replace(/\*$/, "");
    const label = labels[index]?.replace(/\*$/, "");
    return normalized && label && (normalized === label || labels.includes(normalized));
  }).length;
  return matches >= Math.min(3, firstRow.length);
}

/** Bulk edit sheet — same columns as create, but password is optional. */
export const LOGIN_EDIT_SHEET_NAME = "Edit Logins";

export const LOGIN_EDIT_COLUMNS: LoginImportColumn[] = LOGIN_IMPORT_COLUMNS.map((column) =>
  column.key === "password"
    ? {
        ...column,
        label: "New Password",
        required: false,
        defaultValue: "",
      }
    : column,
);

export interface LoginEditRow extends LoginImportRow {
  userId: string;
  employeeId?: string;
  originalEmail: string;
  originalCode: string;
  /** Snapshot of editable cell values when the sheet was loaded. */
  baseline: LoginImportRowValues;
}

function minutesToHhMm(minutes?: number | null) {
  if (minutes == null || Number.isNaN(minutes)) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function employeeToEditRow(
  employee: User,
  context: {
    branches: Branch[];
    departments: Department[];
    /** All employees — used to resolve reporting manager codes. */
    directory?: User[];
  },
): LoginEditRow | null {
  // EmployeeProfile.id is employeeId; login account id is userId.
  const accountId = employee.userId ?? null;
  if (!accountId || employee.role === "developer_admin") return null;

  const departmentId = employee.departmentId || undefined;
  const department = departmentId
    ? context.departments.find((item) => item.id === departmentId)
    : context.departments.find(
        (item) =>
          item.name.trim().toLowerCase() === String(employee.department ?? "").trim().toLowerCase(),
      );
  const parent = department?.parentDepartmentId
    ? context.departments.find((item) => item.id === department.parentDepartmentId)
    : undefined;
  const mainUnitName = parent?.name ?? department?.name ?? "";
  const childUnitName = parent
    ? `${parent.name} > ${department?.name ?? ""}`
    : "Use main unit";
  const branchName =
    employee.homeBranchName ||
    context.branches.find((branch) => branch.id === employee.homeBranchId)?.name ||
    "";

  const managerEmployee = employee.managerId
    ? (context.directory ?? []).find((item) => item.employeeId === employee.managerId)
    : undefined;
  const managerReference = managerEmployee
    ? managerEmployee.employeeCode ||
      managerEmployee.email ||
      managerEmployee.employeeId ||
      "Automatic"
    : employee.managerId || "Automatic";

  const values: LoginImportRowValues = {
    employeeCode: employee.employeeCode || "",
    name: employee.name || "",
    email: employee.email || "",
    password: "",
    role: ROLE_LABELS[employee.role] || employee.role || ROLE_LABELS.employee,
    companyEntity: employee.companyEntity
      ? COMPANY_LABELS[employee.companyEntity]
      : COMPANY_LABELS.ANYTIME_DIESEL,
    phone: employee.phone || "",
    companyPhone: employee.companyPhone || "",
    branchName,
    mainUnitName,
    childUnitName,
    designation: employee.designation || "",
    organizationLevel: employee.organizationLevel || "MEMBER",
    weeklyOffPolicy: employee.weeklyOffPolicy
      ? WEEKLY_OFF_POLICY_LABELS[employee.weeklyOffPolicy]
      : WEEKLY_OFF_POLICY_LABELS.SELECTABLE,
    shiftType: employee.shiftType || "DAY",
    shiftStart: minutesToHhMm(employee.shiftStartMinutes) || "09:00",
    shiftEnd: minutesToHhMm(employee.shiftEndMinutes) || "18:00",
    managerReference,
    joiningDate: employee.joiningDate || "",
    dateOfBirth: employee.dateOfBirth || "",
    gender: employee.gender || "PREFER_NOT_TO_SAY",
    employmentType: employee.employmentType || "FULL_TIME",
    bloodGroup: employee.bloodGroup || "",
    bankAccountHolderName: employee.bankAccountHolderName || "",
    bankAccountType: employee.bankAccountType || "",
    bankAccountNumber: employee.bankAccountNumber || "",
    bankIfscCode: employee.bankIfscCode || "",
    panNumber: employee.panNumber || "",
    aadhaarNumber: employee.aadhaarNumber || "",
    uanNumber: employee.uanNumber || "",
  };

  return {
    id: `edit-${accountId}`,
    userId: accountId,
    employeeId: employee.employeeId,
    originalEmail: (employee.email || "").toLowerCase(),
    originalCode: (employee.employeeCode || "").toLowerCase(),
    baseline: { ...values },
    ...values,
    errors: [],
  };
}

export function validateLoginEditRow(
  row: LoginEditRow,
  context: LoginImportContext,
): string[] {
  if (isRowBlank(row) && !row.userId) return [];

  const errors = validateLoginRow(
    row,
    {
      ...context,
      // Treat this account as already existing so uniqueness checks use exclude options.
      existingEmployees: context.existingEmployees.filter((employee) => {
        const isSelf =
          (employee.userId != null && employee.userId === row.userId) ||
          employee.id === row.userId ||
          (row.employeeId != null && employee.employeeId === row.employeeId);
        return !isSelf;
      }),
    },
    { excludeEmail: row.originalEmail, excludeCode: row.originalCode },
  ).filter((message) => {
    // Password is optional on edit — drop create-only password requirement messages when blank.
    if (!row.password.trim()) {
      return (
        !message.toLowerCase().includes("temporary password") &&
        !message.toLowerCase().includes("password needs") &&
        !message.toLowerCase().includes("password is required")
      );
    }
    return true;
  });

  // Re-check password rules only when provided.
  if (row.password.trim()) {
    const password = row.password;
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      if (!errors.some((message) => message.toLowerCase().includes("password"))) {
        errors.push("Password needs 10+ characters, an uppercase letter, and a number");
      }
    }
  }

  if (!row.employeeId) {
    const orgTouched = LOGIN_EDIT_COLUMNS.some((column) => {
      if (["name", "email", "phone", "role", "password"].includes(column.key)) return false;
      return (row[column.key] ?? "").trim() !== (row.baseline[column.key] ?? "").trim();
    });
    if (orgTouched) {
      errors.push(
        "No employee profile linked — only name, email, phone, role, and password can be edited",
      );
    }
  }

  return errors;
}

export function revalidateEditRows(
  rows: LoginEditRow[],
  context: Omit<LoginImportContext, "sheetEmails" | "sheetCodes">,
): LoginEditRow[] {
  const filled = rows.filter((row) => !isRowBlank(row) || Boolean(row.userId));
  return rows.map((row) => {
    const sheetEmails = new Set(
      filled
        .filter((candidate) => candidate.id !== row.id)
        .map((candidate) => candidate.email.trim().toLowerCase())
        .filter(Boolean),
    );
    const sheetCodes = new Set(
      filled
        .filter((candidate) => candidate.id !== row.id)
        .map((candidate) => candidate.employeeCode.trim().toLowerCase())
        .filter(Boolean),
    );
    return {
      ...row,
      errors: validateLoginEditRow(row, { ...context, sheetEmails, sheetCodes }),
    };
  });
}

export function isEditRowDirty(row: LoginEditRow) {
  const loginOnlyKeys = new Set<LoginImportFieldKey>([
    "name",
    "email",
    "phone",
    "role",
    "password",
  ]);
  return LOGIN_EDIT_COLUMNS.some((column) => {
    if (!row.employeeId && !loginOnlyKeys.has(column.key)) return false;
    const current = row[column.key] ?? "";
    const baseline = row.baseline[column.key] ?? "";
    if (column.key === "password") return Boolean(current.trim());
    return current.trim() !== baseline.trim();
  });
}

export interface LoginUpdatePayloads {
  userId: string;
  employeeId?: string;
  role?: Role;
  password?: string;
  employeePatch: Record<string, unknown>;
}

export function rowToUpdatePayloads(
  row: LoginEditRow,
  context: {
    branches: Branch[];
    departments: Department[];
    managerId?: string | null;
  },
): LoginUpdatePayloads {
  const create = rowToCreatePayload(row, context);
  const employeePatch: Record<string, unknown> = {
    name: create.name,
    email: create.email,
    phone: create.phone ?? null,
    companyPhone: create.companyPhone ?? null,
    companyEntity: create.companyEntity,
    employeeCode: create.employeeCode,
    departmentId: create.departmentId ?? null,
    homeBranchId: create.homeBranchId ?? null,
    designation: create.designation ?? null,
    managerId: context.managerId === undefined ? undefined : context.managerId,
    organizationLevel: create.organizationLevel,
    weeklyOffPolicy: create.weeklyOffPolicy,
    shiftType: create.shiftType,
    shiftStartMinutes: create.shiftStartMinutes,
    shiftEndMinutes: create.shiftEndMinutes,
    gender: create.gender,
    employmentType: create.employmentType,
    joiningDate: create.joiningDate ?? null,
    dateOfBirth: create.dateOfBirth ?? null,
    bloodGroup: create.bloodGroup ?? null,
  };

  // Sensitive fields: only send when the operator typed a value (blank = keep existing).
  if (row.bankAccountHolderName.trim()) {
    employeePatch.bankAccountHolderName = create.bankAccountHolderName;
  }
  if (row.bankAccountType.trim()) {
    employeePatch.bankAccountType = create.bankAccountType;
  }
  if (row.bankAccountNumber.trim()) {
    employeePatch.bankAccountNumber = create.bankAccountNumber;
  }
  if (row.bankIfscCode.trim()) {
    employeePatch.bankIfscCode = create.bankIfscCode;
  }
  if (row.panNumber.trim()) {
    employeePatch.panNumber = create.panNumber;
  }
  if (row.aadhaarNumber.trim()) {
    employeePatch.aadhaarNumber = create.aadhaarNumber;
  }
  if (row.uanNumber.trim()) {
    employeePatch.uanNumber = create.uanNumber;
  }

  return {
    userId: row.userId,
    employeeId: row.employeeId,
    role: create.role,
    password: row.password.trim() || undefined,
    employeePatch,
  };
}

export function pastedEditRowsMatchHeaders(firstRow: string[]) {
  const labels = LOGIN_EDIT_COLUMNS.map((column) => column.label.toLowerCase());
  const matches = firstRow.filter((cell, index) => {
    const normalized = cell.trim().toLowerCase().replace(/\*$/, "");
    const label = labels[index]?.replace(/\*$/, "");
    return normalized && label && (normalized === label || labels.includes(normalized));
  }).length;
  return matches >= Math.min(3, firstRow.length);
}
