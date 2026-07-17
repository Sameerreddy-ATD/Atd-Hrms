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
import type { Branch, Department, User } from "@/mock/types";
import { usersApi } from "@/services/api";

interface ImportRow {
  rowNumber: number;
  name: string;
  email: string;
  employeeCode?: string;
  departmentId?: string;
  departmentName: string;
  homeBranchId?: string;
  branchName: string;
  designation?: string;
  organizationLevel: "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER";
  gender: "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY";
  employmentType: "FULL_TIME" | "PART_TIME" | "INTERN";
  dateOfBirth?: string;
  password?: string;
  errors: string[];
}

const HEADERS = [
  "Employee Code",
  "Full Name*",
  "Email*",
  "Temporary Password*",
  "Home Branch*",
  "Main Organization Unit*",
  "Child Organization Unit",
  "Job Title",
  "Organization Level*",
  "Date of Birth",
  "Gender*",
  "Employment Type*",
] as const;

const LEVELS = ["HEAD", "SENIOR", "JUNIOR", "MEMBER"] as const;
const GENDERS = ["MALE", "FEMALE", "PREFER_NOT_TO_SAY"] as const;
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "INTERN"] as const;

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
      "2. Select branch and organization unit names from the supplied dropdowns.",
    ]);
    instructions.addRow([
      "3. Weekly offs are requested by employees for a specific date after account creation.",
    ]);
    instructions.addRow([
      "4. Leave Employee Code blank to auto-generate it, or enter a unique ID.",
    ]);
    instructions.addRow([
      "5. Every row requires a temporary password of at least 10 characters with an uppercase letter and a number.",
    ]);
    instructions.addRow([
      "6. Download a fresh template whenever branches or organization units change.",
    ]);
    instructions.addRow([
      "7. Date of Birth accepts an Excel date between 1900-01-01 and today. Leave it blank when unknown.",
    ]);
    instructions.addRow([
      "8. Rows 2 to 6 are examples only. Replace them with real employee details or delete them before upload.",
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
    employees.getColumn(4).numFmt = "@";
    employees.getColumn(10).numFmt = "yyyy-mm-dd";
    employees.autoFilter = `A1:${employees.getColumn(HEADERS.length).letter}1`;
    employees.columns = [18, 26, 32, 24, 24, 28, 28, 24, 22, 18, 22, 22].map((width) => ({
      width,
    }));

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
        branch?.name ?? "",
        mainUnit?.name ?? "",
        childChoice,
        childUnit?.name ? `${childUnit.name} Executive` : "Team Member",
        sampleLevels[index],
        new Date(1995 + index, index, 10 + index),
        sampleGenders[index],
        sampleEmploymentTypes[index],
      ];
      sampleRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CC" } };
      });
      sampleRow.getCell(1).note = "EXAMPLE ROW: replace with real details or delete before upload.";
    }

    const values = workbook.addWorksheet("Allowed Values");
    values.addRow(["Organization Level", "Gender", "Employment Type"]);
    const length = Math.max(LEVELS.length, GENDERS.length, EMPLOYMENT_TYPES.length);
    for (let index = 0; index < length; index += 1) {
      values.addRow([LEVELS[index] ?? "", GENDERS[index] ?? "", EMPLOYMENT_TYPES[index] ?? ""]);
    }
    styleReferenceSheet(values);

    for (let row = 2; row <= 501; row += 1) {
      employees.getCell(`E${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: "Select a branch",
        error: "Choose a branch from the dropdown.",
        formulae: [`Branches!$A$2:$A$${Math.max(2, branches.length + 1)}`],
      };
      employees.getCell(`F${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: "Select a main unit",
        error: "Choose a main organization unit from the dropdown.",
        formulae: [`'Organization Units'!$D$2:$D$${Math.max(2, mainUnits.length + 1)}`],
      };
      employees.getCell(`G${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Organization Units'!$E$2:$E$${Math.max(2, childUnits.length + 2)}`],
      };
      employees.getCell(`I${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Allowed Values'!$A$2:$A$${LEVELS.length + 1}`],
      };
      employees.getCell(`J${row}`).dataValidation = {
        type: "date",
        operator: "between",
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Invalid date",
        error: "Enter a date between 1900-01-01 and today.",
        formulae: [new Date(1900, 0, 1), new Date()],
      };
      employees.getCell(`J${row}`).numFmt = "yyyy-mm-dd";
      employees.getCell(`K${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Allowed Values'!$B$2:$B$${GENDERS.length + 1}`],
      };
      employees.getCell(`L${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Allowed Values'!$C$2:$C$${EMPLOYMENT_TYPES.length + 1}`],
      };
      employees.getCell(`D${row}`).note =
        "Required: at least 10 characters with an uppercase letter and a number.";
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
        const branchName = cellText(values[4]);
        const mainUnitName = cellText(values[5]);
        const childUnitName = cellText(values[6]);
        const useMainUnit = !childUnitName || childUnitName.toLowerCase() === "use main unit";
        const level = cellText(values[8]).toUpperCase();
        const gender = cellText(values[10]).toUpperCase();
        const employmentType = cellText(values[11]).toUpperCase();
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
        if (!branchRecord) errors.push(`Unknown branch: ${branchName || "blank"}`);
        if (!LEVELS.includes(level as (typeof LEVELS)[number]))
          errors.push("Invalid organization level");
        if (!GENDERS.includes(gender as (typeof GENDERS)[number])) errors.push("Invalid gender");
        if (!EMPLOYMENT_TYPES.includes(employmentType as (typeof EMPLOYMENT_TYPES)[number])) {
          errors.push("Invalid employment type");
        }
        const dateOfBirth = normalizeDate(values[9]);
        if (cellText(values[9]) && !dateOfBirth) errors.push("Invalid date of birth");
        if (
          dateOfBirth &&
          (dateOfBirth < "1900-01-01" || dateOfBirth > new Date().toISOString().slice(0, 10))
        )
          errors.push("Date of birth must be between 1900-01-01 and today");
        if (!password) errors.push("Temporary password is required");
        else if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
          errors.push("Password needs 10+ characters, an uppercase letter, and a number");

        parsed.push({
          rowNumber,
          name,
          email,
          employeeCode: employeeCode || undefined,
          departmentId: departmentRecord?.id,
          departmentName,
          homeBranchId: branchRecord?.id,
          branchName,
          designation: cellText(values[7]) || undefined,
          organizationLevel: (LEVELS.includes(level as never)
            ? level
            : "MEMBER") as ImportRow["organizationLevel"],
          gender: (GENDERS.includes(gender as never)
            ? gender
            : "PREFER_NOT_TO_SAY") as ImportRow["gender"],
          employmentType: (EMPLOYMENT_TYPES.includes(employmentType as never)
            ? employmentType
            : "FULL_TIME") as ImportRow["employmentType"],
          dateOfBirth,
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
      parsed.forEach((row) => {
        if ((emailCounts.get(row.email) ?? 0) > 1) row.errors.push("Duplicate email in workbook");
        if (existingEmails.has(row.email)) row.errors.push("Email already has an account");
        if (row.employeeCode) {
          const code = row.employeeCode.toLowerCase();
          if ((codeCounts.get(code) ?? 0) > 1) row.errors.push("Duplicate employee ID in workbook");
          if (existingCodes.has(code)) row.errors.push("Employee ID already exists");
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
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, validRows.length) }, async () => {
      while (cursor < validRows.length) {
        const row = validRows[cursor++];
        try {
          await usersApi.create({
            name: row.name,
            email: row.email,
            employeeCode: row.employeeCode,
            departmentId: row.departmentId,
            homeBranchId: row.homeBranchId,
            designation: row.designation,
            organizationLevel: row.organizationLevel,
            gender: row.gender,
            employmentType: row.employmentType,
            attendanceMode: "BOTH",
            dateOfBirth: row.dateOfBirth,
            password: row.password!,
            active: true,
            mustChangePassword: true,
          } as never);
        } catch (error) {
          failures.push({ row: row.rowNumber, message: (error as Error).message });
        } finally {
          setProgress((current) => ({ ...current, completed: current.completed + 1 }));
        }
      }
    });
    await Promise.all(workers);
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
              Download the current template, complete the Employees sheet, then upload it for
              validation.
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
                  Includes current branches and organization units
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
                    invalidCount ? "font-medium text-destructive" : "font-medium text-emerald-700"
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
                            {row.branchName || "-"}
                          </span>
                        </td>
                        <td className="p-2">
                          {row.errors.length ? (
                            <span className="text-destructive">{row.errors.join("; ")}</span>
                          ) : (
                            <span className="text-emerald-700">Valid</span>
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
