import { useMemo, useRef, useState } from "react";
import type { CellValue, Worksheet } from "exceljs";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COMPANY_LABELS,
  type BankAccountType,
  type Branch,
  type CompanyEntity,
  type Department,
  type User,
} from "@/types/domain";
import { usersApi } from "@/services/api";

interface ImportRow {
  rowNumber: number;
  name: string;
  email: string;
  phone?: string;
  companyPhone?: string;
  companyEntity: CompanyEntity;
  employeeCode?: string;
  departmentId?: string;
  departmentName: string;
  homeBranchId?: string;
  branchName: string;
  designation?: string;
  managerReference?: string;
  managerId?: string;
  organizationLevel: "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER";
  gender: "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY";
  employmentType: "FULL_TIME" | "PART_TIME" | "INTERN";
  joiningDate?: string;
  dateOfBirth?: string;
  bloodGroup?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  bankAccountHolderName?: string;
  bankAccountType?: BankAccountType;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  uanNumber?: string;
  password?: string;
  errors: string[];
}

const HEADERS = [
  "Employee Code",
  "Full Name*",
  "Email*",
  "Temporary Password*",
  "Employer Company*",
  "Personal Phone",
  "Company Phone",
  "Attendance Branch",
  "Main Organization Unit*",
  "Child Organization Unit",
  "Designation*",
  "Organization Level*",
  "Reporting Manager Code or Email",
  "Joining Date",
  "Date of Birth",
  "Gender*",
  "Employment Type*",
  "Blood Group",
  "Account Holder Name",
  "Account Type",
  "Bank Account Number",
  "IFSC Code",
  "PAN Number",
  "Aadhaar Number",
  "UAN Number",
] as const;

const LEVELS = ["HEAD", "SENIOR", "JUNIOR", "MEMBER"] as const;
const GENDERS = ["MALE", "FEMALE", "PREFER_NOT_TO_SAY"] as const;
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "INTERN"] as const;
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const BANK_ACCOUNT_TYPES = ["SAVINGS", "CURRENT", "SALARY", "NRE", "NRO", "OTHER"] as const;
const COMPANY_ENTRIES = Object.entries(COMPANY_LABELS) as Array<[CompanyEntity, string]>;

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result !== undefined) return String(value.result).trim();
    if ("richText" in value)
      return value.richText
        .map((part) => part.text)
        .join("")
        .trim();
  }
  return String(value).trim();
}

function normalizeDate(value: CellValue) {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  const text = cellText(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function styleReferenceSheet(sheet: Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD92D20" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((column) => {
    column.width = 28;
  });
}

