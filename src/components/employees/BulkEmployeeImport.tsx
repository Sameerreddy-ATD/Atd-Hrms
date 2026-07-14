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
import type { Branch, Department } from "@/mock/types";
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
  weeklyOffDays: string[];
  dateOfBirth?: string;
  password?: string;
  errors: string[];
}

const HEADERS = [
  "Full Name*",
  "Email*",
  "Employee Code",
  "Organization Unit*",
  "Home Branch*",
  "Job Title",
  "Organization Level*",
  "Gender*",
  "Employment Type*",
  "Weekly Off Days*",
  "Date of Birth",
  "Temporary Password",
] as const;

const LEVELS = ["HEAD", "SENIOR", "JUNIOR", "MEMBER"] as const;
const GENDERS = ["MALE", "FEMALE", "PREFER_NOT_TO_SAY"] as const;
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "INTERN"] as const;
const WEEKDAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

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
  onImported,
}: {
  branches: Branch[];
  departments: Department[];
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
    workbook.creator = "Anytime Diesel HRMS";
    workbook.created = new Date();

    const instructions = workbook.addWorksheet("Instructions");
    instructions.addRow(["Anytime Diesel HRMS Employee Import"]);
    instructions.addRow([
      "1. Enter employees only in the Employees sheet. Do not rename the column headers.",
    ]);
    instructions.addRow([
      "2. Select branch and organization unit names from the supplied dropdowns.",
    ]);
    instructions.addRow(["3. Use comma-separated weekly off days, for example SATURDAY,SUNDAY."]);
    instructions.addRow(["4. Leave Employee Code blank to auto-generate it."]);
    instructions.addRow([
      "5. Leave Temporary Password blank to use the company predefined password.",
    ]);
    instructions.addRow([
      "6. Download a fresh template whenever branches or organization units change.",
    ]);
    instructions.getColumn(1).width = 100;
    instructions.getRow(1).font = { bold: true, size: 16, color: { argb: "FFD92D20" } };

    const employees = workbook.addWorksheet("Employees");
    employees.addRow([...HEADERS]);
    employees.addRow([]);
    employees.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    employees.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD92D20" },
    };
    employees.views = [{ state: "frozen", ySplit: 1 }];
    employees.autoFilter = "A1:L1";
    employees.columns = [26, 32, 18, 28, 24, 24, 22, 22, 22, 24, 18, 24].map((width) => ({
      width,
    }));

    const branchSheet = workbook.addWorksheet("Branches");
    branchSheet.addRow(["Branch Name", "Branch ID"]);
    branches.forEach((branch) => branchSheet.addRow([branch.name, branch.id]));
    styleReferenceSheet(branchSheet);

    const departmentSheet = workbook.addWorksheet("Organization Units");
    departmentSheet.addRow(["Organization Unit", "Unit ID", "Parent Unit"]);
    departments.forEach((department) => {
      const parent = departments.find(
        (candidate) => candidate.id === department.parentDepartmentId,
      );
      departmentSheet.addRow([department.name, department.id, parent?.name ?? ""]);
    });
    styleReferenceSheet(departmentSheet);

    const values = workbook.addWorksheet("Allowed Values");
    values.addRow(["Organization Level", "Gender", "Employment Type", "Weekday"]);
    const length = Math.max(
      LEVELS.length,
      GENDERS.length,
      EMPLOYMENT_TYPES.length,
      WEEKDAYS.length,
    );
    for (let index = 0; index < length; index += 1) {
      values.addRow([
        LEVELS[index] ?? "",
        GENDERS[index] ?? "",
        EMPLOYMENT_TYPES[index] ?? "",
        WEEKDAYS[index] ?? "",
      ]);
    }
    styleReferenceSheet(values);

    for (let row = 2; row <= 501; row += 1) {
      employees.getCell(`D${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Organization Units'!$A$2:$A$${Math.max(2, departments.length + 1)}`],
      };
      employees.getCell(`E${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`Branches!$A$2:$A$${Math.max(2, branches.length + 1)}`],
      };
      employees.getCell(`G${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Allowed Values'!$A$2:$A$${LEVELS.length + 1}`],
      };
      employees.getCell(`H${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Allowed Values'!$B$2:$B$${GENDERS.length + 1}`],
      };
      employees.getCell(`I${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'Allowed Values'!$C$2:$C$${EMPLOYMENT_TYPES.length + 1}`],
      };
      employees.getCell(`J${row}`).note =
        "Use comma-separated days, for example SUNDAY or SATURDAY,SUNDAY";
      employees.getCell(`L${row}`).note = "Leave blank to use the predefined company password.";
    }

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

      const branchMap = new Map(
        branches.map((branch) => [branch.name.trim().toLowerCase(), branch]),
      );
      const departmentMap = new Map(
        departments.map((department) => [department.name.trim().toLowerCase(), department]),
      );
      const parsed: ImportRow[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = Array.from({ length: 12 }, (_, index) => row.getCell(index + 1).value);
        if (values.every((value) => !cellText(value))) return;
        const name = cellText(values[0]);
        const email = cellText(values[1]).toLowerCase();
        const departmentName = cellText(values[3]);
        const branchName = cellText(values[4]);
        const level = cellText(values[6]).toUpperCase();
        const gender = cellText(values[7]).toUpperCase();
        const employmentType = cellText(values[8]).toUpperCase();
        const weeklyOffDays = cellText(values[9])
          .split(",")
          .map((day) => day.trim().toUpperCase())
          .filter(Boolean);
        const branchRecord = branchMap.get(branchName.toLowerCase());
        const departmentRecord = departmentMap.get(departmentName.toLowerCase());
        const errors: string[] = [];
        if (!name) errors.push("Full name is required");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid email is required");
        if (!departmentRecord)
          errors.push(`Unknown organization unit: ${departmentName || "blank"}`);
        if (!branchRecord) errors.push(`Unknown branch: ${branchName || "blank"}`);
        if (!LEVELS.includes(level as (typeof LEVELS)[number]))
          errors.push("Invalid organization level");
        if (!GENDERS.includes(gender as (typeof GENDERS)[number])) errors.push("Invalid gender");
        if (!EMPLOYMENT_TYPES.includes(employmentType as (typeof EMPLOYMENT_TYPES)[number])) {
          errors.push("Invalid employment type");
        }
        if (
          !weeklyOffDays.length ||
          weeklyOffDays.some((day) => !WEEKDAYS.includes(day as never))
        ) {
          errors.push("Invalid weekly off days");
        }
        const dateOfBirth = normalizeDate(values[10]);
        if (cellText(values[10]) && !dateOfBirth) errors.push("Invalid date of birth");
        const password = cellText(values[11]);
        if (password && password.length < 10)
          errors.push("Temporary password must be at least 10 characters");

        parsed.push({
          rowNumber,
          name,
          email,
          employeeCode: cellText(values[2]) || undefined,
          departmentId: departmentRecord?.id,
          departmentName,
          homeBranchId: branchRecord?.id,
          branchName,
          designation: cellText(values[5]) || undefined,
          organizationLevel: (LEVELS.includes(level as never)
            ? level
            : "MEMBER") as ImportRow["organizationLevel"],
          gender: (GENDERS.includes(gender as never)
            ? gender
            : "PREFER_NOT_TO_SAY") as ImportRow["gender"],
          employmentType: (EMPLOYMENT_TYPES.includes(employmentType as never)
            ? employmentType
            : "FULL_TIME") as ImportRow["employmentType"],
          weeklyOffDays,
          dateOfBirth,
          password: password || undefined,
          errors,
        });
      });
      if (parsed.length > 500)
        throw new Error("A maximum of 500 employees can be imported at once.");
      if (!parsed.length) throw new Error("No employee rows were found in the workbook.");
      const emailCounts = new Map<string, number>();
      parsed.forEach((row) => emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1));
      parsed.forEach((row) => {
        if ((emailCounts.get(row.email) ?? 0) > 1) row.errors.push("Duplicate email in workbook");
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
            weeklyOffDays: row.weeklyOffDays,
            attendanceMode: "BOTH",
            dateOfBirth: row.dateOfBirth,
            password: row.password,
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
