import {
  BankAccountType,
  CompanyEntity,
  EmploymentType,
  Gender,
  MaritalStatus,
} from "@prisma/client";

import { encryptEmployeeField, lastFour } from "./employeePrivateData.js";
import { HttpError } from "./errors.js";

/**
 * Profile fields an employee may flag during post-punch verification, mapped to
 * the Employee column an approval writes. Fields absent from this map cannot be
 * applied automatically (foreign keys, derived columns) and must be edited from
 * the employee record instead.
 */
export const PROFILE_FIELD_TO_COLUMN: Record<string, string> = {
  name: "name",
  companyEmail: "email",
  personalEmail: "personalEmail",
  phone: "phone",
  companyPhone: "companyPhone",
  dateOfBirth: "dateOfBirth",
  gender: "gender",
  bloodGroup: "bloodGroup",
  maritalStatus: "maritalStatus",
  fatherName: "fatherName",
  husbandName: "husbandName",
  presentDoorNo: "presentDoorNo",
  presentFlatName: "presentFlatName",
  presentStreetName: "presentStreetName",
  presentCity: "presentCity",
  presentState: "presentState",
  presentPincode: "presentPincode",
  permanentSameAsPresent: "permanentSameAsPresent",
  permanentDoorNo: "permanentDoorNo",
  permanentFlatName: "permanentFlatName",
  permanentStreetName: "permanentStreetName",
  permanentCity: "permanentCity",
  permanentState: "permanentState",
  permanentPincode: "permanentPincode",
  employeeCode: "employeeCode",
  designation: "designation",
  joiningDate: "joiningDate",
  employmentType: "employmentType",
  companyEntity: "companyEntity",
  bankAccountHolderName: "bankAccountHolderName",
  bankAccountType: "bankAccountType",
  bankIfscCode: "bankIfscCode",
  bankAccountNumber: "bankAccountNumberEncrypted",
  panNumber: "panNumberEncrypted",
  aadhaarNumber: "aadhaarNumberEncrypted",
  uanNumber: "uanNumberEncrypted",
};

const DATE_COLUMNS = new Set(["dateOfBirth", "joiningDate"]);

/** Sensitive columns hold ciphertext; the paired column keeps the display suffix. */
const ENCRYPTED_COLUMNS: Record<string, string> = {
  bankAccountNumberEncrypted: "bankAccountNumberLast4",
  panNumberEncrypted: "panNumberLast4",
  aadhaarNumberEncrypted: "aadhaarNumberLast4",
  uanNumberEncrypted: "uanNumberLast4",
};

const ENUM_COLUMNS: Record<string, readonly string[]> = {
  gender: Object.values(Gender),
  maritalStatus: Object.values(MaritalStatus),
  bankAccountType: Object.values(BankAccountType),
  employmentType: Object.values(EmploymentType),
  companyEntity: Object.values(CompanyEntity),
};

/** Columns mirrored on the login row that auth and sign-in read. */
export const USER_SYNC_COLUMNS: Record<string, "name" | "email" | "phone"> = {
  name: "name",
  email: "email",
  phone: "phone",
};

/** Columns carrying a uniqueness constraint, checked before writing. */
export const UNIQUE_COLUMNS = new Set(["email", "employeeCode"]);

export interface ProfileCorrectionUpdate {
  /** Employee column being written. */
  column: string;
  /** Prisma update payload, including any paired suffix column. */
  data: Record<string, unknown>;
  /** Matching login column when the value is duplicated on the User row. */
  userColumn?: "name" | "email" | "phone";
  /** Value to compare when enforcing a uniqueness constraint. */
  uniqueValue?: string;
}

/**
 * Validate and normalize an employee-supplied correction into a Prisma update.
 * Throws HttpError(400) rather than letting malformed input reach the database.
 */
export function buildProfileCorrectionUpdate(
  field: string,
  suggestedValue: string,
): ProfileCorrectionUpdate {
  const column = PROFILE_FIELD_TO_COLUMN[field];
  if (!column) {
    throw new HttpError(
      400,
      `"${field}" cannot be applied automatically. Update it from the employee record instead.`,
    );
  }

  const suggested = suggestedValue.trim();
  if (!suggested) throw new HttpError(400, "The requested value is empty");

  const data: Record<string, unknown> = {};

  if (DATE_COLUMNS.has(column)) {
    const parsed = new Date(suggested);
    if (Number.isNaN(parsed.getTime())) {
      throw new HttpError(400, `"${suggested}" is not a valid date`);
    }
    data[column] = parsed;
  } else if (column === "permanentSameAsPresent") {
    data[column] = suggested === "true";
  } else if (ENUM_COLUMNS[column]) {
    const normalized = suggested.toUpperCase().replace(/\s+/g, "_");
    if (!ENUM_COLUMNS[column]!.includes(normalized)) {
      throw new HttpError(400, `"${suggested}" is not an accepted value for ${column}`);
    }
    data[column] = normalized;
  } else if (ENCRYPTED_COLUMNS[column]) {
    data[column] = encryptEmployeeField(suggested);
    data[ENCRYPTED_COLUMNS[column]!] = lastFour(suggested);
  } else if (column === "email") {
    data[column] = suggested.toLowerCase();
  } else {
    data[column] = suggested;
  }

  return {
    column,
    data,
    userColumn: USER_SYNC_COLUMNS[column],
    uniqueValue: UNIQUE_COLUMNS.has(column) ? (data[column] as string) : undefined,
  };
}