export function BulkEmployeeImport({
  branches,
  departments,
  existingEmployees,
  onImported,
}: {
  branches: Branch[];
  departments: Department[];
  existingEmployees: User[];
  onImported: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  const invalidCount = useMemo(() => rows.filter((row) => row.errors.length > 0).length, [rows]);

  async function downloadTemplate() {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    workbook.creator = "Anytime Diesel Employee Management System";
    workbook.created = new Date();

    const instructions = workbook.addWorksheet("Instructions");
    instructions.addRow(["Anytime Diesel Employee Import"]);
    instructions.addRow([
      "1. Enter employees only in the Employees sheet. Do not rename the column headers.",
    ]);
    instructions.addRow([
      "2. Select employer company, organization units, and other controlled values from the supplied dropdowns.",
    ]);
    instructions.addRow([
      "3. Application role is assigned securely from the organization unit and organization level; it is not imported directly.",
    ]);
    instructions.addRow([
      "4. Attendance Branch is optional. Employer Company replaces the old mandatory Home Branch profile field.",
    ]);
    instructions.addRow([
      "5. Leave Employee Code blank to auto-generate it, or enter a unique code.",
    ]);
    instructions.addRow([
      "6. Reporting Manager accepts an existing or same-workbook employee code/email. Leave blank or enter Automatic for hierarchy-based assignment.",
    ]);
    instructions.addRow([
      "7. Every row requires a temporary password of at least 10 characters with an uppercase letter and a number.",
    ]);
    instructions.addRow([
      "8. Joining Date and Date of Birth accept Excel dates. Date of Birth cannot be in the future.",
    ]);
    instructions.addRow([
      "9. Banking, PAN, Aadhaar, and UAN values are optional, validated, encrypted by the server, and never stored as plaintext in the database.",
    ]);
    instructions.addRow([
      "10. The workbook itself contains plaintext passwords and any private data entered. Store it securely and delete it after a successful import.",
    ]);
    instructions.addRow([
      "11. Download a fresh template whenever companies, branches, organization units, or employees change.",
    ]);
    instructions.addRow([
      "12. Rows 2 to 6 are examples only. Replace them with real employee details or delete them before upload.",
    ]);
    instructions.getColumn(1).width = 100;
    instructions.getRow(1).font = { bold: true, size: 16, color: { argb: "FFD92D20" } };

    const employees = workbook.addWorksheet("Employees");
    employees.addRow([...HEADERS]);
    for (let row = 0; row < 80; row += 1) employees.addRow([]);
    employees.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    employees.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD92D20" },
    };
    employees.views = [{ state: "frozen", ySplit: 1 }];
    employees.properties.defaultRowHeight = 20;
    [4, 6, 7, 13, 21, 22, 23, 24, 25].forEach((column) => {
      employees.getColumn(column).numFmt = "@";
    });
    employees.getColumn(14).numFmt = "yyyy-mm-dd";
    employees.getColumn(15).numFmt = "yyyy-mm-dd";
    employees.autoFilter = `A1:${employees.getColumn(HEADERS.length).letter}1`;
    employees.columns = [
      18, 26, 32, 24, 34, 20, 20, 24, 28, 28, 24, 22, 30, 18, 18, 22, 22, 18, 26, 20, 26, 18, 18,
      22, 20,
    ].map((width) => ({ width }));

    const branchSheet = workbook.addWorksheet("Branches");
    branchSheet.addRow(["Branch Name", "Branch ID"]);
    branches.forEach((branch) => branchSheet.addRow([branch.name, branch.id]));
    styleReferenceSheet(branchSheet);

    const departmentSheet = workbook.addWorksheet("Organization Units");
    departmentSheet.addRow([
      "Organization Unit",
      "Unit ID",
      "Parent Unit",
      "Main Unit Choices",
      "Child Unit Choices",
    ]);
    departments.forEach((department) => {
      const parent = departments.find(
        (candidate) => candidate.id === department.parentDepartmentId,
      );
      departmentSheet.addRow([department.name, department.id, parent?.name ?? ""]);
    });
    const mainUnits = departments.filter((department) => !department.parentDepartmentId);
    const childUnits = departments.filter((department) => department.parentDepartmentId);
    const choiceRows = Math.max(mainUnits.length, childUnits.length + 1);
    for (let index = 0; index < choiceRows; index += 1) {
      departmentSheet.getCell(index + 2, 4).value = mainUnits[index]?.name ?? "";
      departmentSheet.getCell(index + 2, 5).value =
        index === 0
          ? "Use main unit"
          : childUnits[index - 1]
            ? `${departments.find((unit) => unit.id === childUnits[index - 1].parentDepartmentId)?.name ?? "Parent"} > ${childUnits[index - 1].name}`
            : "";
    }
    styleReferenceSheet(departmentSheet);

    const managerSheet = workbook.addWorksheet("Reporting Managers");
    managerSheet.addRow(["Employee Code", "Employee Name", "Email"]);
    existingEmployees
      .filter((employee) => employee.employeeId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((employee) =>
        managerSheet.addRow([
          employee.employeeCode ?? employee.employeeId ?? "",
          employee.name,
          employee.email,
        ]),
      );
    styleReferenceSheet(managerSheet);

    const sampleNames = [
      "Sample Employee One",
      "Sample Employee Two",
      "Sample Employee Three",
      "Sample Employee Four",
      "Sample Employee Five",
    ];
    const sampleLevels = ["MEMBER", "SENIOR", "JUNIOR", "MEMBER", "SENIOR"];
    const sampleGenders = ["MALE", "FEMALE", "MALE", "FEMALE", "PREFER_NOT_TO_SAY"];
    const sampleEmploymentTypes = ["FULL_TIME", "FULL_TIME", "INTERN", "PART_TIME", "FULL_TIME"];
    for (let index = 0; index < 5; index += 1) {
      const mainUnit = mainUnits[index % Math.max(1, mainUnits.length)];
      const childUnit = childUnits.find(
        (department) => department.parentDepartmentId === mainUnit?.id,
      );
      const branch = branches[index % Math.max(1, branches.length)];
      const childChoice = childUnit
        ? `${mainUnit?.name ?? "Parent"} > ${childUnit.name}`
        : "Use main unit";
      const sampleRow = employees.getRow(index + 2);
      sampleRow.values = [
        `SAMPLE-${String(index + 1).padStart(3, "0")}`,
        sampleNames[index],
        `sample.employee${index + 1}@example.com`,
        "Welcome123",
        COMPANY_LABELS[
          index % 2 === 0 ? "ANYTIME_DIESEL" : "FUELISTIC_INNOVATIONS_PRIVATE_LIMITED"
        ],
        `90000000${String(index + 1).padStart(2, "0")}`,
        "",
        branch?.name ?? "",
        mainUnit?.name ?? "",
        childChoice,
        childUnit?.name ? `${childUnit.name} Executive` : "Team Member",
        sampleLevels[index],
        "Automatic",
        new Date(2024, index, 1),
        new Date(1995 + index, index, 10 + index),
        sampleGenders[index],
        sampleEmploymentTypes[index],
        index === 0 ? "O+" : "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ];
      sampleRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CC" } };
      });
      sampleRow.getCell(1).note = "EXAMPLE ROW: replace with real details or delete before upload.";
    }

    const values = workbook.addWorksheet("Allowed Values");
    values.addRow([
      "Employer Company",
      "Organization Level",
      "Gender",
      "Employment Type",
      "Blood Group",
      "Account Type",
    ]);
    const length = Math.max(
      COMPANY_ENTRIES.length,
      LEVELS.length,
      GENDERS.length,
      EMPLOYMENT_TYPES.length,
      BLOOD_GROUPS.length,
      BANK_ACCOUNT_TYPES.length,
    );
    for (let index = 0; index < length; index += 1) {
      values.addRow([
        COMPANY_ENTRIES[index]?.[1] ?? "",
        LEVELS[index] ?? "",
        GENDERS[index] ?? "",
        EMPLOYMENT_TYPES[index] ?? "",
        BLOOD_GROUPS[index] ?? "",
        BANK_ACCOUNT_TYPES[index] ?? "",
      ]);
    }
    styleReferenceSheet(values);

    for (let row = 2; row <= 501; row += 1) {
      employees.getCell(`E${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: "Select an employer company",
        error: "Choose an employer company from the dropdown.",
        formulae: [`'Allowed Values'!$A$2:$A$${COMPANY_ENTRIES.length + 1}`],
      };
      employees.getCell(`H${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Select an attendance branch",
        error: "Choose a branch from the dropdown or leave it blank.",
        formulae: [`Branches!$A$2:$A$${Math.max(2, branches.length + 1)}`],
      };
      employees.getCell(`I${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: "Select a main unit",
        error: "Choose a main organization unit from the dropdown.",
        formulae: [`'Organization Units'!$D$2:$D$${Math.max(2, mainUnits.length + 1)}`],
      };
      employees.getCell(`J${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Organization Units'!$E$2:$E$${Math.max(2, childUnits.length + 2)}`],
      };
      employees.getCell(`L${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Allowed Values'!$B$2:$B$${LEVELS.length + 1}`],
      };
      employees.getCell(`N${row}`).dataValidation = {
        type: "date",
        operator: "between",
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Invalid date",
        error: "Enter a joining date between 1900-01-01 and 2100-12-31.",
        formulae: [new Date(1900, 0, 1), new Date(2100, 11, 31)],
      };
      employees.getCell(`N${row}`).numFmt = "yyyy-mm-dd";
      employees.getCell(`O${row}`).dataValidation = {
        type: "date",
        operator: "between",
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Invalid date",
        error: "Enter a date of birth between 1900-01-01 and today.",
        formulae: [new Date(1900, 0, 1), new Date()],
      };
      employees.getCell(`O${row}`).numFmt = "yyyy-mm-dd";
      employees.getCell(`P${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Allowed Values'!$C$2:$C$${GENDERS.length + 1}`],
      };
      employees.getCell(`Q${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Allowed Values'!$D$2:$D$${EMPLOYMENT_TYPES.length + 1}`],
      };
      employees.getCell(`R${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Allowed Values'!$E$2:$E$${BLOOD_GROUPS.length + 1}`],
      };
      employees.getCell(`T${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Allowed Values'!$F$2:$F$${BANK_ACCOUNT_TYPES.length + 1}`],
      };
      employees.getCell(`D${row}`).note =
        "Required: at least 10 characters with an uppercase letter and a number.";
      employees.getCell(`M${row}`).note =
        "Enter an employee code/email from Reporting Managers, a same-workbook employee code/email, or Automatic.";
      employees.getCell(`U${row}`).note =
        "Optional private value. The server encrypts it after import; protect and delete this workbook.";
      if (row <= 81) {
        employees.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            bottom: { style: "hair", color: { argb: "FFD9DEE5" } },
          };
        });
      }
    }

    await Promise.all([
      branchSheet.protect("", { selectLockedCells: true }),
      departmentSheet.protect("", { selectLockedCells: true }),
      managerSheet.protect("", { selectLockedCells: true }),
      values.protect("", { selectLockedCells: true }),
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ATD-Employee-Import-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function readFile(file: File) {
    setReading(true);
    setFileName(file.name);
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.getWorksheet("Employees") ?? workbook.worksheets[0];
      if (!sheet) throw new Error("The workbook does not contain an Employees sheet.");
      const uploadedHeaders = HEADERS.map((_, index) =>
        cellText(sheet.getRow(1).getCell(index + 1).value),
      );
      const incorrectHeader = HEADERS.findIndex(
        (header, index) => uploadedHeaders[index] !== header,
      );
      if (incorrectHeader >= 0) {
        throw new Error(
          `Column ${incorrectHeader + 1} must be named "${HEADERS[incorrectHeader]}". Download a fresh template and do not rename headers.`,
        );
      }

      const branchMap = new Map(
        branches.map((branch) => [branch.name.trim().toLowerCase(), branch]),
      );
      const companyMap = new Map<string, CompanyEntity>();
      COMPANY_ENTRIES.forEach(([value, label]) => {
        companyMap.set(value.toLowerCase(), value);
        companyMap.set(label.toLowerCase(), value);
      });
      const departmentMap = new Map(
        departments.map((department) => [department.name.trim().toLowerCase(), department]),
      );
      const childChoiceMap = new Map(
        departments
          .filter((department) => department.parentDepartmentId)
          .map((department) => {
            const parent = departments.find(
              (candidate) => candidate.id === department.parentDepartmentId,
            );
            return [`${parent?.name ?? "Parent"} > ${department.name}`.toLowerCase(), department];
          }),
      );
      const managerMap = new Map<string, string>();
      existingEmployees.forEach((employee) => {
        if (!employee.employeeId) return;
        [employee.employeeCode, employee.employeeId, employee.email]
          .filter(Boolean)
          .forEach((key) => {
            managerMap.set(String(key).trim().toLowerCase(), employee.employeeId!);
          });
      });
      const parsed: ImportRow[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = Array.from(
          { length: HEADERS.length },
          (_, index) => row.getCell(index + 1).value,
        );
        if (values.every((value) => !cellText(value))) return;
        const employeeCode = cellText(values[0]);
        const name = cellText(values[1]);
        const email = cellText(values[2]).toLowerCase();
        const password = cellText(values[3]);
        const companyName = cellText(values[4]);
        const phone = cellText(values[5]);
        const companyPhone = cellText(values[6]);
        const branchName = cellText(values[7]);
        const mainUnitName = cellText(values[8]);
        const childUnitName = cellText(values[9]);
        const useMainUnit = !childUnitName || childUnitName.toLowerCase() === "use main unit";
        const designation = cellText(values[10]);
        const level = cellText(values[11]).toUpperCase();
        const managerText = cellText(values[12]);
        const managerReference =
          managerText && managerText.toLowerCase() !== "automatic"
            ? managerText.toLowerCase()
            : undefined;
        const gender = cellText(values[15]).toUpperCase();
        const employmentType = cellText(values[16]).toUpperCase();
        const bloodGroup = cellText(values[17]).toUpperCase();
        const bankAccountHolderName = cellText(values[18]);
        const bankAccountType = cellText(values[19]).toUpperCase();
        const bankAccountNumber = cellText(values[20]);
        const bankIfscCode = cellText(values[21]).replace(/\s+/g, "").toUpperCase();
        const panNumber = cellText(values[22]).replace(/\s+/g, "").toUpperCase();
        const aadhaarNumber = cellText(values[23]).replace(/\s+/g, "");
        const uanNumber = cellText(values[24]).replace(/\s+/g, "");
        const companyEntity = companyMap.get(companyName.toLowerCase());
        const branchRecord = branchMap.get(branchName.toLowerCase());
        const mainUnitRecord = departmentMap.get(mainUnitName.toLowerCase());
        const childUnitRecord = useMainUnit
          ? undefined
          : childChoiceMap.get(childUnitName.toLowerCase());
        const departmentRecord = childUnitRecord ?? mainUnitRecord;
        const departmentName =
          departmentRecord?.name ?? (useMainUnit ? mainUnitName : childUnitName);
        const errors: string[] = [];
        if (!name) errors.push("Full name is required");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid email is required");
        if (!companyEntity) errors.push(`Unknown employer company: ${companyName || "blank"}`);
        if (phone.length > 30) errors.push("Personal phone must be 30 characters or fewer");
        if (companyPhone.length > 30) errors.push("Company phone must be 30 characters or fewer");
        if (!mainUnitRecord || mainUnitRecord.parentDepartmentId)
          errors.push(`Unknown main organization unit: ${mainUnitName || "blank"}`);
        if (!useMainUnit && !childUnitRecord)
          errors.push(`Unknown child organization unit: ${childUnitName}`);
        if (
          mainUnitRecord &&
          childUnitRecord &&
          childUnitRecord.parentDepartmentId !== mainUnitRecord.id
        )
          errors.push(`${childUnitName} is not under ${mainUnitName}`);
        if (branchName && !branchRecord) errors.push(`Unknown attendance branch: ${branchName}`);
        if (!designation) errors.push("Designation is required");
        if (!LEVELS.includes(level as (typeof LEVELS)[number]))
          errors.push("Invalid organization level");
        if (!GENDERS.includes(gender as (typeof GENDERS)[number])) errors.push("Invalid gender");
        if (!EMPLOYMENT_TYPES.includes(employmentType as (typeof EMPLOYMENT_TYPES)[number])) {
          errors.push("Invalid employment type");
        }
        if (bloodGroup && !BLOOD_GROUPS.includes(bloodGroup as never))
          errors.push("Invalid blood group");
        if (bankAccountType && !BANK_ACCOUNT_TYPES.includes(bankAccountType as never))
          errors.push("Invalid bank account type");
        const joiningDate = normalizeDate(values[13]);
        if (cellText(values[13]) && !joiningDate) errors.push("Invalid joining date");
        if (joiningDate && (joiningDate < "1900-01-01" || joiningDate > "2100-12-31"))
          errors.push("Joining date must be between 1900-01-01 and 2100-12-31");
        const dateOfBirth = normalizeDate(values[14]);
        if (cellText(values[14]) && !dateOfBirth) errors.push("Invalid date of birth");
        if (
          dateOfBirth &&
          (dateOfBirth < "1900-01-01" || dateOfBirth > new Date().toISOString().slice(0, 10))
        )
          errors.push("Date of birth must be between 1900-01-01 and today");
        if (bankAccountNumber && !/^[A-Za-z0-9-]{6,34}$/.test(bankAccountNumber))
          errors.push("Invalid bank account number");
        if (bankIfscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfscCode))
          errors.push("Invalid IFSC code");
        if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber))
          errors.push("Invalid PAN number");
        if (aadhaarNumber && !/^[2-9][0-9]{11}$/.test(aadhaarNumber))
          errors.push("Invalid Aadhaar number");
        if (uanNumber && !/^[0-9]{12}$/.test(uanNumber)) errors.push("Invalid UAN number");
        if (!password) errors.push("Temporary password is required");
        else if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
          errors.push("Password needs 10+ characters, an uppercase letter, and a number");

        parsed.push({
          rowNumber,
          name,
          email,
          phone: phone || undefined,
          companyPhone: companyPhone || undefined,
          companyEntity: companyEntity ?? "ANYTIME_DIESEL",
          employeeCode: employeeCode || undefined,
          departmentId: departmentRecord?.id,
          departmentName,
          homeBranchId: branchRecord?.id,
          branchName,
          designation: designation || undefined,
          managerReference,
          managerId: managerReference ? managerMap.get(managerReference) : undefined,
          organizationLevel: (LEVELS.includes(level as never)
            ? level
            : "MEMBER") as ImportRow["organizationLevel"],
          gender: (GENDERS.includes(gender as never)
            ? gender
            : "PREFER_NOT_TO_SAY") as ImportRow["gender"],
          employmentType: (EMPLOYMENT_TYPES.includes(employmentType as never)
            ? employmentType
            : "FULL_TIME") as ImportRow["employmentType"],
          joiningDate,
          dateOfBirth,
          bloodGroup: (BLOOD_GROUPS.includes(bloodGroup as never)
            ? bloodGroup
            : undefined) as ImportRow["bloodGroup"],
          bankAccountHolderName: bankAccountHolderName || undefined,
          bankAccountType: (BANK_ACCOUNT_TYPES.includes(bankAccountType as never)
            ? bankAccountType
            : undefined) as ImportRow["bankAccountType"],
          bankAccountNumber: bankAccountNumber || undefined,
          bankIfscCode: bankIfscCode || undefined,
          panNumber: panNumber || undefined,
          aadhaarNumber: aadhaarNumber || undefined,
          uanNumber: uanNumber || undefined,
          password: password || undefined,
          errors,
        });
      });
      if (parsed.length > 500)
        throw new Error("A maximum of 500 employees can be imported at once.");
      if (!parsed.length) throw new Error("No employee rows were found in the workbook.");
      const emailCounts = new Map<string, number>();
      const codeCounts = new Map<string, number>();
      parsed.forEach((row) => emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1));
      parsed.forEach((row) => {
        if (row.employeeCode) {
          const code = row.employeeCode.toLowerCase();
          codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
        }
      });
      const existingEmails = new Set(
        existingEmployees.map((row) => row.email?.toLowerCase()).filter(Boolean),
      );
      const existingCodes = new Set(
        existingEmployees
          .map((row) => (row.employeeCode ?? row.employeeId)?.toLowerCase())
          .filter(Boolean),
      );
      const workbookManagerReferences = new Set<string>();
      parsed.forEach((row) => {
        workbookManagerReferences.add(row.email);
        if (row.employeeCode) workbookManagerReferences.add(row.employeeCode.toLowerCase());
      });
      parsed.forEach((row) => {
        if (
          /^SAMPLE-\d+$/i.test(row.employeeCode ?? "") ||
          /^sample\.employee\d+@example\.com$/i.test(row.email)
        ) {
          row.errors.push("Replace or delete this example row before importing");
        }
        if ((emailCounts.get(row.email) ?? 0) > 1) row.errors.push("Duplicate email in workbook");
        if (existingEmails.has(row.email)) row.errors.push("Email already has an account");
        if (row.employeeCode) {
          const code = row.employeeCode.toLowerCase();
          if ((codeCounts.get(code) ?? 0) > 1) row.errors.push("Duplicate employee ID in workbook");
          if (existingCodes.has(code)) row.errors.push("Employee ID already exists");
        }
        if (
          row.managerReference &&
          !managerMap.has(row.managerReference) &&
          !workbookManagerReferences.has(row.managerReference)
        ) {
          row.errors.push(`Reporting manager not found: ${row.managerReference}`);
        }
        if (
          row.managerReference &&
          (row.managerReference === row.email ||
            row.managerReference === row.employeeCode?.toLowerCase())
        ) {
          row.errors.push("Employee cannot be their own reporting manager");
        }
        if (row.joiningDate && row.dateOfBirth && row.joiningDate <= row.dateOfBirth) {
          row.errors.push("Joining date must be after date of birth");
        }
      });
      setRows(parsed);
    } catch (error) {
      setRows([]);
      toast.error((error as Error).message);
    } finally {
      setReading(false);
    }
  }

  async function importRows() {
    const validRows = rows.filter((row) => row.errors.length === 0);
    if (!validRows.length || invalidCount) return;
    setImporting(true);
    setProgress({ completed: 0, total: validRows.length });
    const failures: Array<{ row: number; message: string }> = [];
    const resolvedManagerIds = new Map<string, string>();
    existingEmployees.forEach((employee) => {
      if (!employee.employeeId) return;
      [employee.employeeCode, employee.employeeId, employee.email]
        .filter(Boolean)
        .forEach((key) => {
          resolvedManagerIds.set(String(key).trim().toLowerCase(), employee.employeeId!);
        });
    });
    const pending = [...validRows];
    while (pending.length) {
      const ready = pending
        .filter(
          (row) =>
            !row.managerReference ||
            Boolean(row.managerId) ||
            resolvedManagerIds.has(row.managerReference),
        )
        .slice(0, 4);
      if (!ready.length) {
        pending.forEach((row) =>
          failures.push({
            row: row.rowNumber,
            message:
              "Reporting manager could not be created or resolved. Check for a failed manager or circular reporting relationship.",
          }),
        );
        setProgress((current) => ({
          ...current,
          completed: current.completed + pending.length,
        }));
        pending.length = 0;
        break;
      }
      ready.forEach((row) => pending.splice(pending.indexOf(row), 1));
      await Promise.all(
        ready.map(async (row) => {
          try {
            const created = await usersApi.create({
              name: row.name,
              email: row.email,
              phone: row.phone,
              companyPhone: row.companyPhone,
              companyEntity: row.companyEntity,
              employeeCode: row.employeeCode,
              departmentId: row.departmentId,
              homeBranchId: row.homeBranchId,
              designation: row.designation,
              managerId:
                row.managerId ??
                (row.managerReference ? resolvedManagerIds.get(row.managerReference) : undefined),
              organizationLevel: row.organizationLevel,
              gender: row.gender,
              employmentType: row.employmentType,
              attendanceMode: "BOTH",
              joiningDate: row.joiningDate,
              dateOfBirth: row.dateOfBirth,
              bloodGroup: row.bloodGroup,
              bankAccountHolderName: row.bankAccountHolderName,
              bankAccountType: row.bankAccountType,
              bankAccountNumber: row.bankAccountNumber,
              bankIfscCode: row.bankIfscCode,
              panNumber: row.panNumber,
              aadhaarNumber: row.aadhaarNumber,
              uanNumber: row.uanNumber,
              password: row.password!,
              active: true,
              mustChangePassword: true,
            } as never);
            if (created.employeeId) {
              resolvedManagerIds.set(row.email, created.employeeId);
              if (row.employeeCode) {
                resolvedManagerIds.set(row.employeeCode.toLowerCase(), created.employeeId);
              }
            }
          } catch (error) {
            failures.push({ row: row.rowNumber, message: (error as Error).message });
          } finally {
            setProgress((current) => ({ ...current, completed: current.completed + 1 }));
          }
        }),
      );
    }
    setImporting(false);
    if (failures.length) {
      setRows((current) =>
        current
          .filter((row) => failures.some((item) => item.row === row.rowNumber))
          .map((row) => {
            const failure = failures.find((item) => item.row === row.rowNumber);
            return failure ? { ...row, errors: [failure.message] } : row;
          }),
      );
      await onImported();
      toast.error(
        `${validRows.length - failures.length} imported; ${failures.length} row${failures.length === 1 ? "" : "s"} failed.`,
      );
    } else {
      toast.success(`${validRows.length} employees imported successfully.`);
      await onImported();
      setOpen(false);
      setRows([]);
      setFileName("");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="mr-2 h-4 w-4" /> Bulk import
      </Button>
      <Dialog open={open} onOpenChange={(next) => !importing && setOpen(next)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk import employees</DialogTitle>
            <DialogDescription>
              Download the current template, complete the full employee profile, then upload it for
              validation before anything is saved.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start p-4"
              onClick={downloadTemplate}
            >
              <Download className="mr-3 h-5 w-5" />
              <span className="text-left">
                <span className="block font-medium">Download Excel template</span>
                <span className="block text-xs text-muted-foreground">
                  Includes companies, units, managers, profile and banking fields
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start p-4"
              disabled={reading}
              onClick={() => inputRef.current?.click()}
            >
              {reading ? (
                <Loader2 className="mr-3 h-5 w-5 animate-spin" />
              ) : (
                <Upload className="mr-3 h-5 w-5" />
              )}
              <span className="min-w-0 text-left">
                <span className="block font-medium">Upload completed template</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {fileName || ".xlsx files up to 500 employees"}
                </span>
              </span>
            </Button>
            <input
              ref={inputRef}
              className="hidden"
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = "";
              }}
            />
          </div>

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <span>{rows.length} employee rows found</span>
                <span
                  className={
                    invalidCount
                      ? "font-medium text-destructive"
                      : "font-medium text-emerald-700 dark:text-emerald-400"
                  }
                >
                  {invalidCount ? `${invalidCount} rows need correction` : "Ready to import"}
                </span>
              </div>
              <div className="max-h-72 overflow-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-2">Row</th>
                      <th className="p-2">Employee</th>
                      <th className="p-2">Unit / Branch</th>
                      <th className="p-2">Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className="border-t align-top">
                        <td className="p-2 tabular-nums">{row.rowNumber}</td>
                        <td className="p-2">
                          <span className="block font-medium">{row.name || "-"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {row.email || "-"}
                          </span>
                        </td>
                        <td className="p-2">
                          <span className="block">{row.departmentName || "-"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {COMPANY_LABELS[row.companyEntity]}
                            {row.branchName ? ` · ${row.branchName}` : ""}
                          </span>
                        </td>
                        <td className="p-2">
                          {row.errors.length ? (
                            <span className="text-destructive">{row.errors.join("; ")}</span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400">Valid</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importing && (
            <p className="text-sm text-muted-foreground">
              Importing {progress.completed} of {progress.total} employees...
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={importing} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!rows.length || invalidCount > 0 || importing} onClick={importRows}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import employees
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
